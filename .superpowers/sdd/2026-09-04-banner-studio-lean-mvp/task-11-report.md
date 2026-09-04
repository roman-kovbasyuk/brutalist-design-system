# Task 11 report — Private assets, durable images, and renderer

## Status and commit

Task 11 is complete. Generated image jobs now cross a private, immutable storage boundary before they can succeed, assets are streamed only after campaign authorization and integrity verification, and the pilot template has a deterministic in-process PNG renderer.

- Feature commit: `68cc4b2 feat: store and render review assets`
- Review hardening commit: `dac201e fix: harden asset durability and rendering`
- Review round-two commit: `77e58d4 fix: enforce renderer and storage deadlines`
- Review round-three commit: `50f4cba fix: bound generated image recovery`
- Review round-four commit: `fix: enforce end-to-end recovery deadline` (this commit)
- Exact storage SDK: `@google-cloud/storage@8.0.1`
- Exact image dependency: `sharp@0.35.4`
- Exact shaping dependency: `fontkit@2.0.4`
- Exact bundled font package: `inter-ui@4.1.1`
- Declared Node engine: `>=22`

## Feasibility spike

The initial pilot spike exposed a false feasibility result: librsvg ignored embedded WOFF2 `@font-face` data and silently rendered a host fallback, so invalid font bytes and all three declared weights produced identical pixels. The corrected spike uses Fontkit 2.0.4 to load and validate the exact Inter UI 4.1.1 files, shape the text, and convert every glyph outline into positioned SVG paths before Sharp 0.35.4 rasterization. No SVG `<text>`, host-font lookup, or remote-font request remains.

The pinned faces are `InterDisplay-Regular.woff2` for weight 400, `InterDisplay-SemiBold.woff2` for 600, and `InterDisplay-Bold.woff2` for 700. Construction rejects missing, unreadable, wrong-face, wrong-PostScript-name, or wrong-weight files.

- Pilot ratio/output: 1080 by 1080 PNG
- Output byte size: 35,913 bytes
- Golden output SHA-256: `e505e233174b40069ad84377bec91b9980db8ebbe3994ab27b7655961c94f917`
- Headline wrap: `Learn Norwegian` / `with confidence`
- Body wrap: `Short, focused lessons built for` / `busy adults.`
- CTA wrap: one line
- Line breaking: preserve explicit newlines, then greedily add whole whitespace-delimited words. Fontkit shapes each candidate with the same glyph advances used to position output paths; exact outline bounds determine placement containment. The layout carries Fontkit's actual glyph `minY`/`maxY` through the SVG-coordinate baseline transform, so descenders and stacked diacritics that cross a placement edge are rejected even when the estimated line box fits. Reject an unbreakable token or a result beyond `maxLines`; use `ceil(fontSize * 1.2)` line height.
- Safe-area rule: every text placement rectangle must be fully contained in the selected ratio's parsed safe area before rendering. Text is also clipped to its declared placement.
- Image rule: decode and validate the private source bytes, then apply a deterministic centered cover crop without distortion. For the 1000 by 1000 spike source into the 504 by 1080 placement, the source crop was `x=266.666667, y=0, width=466.666667, height=1000`.

The implemented renderer keeps those rules and returns a normalized, timestamp-free render manifest with template identity/hash, compiled text lines and font choices, image source hash/crop, and exact output metadata. Repeating the same input in the pinned runtime produces identical bytes and hash.

## Delivered behavior

### Private immutable stores

- `MemoryAssetStore` and `GcsAssetStore` share strict create-only put, byte-read, and cleanup-delete semantics and validate object keys, bytes, and MIME at their boundary.
- GCS uploads are non-resumable, CRC32C-validated, private, cacheable as immutable private content, and protected by `ifGenerationMatch: 0`. No public ACL or public URL is created.
- GCS reads use a CRC32C-validating stream. The caller's remaining deadline arms a timer that destroys a stalled stream, and the caller's expected byte length is enforced while streaming; success, timeout, oversize, provider error, and not-found paths all remove listeners and clear timers.
- Existing keys cannot be overwritten. GCS 409/412 responses normalize to `object_exists`; reads and cleanup normalize not-found without leaking provider detail.
- Test and development default to memory storage. Production requires explicit GCS storage plus project and bucket configuration. Bootstrap owns and idempotently closes the injected store.

### Durable generated images

- The Task 9 image gate is removed only when an asset store is injected. Provider bytes are decoded by the existing strict decoder; persisted MIME, dimensions, byte size, and SHA-256 are all derived from the actual bytes rather than provider metadata.
- Server-generated keys are rooted under SHA-256 campaign and generation-job namespaces, include the server asset ID, and use only the extension derived from the verified MIME.
- Upload completes before database success. One locked transaction verifies the campaign owner and snapshotted visual direction/job relationship, inserts the generated asset, links the direction preview and marks it ready, and stores the final byte-free idempotent response while marking the job succeeded.
- Upload is started only while the persisted deadline still has time remaining and passes the remaining timeout to GCS. After create-only put, the service privately reads the object back and verifies its exact byte length and SHA-256 before attempting persistence. `object_exists` fails closed without registering another owner's object as an orphan.
- Database completion is never raced against a local timer. Before contended locks, the transaction derives the remaining duration from persisted `timeout_at` and PostgreSQL `clock_timestamp()`, then sets transaction-local `lock_timeout` and `statement_timeout`. It rechecks the database clock after the job and dependent locks, refreshes those limits immediately before writes, and guards the final success update with `clock_timestamp() < timeout_at`; an elapsed or lock deadline rolls completion back for the bounded recovery path and can never become late success.
- Every provider/upload/readback/completion fallback now enters one bounded recovery transaction instead of chaining orphan registration and `markUnknown`. Recovery locks the job first, replays a committed success without orphaning its referenced object, then optionally takes the object-key advisory lock, rechecks `NOT EXISTS assets(object_key)`, records the orphan, and persists `unknown` plus its response atomically. A reusable absolute-deadline transaction starts its timer before pool checkout and covers `BEGIN`, the entire operation, `COMMIT`, and error rollback. It destroys a checked-out client when any phase stalls, destroys a client delivered after checkout has already timed out, and releases or destroys at most once. The same budget also drives transaction-local lock and statement timeouts refreshed against a fixed PostgreSQL-clock deadline. If recovery cannot commit, the service exposes non-terminal 503 `generation_recovery_unavailable`; it never returns an authoritative 202 unless the unknown response was actually committed. Normal transactions retain their existing semantics, while all pools also use a 5-second checkout timeout as defense in depth.
- Future orphan cleanup holds the same object lock, rechecks asset references inside its transaction before calling delete, and refuses to delete referenced bytes.
- Migration 009 adds `integrity_version`. Existing pre-009 rows are explicitly backfilled to legacy version 0; new rows default to version 1. A staged `NOT VALID` shape constraint and a version-1-only unique generation-job index preserve previously valid legacy duplicates/incomplete generated rows while rejecting new invalid or duplicate rows. A trigger prevents post-migration inserts from explicitly opting into legacy version 0 and forbids version 1 rows from being downgraded; legacy rows may remain 0 or be upgraded to 1. Image bytes are never written to PostgreSQL or JSON.

### Authorized reads and renderer

- `GET /api/v1/assets/:assetId` requires the normal authenticated active database actor. The repository binds the asset through its campaign and follows existing team-wide visibility for marketer, designer, and admin roles; disabled users and archived campaigns are denied.
- Before storage access, the service enforces a kind-specific MIME allowlist: direction/final images accept PNG, JPEG, or WebP; review images require PNG; manifests require JSON; deliveries require ZIP. It then validates the stored key, privately fetches the object, and verifies byte length and SHA-256 before streaming. Responses carry safe content type and length, a quoted hash ETag, `Cache-Control: private, max-age=31536000, immutable`, and `X-Content-Type-Options: nosniff`. Manifest and ZIP responses force attachment download with a hash-derived server-owned filename.
- Unknown/cross-boundary records, unsafe keys, missing objects, and tampered bytes fail closed without exposing bucket details.
- The renderer strictly parses the manifest and rejects unknown ratio/slots, missing required slots, character/line overflow, unbreakable copy, unsupported image bytes/MIME, non-allowlisted fonts or weights, text below the manifest minimum, and unsafe placement. It uses only bundled Inter 400/600/700, exact canvas dimensions, deterministic centered cover crop, and clipping at every declared layer.

## TDD and verification

- Storage/asset/renderer RED began with missing modules and a 404 route; generation RED retained the Task 9 API gate and had no atomic asset/direction/job commit.
- The first durable integration run exposed three failures caused by a Vitest/jsdom cross-realm Sharp `Buffer` failing `instanceof Uint8Array`; an explicit `Uint8Array` fixture corrected the test boundary. Production provider results already use decoded `Uint8Array` values.
- Focused storage, asset service/route, and renderer GREEN: 4 files, 36 tests passed.
- Focused generation and contract GREEN: 4 files, 40 tests passed.
- Focused configuration, bootstrap, and storage GREEN: 5 files, 41 tests passed.
- Focused PostgreSQL migration and durable image commit GREEN: 3 tests passed (68 excluded by the focus filter).
- Review hardening RED proved ignored/invalid fonts, identical weight output, corrupt storage readback acceptance, orphan registration for `object_exists`, post-deadline upload start, success-plus-orphan on ambiguous commit acknowledgement, expired transaction success, unsafe MIME streaming, and migration failure on valid legacy rows.
- Review hardening focused GREEN: renderer/storage/asset/generation — 5 files, 61 tests passed; PostgreSQL legacy upgrade/race/cleanup — 5 tests passed (69 excluded by the focus filter).
- Review round-two RED proved that real descender/diacritic outlines could cross vertical placement bounds, new rows could explicitly set `integrity_version = 0`, GCS reads ignored caller deadlines and byte caps, and a generated-image transaction could wait on a row lock past `timeout_at` then commit success.
- Review round-two focused GREEN: renderer/storage/asset/generation — 4 files, 59 tests passed; full PostgreSQL repository integration — 75 tests passed.
- Review round-three RED held the completion job row, recovery job row, and orphan object advisory lock beyond the fallback budget. The old sequential fallback exceeded every 200 ms observation window and could only finish after the tests manually released the locks.
- Review round-three focused GREEN: generation service/storage — 2 files, 25 tests passed; full PostgreSQL repository integration — 77 tests passed. The contended cases return the explicit 503 while the persisted job remains pending with no response and no cleanup-eligible orphan; the prior ambiguous-success race still replays 201 with zero orphan.
- Review round-four RED reproduced pool exhaustion with a real PostgreSQL pool limited to one connection: a configured 40 ms recovery stayed unsettled beyond the 200 ms observation window because its budget began only after checkout. Unit REDs also covered late checkout delivery and stalled `BEGIN`, body, `COMMIT`, and `ROLLBACK` phases.
- Review round-four focused GREEN: deadline transaction plus generation service — 2 files, 21 tests passed; full PostgreSQL repository integration — 78 tests passed. The max-one exhaustion case returns non-terminal 503 within the strict 200 ms window while the job is still persisted as pending with no response. Deadline helper coverage is 8 tests, including destroy-on-timeout, late-client cleanup, successful commit, bounded rollback, and the default pool checkout timeout.
- Required PostgreSQL suite: `TEST_DATABASE_URL=postgresql:///banner_studio_test npm test -- --run server shared` — 26 files, 383 tests passed.
- Production build: `npm run build` — application and VitePress builds completed successfully; the existing VitePress large-chunk warning remains.
- Dependency/runtime check: `npm ls @google-cloud/storage sharp inter-ui --depth=0` confirmed 8.0.1, 0.35.4, and 4.1.1 respectively. The verification host was Node 25.1.0; Node 22 compatibility is expressed by the `>=22` engine and the build uses no newer runtime feature.

## Concerns and immutable-version handoff

- No live GCS call was made. Normal verification deliberately used the semantically equivalent memory store; staging still needs a private bucket, credentials, create-only upload/read exercise, and orphan cleanup operation.
- Sharp remains a pinned native dependency. Deployment images must support its published Node 22 runtime binary.
- Rendering is deterministic for the pinned Node/Sharp/font stack; any dependency or font-file change is a rendering-version change and should not silently replace existing review assets.
- If both the recovery job lock and its bounded retry window are unavailable after an ambiguous upload, the API returns 503 and deliberately leaves the job pending rather than inventing a terminal outcome. Without a durable pre-upload intent, that rare path can leave untracked private bytes; bucket-to-database reconciliation is required. This favors a recoverable private leak over any cleanup race that could delete bytes while another transaction is committing their asset reference.
- The amended 009 migration was not deployed anywhere. Only the isolated `postgresql:///banner_studio_test` database was identity-checked and reset so its tracked pre-review checksum could be replaced; no other database was reset.
- Immutable version creation should persist the normalized render manifest and its input asset references, render a new object under a version-owned immutable key, and transactionally bind that object to the newly created version. It should never mutate or reuse a direction preview asset.
