# Task 11 report — Private assets, durable images, and renderer

## Status and commit

Task 11 is complete. Generated image jobs now cross a private, immutable storage boundary before they can succeed, assets are streamed only after campaign authorization and integrity verification, and the pilot template has a deterministic in-process PNG renderer.

- Feature commit: `feat: store and render review assets` (this commit)
- Exact storage SDK: `@google-cloud/storage@8.0.1`
- Exact image dependency: `sharp@0.35.4`
- Exact bundled font package: `inter-ui@4.1.1`
- Declared Node engine: `>=22`

## Feasibility spike

The real pilot fixture was rendered before production implementation with Sharp 0.35.4 and font files from Inter UI 4.1.1. The spike embedded `Inter-Regular.woff2` for weight 400, `Inter-SemiBold.woff2` for 600, and `Inter-Bold.woff2` for 700 in the SVG passed to Sharp; it made no host-font or remote-font request.

- Pilot ratio/output: 1080 by 1080 PNG
- Output byte size: 99,693 bytes
- Output SHA-256: `193dfa4e2c24fde1c1f9cd837077bfe213a639711112977092381b2d7861345b`
- Headline wrap: `Learn Norwegian` / `with confidence`
- Body wrap: `Short, focused lessons built for` / `busy adults.`
- CTA wrap: one line
- Line breaking: preserve explicit newlines, then greedily add whole whitespace-delimited words while measured width fits; reject an unbreakable token or a result beyond `maxLines`; use `ceil(fontSize * 1.2)` line height.
- Safe-area rule: every text placement rectangle must be fully contained in the selected ratio's parsed safe area before rendering. Text is also clipped to its declared placement.
- Image rule: decode and validate the private source bytes, then apply a deterministic centered cover crop without distortion. For the 1000 by 1000 spike source into the 504 by 1080 placement, the source crop was `x=266.666667, y=0, width=466.666667, height=1000`.

The implemented renderer keeps those rules and returns a normalized, timestamp-free render manifest with template identity/hash, compiled text lines and font choices, image source hash/crop, and exact output metadata. Repeating the same input in the pinned runtime produces identical bytes and hash.

## Delivered behavior

### Private immutable stores

- `MemoryAssetStore` and `GcsAssetStore` share strict create-only put, byte-read, and cleanup-delete semantics and validate object keys, bytes, and MIME at their boundary.
- GCS uploads are non-resumable, CRC32C-validated, private, cacheable as immutable private content, and protected by `ifGenerationMatch: 0`. No public ACL or public URL is created.
- Existing keys cannot be overwritten. GCS 409/412 responses normalize to `object_exists`; reads and cleanup normalize not-found without leaking provider detail.
- Test and development default to memory storage. Production requires explicit GCS storage plus project and bucket configuration. Bootstrap owns and idempotently closes the injected store.

### Durable generated images

- The Task 9 image gate is removed only when an asset store is injected. Provider bytes are decoded by the existing strict decoder; persisted MIME, dimensions, byte size, and SHA-256 are all derived from the actual bytes rather than provider metadata.
- Server-generated keys are rooted under SHA-256 campaign and generation-job namespaces, include the server asset ID, and use only the extension derived from the verified MIME.
- Upload completes before database success. One locked transaction verifies the campaign owner and snapshotted visual direction/job relationship, inserts the generated asset, links the direction preview and marks it ready, and stores the final byte-free idempotent response while marking the job succeeded.
- Upload ambiguity preserves the unknown/no-redispatch lifecycle. Upload success followed by persistence failure registers the object for orphan cleanup best-effort and never reports false success. A deadline bounds upload and durability work.
- Migration 009 adds generated-asset shape constraints and a unique generation-job-to-asset relationship. Image bytes are never written to PostgreSQL or JSON.

### Authorized reads and renderer

- `GET /api/v1/assets/:assetId` requires the normal authenticated active database actor. The repository binds the asset through its campaign and follows existing team-wide visibility for marketer, designer, and admin roles; disabled users and archived campaigns are denied.
- The service validates the stored key, privately fetches the object, and verifies byte length and SHA-256 before streaming. Responses carry safe content type and length, a quoted hash ETag, `Cache-Control: private, max-age=31536000, immutable`, and `X-Content-Type-Options: nosniff`.
- Unknown/cross-boundary records, unsafe keys, missing objects, and tampered bytes fail closed without exposing bucket details.
- The renderer strictly parses the manifest and rejects unknown ratio/slots, missing required slots, character/line overflow, unbreakable copy, unsupported image bytes/MIME, non-allowlisted fonts or weights, text below the manifest minimum, and unsafe placement. It uses only bundled Inter 400/600/700, exact canvas dimensions, deterministic centered cover crop, and clipping at every declared layer.

## TDD and verification

- Storage/asset/renderer RED began with missing modules and a 404 route; generation RED retained the Task 9 API gate and had no atomic asset/direction/job commit.
- The first durable integration run exposed three failures caused by a Vitest/jsdom cross-realm Sharp `Buffer` failing `instanceof Uint8Array`; an explicit `Uint8Array` fixture corrected the test boundary. Production provider results already use decoded `Uint8Array` values.
- Focused storage, asset service/route, and renderer GREEN: 4 files, 36 tests passed.
- Focused generation and contract GREEN: 4 files, 40 tests passed.
- Focused configuration, bootstrap, and storage GREEN: 5 files, 41 tests passed.
- Focused PostgreSQL migration and durable image commit GREEN: 3 tests passed (68 excluded by the focus filter).
- Required PostgreSQL suite: `TEST_DATABASE_URL=postgresql:///banner_studio_test npm test -- --run server shared` — 25 files, 349 tests passed.
- Production build: `npm run build` — application and VitePress builds completed successfully; the existing VitePress large-chunk warning remains.
- Dependency/runtime check: `npm ls @google-cloud/storage sharp inter-ui --depth=0` confirmed 8.0.1, 0.35.4, and 4.1.1 respectively. The verification host was Node 25.1.0; Node 22 compatibility is expressed by the `>=22` engine and the build uses no newer runtime feature.

## Concerns and immutable-version handoff

- No live GCS call was made. Normal verification deliberately used the semantically equivalent memory store; staging still needs a private bucket, credentials, create-only upload/read exercise, and orphan cleanup operation.
- Sharp remains a pinned native dependency. Deployment images must support its published Node 22 runtime binary.
- Rendering is deterministic for the pinned Node/Sharp/font stack; any dependency or font-file change is a rendering-version change and should not silently replace existing review assets.
- Immutable version creation should persist the normalized render manifest and its input asset references, render a new object under a version-owned immutable key, and transactionally bind that object to the newly created version. It should never mutate or reuse a direction preview asset.
