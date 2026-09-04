# Task 10 report — Vertex AI Gemini provider

## Status and commits

Task 10 and its review hardening are complete. The Task 9 generation lifecycle and durable-image-storage API gate remain intact.

- Feature commit: `2450da5` — `feat: generate campaign assets with Gemini`
- Review-fix commit: `6c7cb53` — `fix: harden Gemini provider integration`
- Final safety/startup commit: `fix: close Gemini safety gaps`
- Exact SDK dependency: `@google/genai@2.21.0`
- Exact image decoder dependency: `sharp@0.35.4`

## Delivered behavior

### Gemini adapter and safety

- The injected-client/constructible Vertex AI adapter implements `analyseBrief`, `generateCopy`, `generateDirections`, and direct `generateImage` without accepting or returning generation job IDs.
- Constructible clients use `GoogleGenAI({ vertexai: true, project, location: 'eu', httpOptions: { apiVersion: 'v1' } })`.
- Text calls use strict provider JSON schemas and strict shared schemas, without fence removal or repair. Copy output requires exactly three unique IDs; direction output requires exactly five unique IDs.
- Invariant policy is supplied only through `config.systemInstruction`. User content is a fixed delimiter followed by deterministic serialized untrusted data; campaign injection cannot enter the system instruction.
- Safety normalization is tied to the v2.21.0 exported `BlockedReason` and `FinishReason` values. Every real prompt block, including `JAILBREAK`, blocks output. Candidate finish reasons `SAFETY`, `RECITATION`, `BLOCKLIST`, `PROHIBITED_CONTENT`, `SPII`, `IMAGE_SAFETY`, `IMAGE_PROHIBITED_CONTENT`, and `IMAGE_RECITATION` block output.
- Normalized blocked results contain bounded, deduplicated rating and block/finish-reason categories. No text or image bytes survive a block.
- Any prompt or candidate safety rating with `blocked: true` also blocks output even when the sole candidate reports `STOP`; its category is retained and text/image content is discarded.
- Content is consumed only from exactly one candidate with `finishReason: STOP`. Other terminal reasons and candidate counts normalize to `invalid_output`.
- Known 429 and 503/Unavailable failures become sanitized `rate_limited` and `provider_unavailable` results. Abort and ambiguous transport failures still throw so the Task 9 lifecycle records an unknown post-dispatch result.

### Image validation

- Generated base64 is length-bounded before decoding; encoded output is capped at 32 MiB.
- The reusable decoder performs a complete `sharp` decode, allows only PNG/JPEG/WebP, requires decoded format to match MIME, limits dimensions to 4096×4096, and rejects animation/multiple pages.
- Container boundaries are exact: PNG must terminate at a valid IEND chunk, JPEG at its actual final EOI, and WebP at the exact RIFF-declared length. Truncation, corruption, pseudo-headers, MIME mismatch, oversize dimensions/bytes, and trailing data fail closed.
- Tests use real encoded PNG/JPEG/WebP images and a real two-frame animated WebP.

### Configuration, registry, settings, and bootstrap

- Production requires explicit `GENERATION_PROVIDER=gemini` and cannot silently select mock. Gemini requires `VERTEX_AI_PROJECT_ID`.
- The active registry keeps one provider instance/name while storing per-step identities. `brief_analysis`, `copy`, and `directions` resolve to the text model; `image` resolves to the image model before reservation and reclaim checks.
- After migrations and before serving or constructing a provider, every runtime reconciles settings against its selected registry. Development, test, and production Gemini runtimes atomically replace only the untouched `mock/mock-v1/europe-west6`, revision-zero, never-admin-updated seed row with the active Gemini text tuple. Budget, regeneration cap, kill switch, revision, and updater remain unchanged; a selected mock registry is a no-op.
- An already-active persisted tuple is retained. An admin-modified or otherwise conflicting tuple fails startup with a sanitized `generation_settings_conflict`; it is never overwritten.
- Workflow settings writes validate the merged provider/model/region inside the settings transaction against the injected active registry before persistence or audit. Arbitrary and retired tuples are rejected.
- The public/service image command remains gated with `image_storage_unavailable` until Task 11 provides concrete durable storage, even though the provider adapter and registry are image-ready.

### Smoke command

- `npm run smoke:gemini` remains no-spend-by-default and does not construct a provider unless `GEMINI_SMOKE_ENABLED=true`.
- An enabled smoke result with a normalized error or blocked safety verdict now throws a sanitized failure and emits no success metadata. Tests cover 429, 503, and blocked results without raw-detail leakage.

## TDD and verification

- Review RED: the expanded adapter suite initially had 32 failures covering missing system instructions, incomplete enum handling, non-STOP/multiple-candidate consumption, blocked-byte survival, duplicate IDs, and mixed policy/user prompts.
- Decoder RED: the decoder contract initially failed because the reusable decoder did not exist; subsequent real-container cases drove full decode, exact-boundary, animation, corruption, MIME, byte, and dimension checks.
- Settings/smoke RED: regressions first demonstrated arbitrary settings persistence, missing seed reconciliation, and false-positive smoke success.
- Final safety/startup RED: explicit blocked safety ratings were consumed from `STOP` candidates, while development/test/mock bootstrap compositions skipped reconciliation.
- Fresh-runtime PostgreSQL GREEN: `TEST_DATABASE_URL=postgresql:///banner_studio_test npm test -- --run server/repositories/repositories.integration.test.js -t "reconciles the untouched seed in a fresh|generation settings reconciliation"` — 4 tests passed, 66 skipped by the focus filter.
- Focused GREEN: `npm test -- --run server/providers/geminiProvider.test.js server/bootstrap.test.js server/services/generationSettingsService.test.js` — 3 files, 59 tests passed.
- Required PostgreSQL server/shared suite: `TEST_DATABASE_URL=postgresql:///banner_studio_test npm test -- --run server shared` — 21 files, 309 tests passed.
- No-spend smoke gate: `npm run smoke:gemini` — reported disabled and made no provider call.
- Production build: `npm run build` — application and VitePress builds completed successfully; the existing large-chunk warning remains.

## Pinned model and location decisions

- Processing location: Vertex AI EU multi-region `eu`, never `global`.
- Text/default model: `gemini-3.5-flash`.
- Image model: `gemini-3.1-flash-image`.
- Settings store the selected text/default tuple; the server-controlled step-aware registry resolves image jobs to the image model before reservation. Unknown provider/model/location/step combinations fail before spend.

## Concerns and handoff

- No paid live smoke was executed. Staging operators must deliberately enable it with credentials and the strict production tuple.
- `sharp` is a pinned native dependency; deployment images must support its published runtime binaries. Task 11 should reuse `server/images/imageDecoder.js` at the durable-storage boundary.
- Cost estimates deliberately retain the reservation when usage is missing or untrustworthy. Pricing changes require deliberate integer-rate updates and re-verification against official Vertex AI pricing.
- The build still reports the pre-existing VitePress large-chunk warning.
