# Task 10 report — Vertex AI Gemini provider

## Status

Implemented the production Gemini adapter, strict provider configuration, step-aware model registry, bootstrap selection, and a no-spend-by-default smoke command. The Task 9 generation lifecycle and durable-image-storage gate remain intact.

- Task commit: `feat: generate campaign assets with Gemini`
- Exact SDK dependency: `@google/genai@2.21.0`

## Delivered behavior

### Gemini adapter

- Added an injected-client/constructible Vertex AI adapter implementing `analyseBrief`, `generateCopy`, `generateDirections`, and `generateImage`; it never accepts or returns generation job IDs.
- Constructible clients use `GoogleGenAI({ vertexai: true, project, location: 'eu', httpOptions: { apiVersion: 'v1' } })`, matching the installed v2.21.0 API.
- Brief, copy, and direction calls request `application/json` with explicit strict JSON schemas. Returned JSON is parsed without fence removal or repair and then validated through the existing strict shared schemas.
- Copy output requires exactly three variants. Direction output requires exactly five directions.
- Deterministic prompt builders isolate untrusted campaign JSON from instructions and explicitly prohibit embedded text or logos in source imagery.
- Image calls use `gemini-3.1-flash-image`, request image-only output, require exactly one inline image, accept only PNG/JPEG/WebP, strictly decode base64, derive dimensions from the encoded image header, and return `Uint8Array` bytes without persistence.
- Prompt/candidate safety blocks become normalized `provider_blocked` results containing category names and no generated content. Known 429 and 503/Unavailable failures become normalized public errors without raw SDK details. Abort and ambiguous transport failures continue to throw so Task 9 records `unknown` after dispatch.
- Usage metadata is accepted only as non-negative safe integers. Text costs use conservative integer EU rates; image costs use conservative integer rates. Missing/untrustworthy usage retains the operation reservation, and every estimate is capped at that reservation.
- Optional provider cleanup is idempotent and participates in runtime shutdown.

### Configuration, registry, and bootstrap

- Production requires explicit `GENERATION_PROVIDER=gemini`; it cannot silently or explicitly select mock.
- Gemini requires `VERTEX_AI_PROJECT_ID`. The only approved location is `eu`; the only approved text and image models are `gemini-3.5-flash` and `gemini-3.1-flash-image`.
- Development/tests retain explicit mock composition with `mock-v1` in `europe-west6`.
- The selected registry has one provider entry and one provider instance. Its Gemini entry carries both the text/default and image model identities.
- Before reservation, the control plane resolves `brief_analysis`, `copy`, and `directions` to `gemini-3.5-flash`, and `image` to `gemini-3.1-flash-image`. Reclaim checks validate the persisted step-specific identity. Unknown models, regions, providers, or steps fail before job creation/reservation.
- The existing Task 9 API image command still returns `image_storage_unavailable` before reservation/dispatch until Task 11 supplies durable storage.

### Smoke command

- Added `npm run smoke:gemini`.
- It exits without constructing a provider or making a call unless `GEMINI_SMOKE_ENABLED=true` and strict Gemini configuration is present.
- It logs only provider/model/region/safety/cost metadata, never the prompt, brief, credentials, bytes, generated content, or raw errors.

## Tests and verification

Strict TDD evidence:

- Initial focused RED: missing adapter/smoke modules plus expected config/bootstrap/registry failures.
- Step-aware model RED: the PostgreSQL test observed an image job incorrectly persisting `gemini-3.5-flash` before implementation.
- Focused GREEN: `npm test -- --run server/providers/geminiProvider.test.js server/providers/geminiSmoke.test.js server/providers/registry.test.js server/app.test.js server/bootstrap.test.js` — 5 files, 37 tests passed.
- Step-aware PostgreSQL GREEN: `TEST_DATABASE_URL=postgresql:///banner_studio_test npm test -- --run server/repositories/repositories.integration.test.js -t "resolves the persisted Gemini model"` — 1 passed, 65 skipped by the focus filter.
- No-spend smoke gate: `npm run smoke:gemini` — reported disabled and made no provider call.
- Required scoped suite: `TEST_DATABASE_URL=postgresql:///banner_studio_test npm test -- --run server shared` — 19 files, 249 tests passed.
- Production build: `npm run build` — application and VitePress builds completed successfully. The existing VitePress large-chunk warning remains.

## Official model and location decisions

- SDK: exact `@google/genai` `2.21.0`, Node-compatible v2 API.
- API: Vertex AI v1 through `httpOptions.apiVersion`.
- Processing location: EU multi-region `eu`, never `global`.
- Text/default model: GA `gemini-3.5-flash`.
- Image model: GA `gemini-3.1-flash-image`; the retiring `gemini-2.5-flash-image` is rejected.

These decisions follow the Task 10 compatibility brief, which records verification against the Google Gen AI JavaScript SDK, Vertex AI quickstart, both model pages, and the Google model lifecycle page on 2026-09-04.

## Concerns and handoff notes

- No paid live smoke was executed in this local task. The opt-in command is present and its disabled path is verified; staging operators must deliberately enable it with credentials and strict configuration.
- Cost estimates intentionally prefer reservation retention over under-accounting. Pricing changes require updating the integer estimator inputs and re-verifying them against official Vertex AI pricing.
- The adapter can generate images directly, and lower control-plane job identity is ready for the image model, but the public/service image command remains gated until Task 11 can atomically store and verify bytes.
