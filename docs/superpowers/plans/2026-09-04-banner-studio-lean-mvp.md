# Banner Studio Lean MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Banner Studio frontend into a persistent, authenticated MVP with real Gemini generation and immutable human-reviewed PNG delivery without changing the three-item sidebar or seven-stage campaign flow.

**Architecture:** One Node 22 Cloud Run container serves the existing React/Vite SPA, VitePress docs, and a Fastify API. PostgreSQL is the system of record, Cloud Storage holds generated and delivered files, and provider/rendering behaviour stays behind small interfaces so queues or separate services can be added only when proven necessary.

**Tech Stack:** React 19, Vite 8, Vitest, Testing Library, Node 22 ESM, Fastify, Zod, PostgreSQL 16 with `pg`, Firebase Admin, `@google/genai` v2 for Vertex AI, Cloud Storage, incremental Tailwind v4 and shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-09-04-banner-studio-lean-mvp-design.md`

## Global Constraints

- Keep exactly three primary sidebar destinations: `Dashboard`, `Templates`, `Design system`.
- Keep campaigns beneath the primary destinations as conversation-like sidebar items.
- Keep the visible stage order: Brief, Copy, AI assets, Banners, designer Review, marketer Review, Assets ready.
- Keep route compatibility for `/`, `/templates`, `/system`, and `/campaign/:id`.
- Do not add a standalone Campaign navigation item or move campaigns to dashboard-only cards.
- No provider credential or unrestricted endpoint/model choice reaches the browser.
- PNG in ZIP is the only live MVP delivery format; the video branch remains visible but unavailable in live mode.
- Every mutating API request uses an `Idempotency-Key`.
- Each module ends at its review checkpoint; do not begin the next module until the user reviews the current one.
- Use test-first development for every behaviour change.

---

## File Structure

### Shared domain

- `shared/canonicalJson.js` — stable JSON serialization and SHA-256 hashing.
- `shared/contracts.js` — Zod enums and entity/API schemas.
- `shared/workflowRules.js` — transition table, role checks, guards, and stale propagation.
- `shared/templateManifest.js` — manifest schema and composition validation.
- `shared/fixtures/pilotCampaign.js` — one valid, reusable pilot fixture.
- `shared/*.test.js` — unit and contract tests.

### Server

- `server/app.js` — Fastify application composition; no `listen` side effect.
- `server/start.js` — process entrypoint and graceful shutdown.
- `server/config.js` — validated environment configuration and allowed regions/models.
- `server/db/pool.js` — PostgreSQL pool creation.
- `server/db/migrate.js` — ordered SQL migration runner.
- `server/db/migrations/*.sql` — schema migrations.
- `server/repositories/*.js` — persistence boundaries for campaigns, jobs, versions, users, settings, and assets.
- `server/services/*.js` — workflow, generation, review, delivery, audit, storage, and rendering orchestration.
- `server/providers/mockProvider.js` — deterministic provider.
- `server/providers/geminiProvider.js` — Vertex AI provider using `@google/genai` v2.
- `server/routes/*.js` — versioned API route plugins.
- `server/auth/*.js` — Firebase verification, invitation lookup, and role policy.
- `server/**/*.test.js` — unit/API tests with injected repositories/providers.

### Frontend

- `src/api/client.js` — typed-by-schema fetch boundary and normalized errors.
- `src/hooks/useCampaign.js` — campaign loading, mutation, and stale-state refresh.
- Existing `src/screens/WorkflowScreen.jsx` — retains the seven visible stages while replacing local simulation stage by stage.
- Existing `src/components/AppShell.jsx` — preserves three items and campaign conversations.
- `src/screens/SettingsScreen.jsx` — admin-only settings surface, reached from an existing appropriate surface rather than a fourth primary nav item.

### Operations

- `Dockerfile` — Node runtime serving API, SPA, and docs.
- `docker-compose.yml` — local PostgreSQL.
- `scripts/build.mjs` — builds SPA and docs for the server image.
- `.github/workflows/ci.yml` — tests and build.
- `docs/runbooks/deploy.md` and `docs/runbooks/rollback.md` — exact commands.

---

## Module 0 — Contracts and Rules

### Task 1: Canonical JSON and content hashing

**Files:**
- Create: `shared/canonicalJson.test.js`
- Create: `shared/canonicalJson.js`

**Interfaces:**
- Produces: `canonicalJson(value): string`
- Produces: `hashCanonical(value): string` returning lowercase SHA-256 hex

- [ ] **Step 1: Write the failing canonicalization tests**

```js
import { describe, expect, test } from 'vitest'
import { canonicalJson, hashCanonical } from './canonicalJson.js'

describe('canonical JSON', () => {
  test('sorts object keys recursively without reordering arrays', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: [3, 1] } }))
      .toBe('{"a":{"x":[3,1],"y":2},"z":1}')
  })

  test('produces the same hash for equivalent key order', () => {
    expect(hashCanonical({ b: 2, a: 1 })).toBe(hashCanonical({ a: 1, b: 2 }))
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- --run shared/canonicalJson.test.js`  
Expected: FAIL because `shared/canonicalJson.js` does not exist.

- [ ] **Step 3: Implement recursive key sorting and SHA-256 hashing**

Use `node:crypto`; reject `undefined`, functions, symbols, non-finite numbers, and circular structures with `TypeError`.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm test -- --run shared/canonicalJson.test.js`  
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add shared/canonicalJson.js shared/canonicalJson.test.js
git commit -m "feat: add canonical campaign hashing"
```

### Task 2: Campaign contracts and pilot fixture

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `shared/contracts.test.js`
- Create: `shared/contracts.js`
- Create: `shared/fixtures/pilotCampaign.js`

**Interfaces:**
- Produces: `roleSchema`, `campaignStatusSchema`, `reviewStatusSchema`
- Produces: `briefSchema`, `copyVariantSchema`, `visualDirectionSchema`, `compositionSchema`
- Produces: `campaignVersionSnapshotSchema`, `campaignSchema`, `generationJobSchema`
- Produces: `pilotCampaignFixture`

- [ ] **Step 1: Add Zod as an exact runtime dependency**

Run: `npm install --save-exact zod@4`

- [ ] **Step 2: Write failing contract tests**

Tests must prove that the pilot fixture parses and that these invalid values fail: an empty campaign title, a status outside the enum, a visual direction without an asset status, a version snapshot without template version, and a non-hex asset hash.

- [ ] **Step 3: Run the tests and verify RED**

Run: `npm test -- --run shared/contracts.test.js`  
Expected: FAIL because the schemas do not exist.

- [ ] **Step 4: Implement the minimum schemas**

Use strict Zod objects. Keep IDs as non-empty strings in Module 0; database UUID enforcement belongs to Module 1. Use ISO datetime strings and lowercase 64-character SHA-256 validation.

- [ ] **Step 5: Add the valid pilot fixture**

Fixture identity: `campaign-fast-track-norwegian`; locale `en`; one selected copy variant; one ready visual direction; one square composition; status `composed`.

- [ ] **Step 6: Run the tests and verify GREEN**

Run: `npm test -- --run shared/contracts.test.js`  
Expected: all contract cases pass.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json shared/contracts.js shared/contracts.test.js shared/fixtures/pilotCampaign.js
git commit -m "feat: define MVP campaign contracts"
```

### Task 3: Workflow transition rules

**Files:**
- Create: `shared/workflowRules.test.js`
- Create: `shared/workflowRules.js`

**Interfaces:**
- Consumes: `roleSchema`, `campaignStatusSchema` from `shared/contracts.js`
- Produces: `transitionCampaign({ campaign, action, actor, input }): TransitionResult`
- Produces: `allowedActions({ campaign, actor }): string[]`
- Produces: `markDownstreamStale(campaign, changedArtifact): Campaign`

`TransitionResult` is `{ ok: true, campaign, event }` or `{ ok: false, code, status, message }`.

- [ ] **Step 1: Write one failing test per allowed transition**

Cover `select_copy`, `select_direction`, `save_composition`, `send_for_review`, `request_changes`, `mark_ready`, `reject`, `approve`, `reopen`, and `deliver`.

- [ ] **Step 2: Write failing tests for forbidden behaviour**

Cover wrong role (`403`), missing guard (`409`), self-approval (`403`), delivery before approval (`409`), and duplicate delivery (`409`).

- [ ] **Step 3: Run the tests and verify RED**

Run: `npm test -- --run shared/workflowRules.test.js`  
Expected: FAIL because the rules module does not exist.

- [ ] **Step 4: Implement a data-driven transition table**

Each transition entry contains `from`, `action`, `to`, `roles`, `guard`, and `eventType`. Keep the module pure: no time, random IDs, database, or network calls. Receive event ID and timestamp through `input` where required.

- [ ] **Step 5: Implement stale propagation**

Changing `brief` marks copy, directions, and composition stale; changing `copy` marks directions and composition stale; changing `direction` marks composition stale.

- [ ] **Step 6: Run the tests and verify GREEN**

Run: `npm test -- --run shared/workflowRules.test.js`  
Expected: every allowed and forbidden case passes.

- [ ] **Step 7: Commit**

```bash
git add shared/workflowRules.js shared/workflowRules.test.js
git commit -m "feat: enforce MVP workflow transitions"
```

### Task 4: Template manifest contract

**Files:**
- Create: `shared/templateManifest.test.js`
- Create: `shared/templateManifest.js`
- Create: `shared/fixtures/pilotTemplate.js`

**Interfaces:**
- Produces: `templateManifestSchema`
- Produces: `validateComposition(manifest, slotValues): { valid, errors }`
- Produces: `pilotTemplateFixture`

- [ ] **Step 1: Write failing validation tests**

Test a valid manifest and failures for unsupported ratio, missing required slot, headline over character limit, and unknown slot.

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- --run shared/templateManifest.test.js`  
Expected: FAIL because the manifest module does not exist.

- [ ] **Step 3: Implement the manifest and validator**

The pilot manifest has `id`, semantic `version`, `name`, `ratios`, and `slots`. Slot types are `text`, `image`, and `cta`; text slots define `required`, `maxCharacters`, and `maxLines`.

- [ ] **Step 4: Run Module 0 verification**

Run: `npm test -- --run shared`  
Run: `npm run build`  
Expected: all shared tests pass and the existing app/docs build succeeds.

- [ ] **Step 5: Commit and stop for review**

```bash
git add shared/templateManifest.js shared/templateManifest.test.js shared/fixtures/pilotTemplate.js
git commit -m "feat: validate versioned banner templates"
```

**Module 0 review checkpoint:** show the user the schemas, transition matrix test names, pilot fixture, and build/test evidence. Do not begin Module 1 without approval.

---

## Module 1 — Local API and Persistence

### Task 5: Fastify application and health boundary

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `server/app.test.js`, `server/app.js`, `server/start.js`, `server/config.js`

**Interfaces:**
- Produces: `buildApp(dependencies): FastifyInstance`
- Produces: `loadConfig(environment): Config`
- Routes: `GET /healthz`, `GET /readyz`

- [ ] Write failing injection tests for health, readiness, invalid config, and request IDs.
- [ ] Run `npm test -- --run server/app.test.js`; verify missing-module failure.
- [ ] Install exact major dependencies: `fastify@5`, `@fastify/static@8`, `pg@8`.
- [ ] Implement `buildApp` without listening and `start.js` with graceful SIGTERM handling.
- [ ] Run the focused tests; verify GREEN.
- [ ] Commit `feat: add Banner Studio API shell`.

### Task 6: PostgreSQL schema and repositories

**Files:**
- Create: `server/db/migrations/001_core.sql`
- Create: `server/db/pool.js`, `server/db/migrate.js`
- Create: `server/repositories/campaignRepository.js`, `settingsRepository.js`, `auditRepository.js`
- Create: repository integration tests
- Create: `docker-compose.yml`, `.env.example`

**Interfaces:**
- Produces transactional repository methods `createCampaign`, `getCampaign`, `updateCampaignState`, `getSettings`, `updateSettings`, `appendAuditEvent`.

- [ ] Write integration tests against PostgreSQL 16 for persistence after reconnect, one open review version, one delivery per version, and append-only event tables.
- [ ] Run the tests; verify missing migration/repository failures.
- [ ] Add the SQL migration with explicit constraints and indexes.
- [ ] Implement repositories using parameterized `pg` queries and injected transaction clients.
- [ ] Run migrations twice to prove idempotent migration tracking.
- [ ] Run focused integration tests; verify GREEN.
- [ ] Commit `feat: persist campaigns and audit records`.

### Task 7: Campaign and settings API

**Files:**
- Create: `server/routes/campaigns.js`, `server/routes/settings.js`
- Create: `server/services/workflowService.js`
- Create: route and service tests

**Interfaces:**
- Routes: `GET/POST /api/v1/campaigns`, `GET/PATCH /api/v1/campaigns/:id`, `POST /api/v1/campaigns/:id/actions/:action`, `GET/PATCH /api/v1/settings`.

- [ ] Write failing tests for CRUD, schema errors, idempotent actions, and forbidden transitions.
- [ ] Implement routes that parse with shared Zod schemas and call the service only.
- [ ] Implement workflow service transaction: load → pure transition → persist → append audit → return.
- [ ] Verify focused tests and restart persistence.
- [ ] Commit `feat: expose persistent campaign workflow API`.

**Module 1 review checkpoint:** create a campaign through HTTP, restart the server, reload it, execute one mock transition, and show the audit row.

---

## Module 2 — Authentication and Roles

### Task 8: Firebase verification and invitation policy

**Files:**
- Modify dependencies with `firebase-admin@13`
- Create: `server/auth/verifyToken.js`, `server/auth/authorize.js`
- Create: `server/repositories/userRepository.js`
- Create: auth and route tests

**Interfaces:**
- Produces: `authenticate(request): Actor`
- Produces: `requireRole(...roles)` Fastify pre-handler

- [ ] Write failing tests for valid invited user, expired token, uninvited email, wrong role, and self-approval.
- [ ] Implement token verification behind an injected verifier so tests never call Firebase.
- [ ] Resolve role and invitation from PostgreSQL on every new session.
- [ ] Add `GET /api/v1/session` and protect all mutation routes.
- [ ] Verify tests and commit `feat: enforce invited user roles`.

**Module 2 review checkpoint:** demonstrate allowed/refused requests for every role without changing the existing sidebar or workflow stages.

---

## Module 3 — Gemini Generation

### Task 9: Provider adapter and deterministic mock

**Files:**
- Create: `server/providers/provider.js`, `mockProvider.js`, provider tests
- Create: `server/repositories/generationJobRepository.js`
- Create: `server/services/generationService.js`

**Interfaces:**
- Produces `generateCopy`, `generateDirections`, `generateImage` with shared result schemas.

- [ ] Write failing adapter contract tests that run against the mock.
- [ ] Implement deterministic fixture-based mock results and schema parsing.
- [ ] Persist pending/succeeded/failed generation jobs around every call.
- [ ] Add idempotency, caps, budget, and kill-switch tests before implementation.
- [ ] Verify and commit `feat: add generation provider boundary`.

### Task 10: Vertex AI Gemini provider

**Files:**
- Add exact compatible `@google/genai@2` dependency
- Create: `server/providers/geminiProvider.js`, `geminiProvider.test.js`
- Modify: `server/config.js`

- [ ] Write failing tests using an injected SDK client for structured copy, five directions, image bytes, blocked output, rate limit, unavailable provider, and invalid schema.
- [ ] Initialize `GoogleGenAI({ vertexai: true, project, location, apiVersion: 'v1' })` server-side.
- [ ] Restrict location and model IDs through config allowlists.
- [ ] Map SDK responses into shared schemas and normalized error codes.
- [ ] Run adapter tests and one opt-in staging smoke command; commit `feat: generate campaign assets with Gemini`.

**Module 3 review checkpoint:** run one campaign through copy and static image generation and inspect the job's model, region, safety, and cost metadata.

---

## Module 4 — Templates and Immutable Review Versions

### Task 11: Asset storage and renderer interface

**Files:**
- Create: `server/storage/assetStore.js`, `gcsAssetStore.js`, `memoryAssetStore.js`
- Create: `server/rendering/bannerRenderer.js`, `inProcessRenderer.js`
- Create: storage/renderer tests

- [ ] Write failing contract tests for private storage, SHA-256 verification, exact dimensions, and deterministic manifest output.
- [ ] Implement memory adapters first, then GCS using `@google-cloud/storage`.
- [ ] Wrap rendering behind `renderComposition({ manifest, slots, ratio })`.
- [ ] Verify tests and commit `feat: store and render review assets`.

### Task 12: Immutable version creation

**Files:**
- Create: `server/repositories/versionRepository.js`, `assetRepository.js`
- Create: `server/services/versionService.js`
- Create: version service and API tests

- [ ] Write failing tests for version 1, open-version conflict, canonical hash, write-once snapshot, and version N+1 after changes.
- [ ] Implement `POST /api/v1/campaigns/:id/versions` transactionally.
- [ ] Store rendered PNGs and manifest before committing the version.
- [ ] Verify and commit `feat: create immutable review versions`.

**Module 4 review checkpoint:** compare the existing preview with stored review PNGs and prove that any changed composition creates a new version.

---

## Module 5 — Human Review and Delivery

### Task 13: Review events

**Files:**
- Create: `server/repositories/reviewRepository.js`
- Create: `server/services/reviewService.js`
- Create: `server/routes/review.js`
- Create: review tests

- [ ] Write failing tests for Figma URL attachment, request changes, mark ready, reject, approve, wrong role, missing comment, and self-approval.
- [ ] Implement append-only review events and derived review status.
- [ ] Add endpoints under `/api/v1/versions/:id/review-events`.
- [ ] Verify and commit `feat: enforce human review gates`.

### Task 14: Delivery ZIP

**Files:**
- Create: `server/services/deliveryService.js`, `server/routes/delivery.js`
- Create: delivery tests

- [ ] Write failing tests for unapproved export, one delivery per version, hash mismatch, ZIP filenames, and manifest contents.
- [ ] Implement export from stored approved assets without re-rendering.
- [ ] Verify and commit `feat: export approved banner packages`.

**Module 5 review checkpoint:** complete the happy and rejection paths, inspect version/audit history, and download a hash-verified ZIP.

---

## Module 6 — Existing UX Integration and Missing States

### Task 15: Freeze the structural UX contract in tests

**Files:**
- Modify: `src/App.test.jsx`
- Create or modify: `src/components/StepRail.test.jsx`

- [ ] Add failing tests for exactly three primary menu items, campaign conversations below them, route compatibility, seven stage labels/order, progressive availability, and revisiting earlier stages.
- [ ] Run focused tests and confirm failures only where the API integration would otherwise disturb the contract.
- [ ] Make the minimum compatibility changes; do not redesign visual components.
- [ ] Verify and commit `test: protect Banner Studio workflow UX`.

### Task 16: API client and staged workflow integration

**Files:**
- Create: `src/api/client.js`, `src/hooks/useCampaign.js`
- Modify: `src/screens/WorkflowScreen.jsx` and existing workspace components one visible stage at a time
- Add component tests per stage

- [ ] Write client error-normalization tests first.
- [ ] Replace local campaign loading with API loading while keeping the current skeleton and stage rail.
- [ ] Integrate Brief, then Copy, AI assets, Banners, Review 1, Review 2, and Assets ready in separate commits; each commit adds failing component tests before code.
- [ ] Show live/mock capability and unavailable-video states without changing stage order.
- [ ] Verify all existing and new component tests after every stage.

### Task 17: Settings and shadcn primitives

**Files:**
- Add Tailwind v4/shadcn configuration
- Create only required `src/components/ui/*` primitives
- Create: `src/screens/SettingsScreen.jsx` and tests

- [ ] Add settings visibility/role tests before the route or dialog exists.
- [ ] Place settings behind an existing Admin affordance, not a fourth primary menu item.
- [ ] Implement provider/model allowlist, caps, budget, and kill switch controls.
- [ ] Match the current design tokens; no broad CSS migration.
- [ ] Verify accessibility and commit `feat: add controlled MVP settings`.

**Module 6 review checkpoint:** compare the live app to the structural UX tests at desktop and mobile widths; review all canonical states and keyboard navigation.

---

## Module 7 — Cloud Deployment and Pilot Hardening

### Task 18: One-container production build

**Files:**
- Modify: `Dockerfile`, `scripts/build.mjs`, `package.json`
- Remove Nginx from the runtime only after route parity tests pass
- Create: production static-serving tests

- [ ] Write failing tests for SPA fallback, `/docs/` clean URLs, `/api/v1`, `/healthz`, and private asset access.
- [ ] Build SPA/docs, copy them into the Node image, and serve through Fastify static routes.
- [ ] Verify route parity and commit `build: serve app docs and API together`.

### Task 19: Google Cloud resources and runbooks

**Files:**
- Create: `scripts/gcloud/setup-staging.sh`, `scripts/gcloud/setup-production.sh`
- Create: `.github/workflows/ci.yml`
- Create: `docs/runbooks/deploy.md`, `rollback.md`, `backup-restore.md`

- [ ] Add shell syntax checks and dry-run assertions before scripts.
- [ ] Script Cloud SQL, bucket, service accounts, Firebase config references, Vertex AI enablement, and Cloud Run deployment.
- [ ] Add CI test/build and staged deployment jobs.
- [ ] Rehearse backup restore, alert test, and one-command traffic rollback.
- [ ] Verify production smoke tests and commit `ops: harden Banner Studio pilot deployment`.

**Module 7 review checkpoint:** deploy a tagged release, complete one real campaign, receive a test alert, restore staging from backup, and route traffic back to the previous revision.

---

## Final Verification

- [ ] Run `npm test -- --run` and record total passing/failing tests.
- [ ] Run `npm run build` and verify both `dist/index.html` and `dist/docs/index.html`.
- [ ] Run the API integration suite against PostgreSQL 16.
- [ ] Run happy and rejection end-to-end flows with the mock provider.
- [ ] Run one opt-in staging flow with Gemini.
- [ ] Verify the three-item sidebar and seven-stage workflow at desktop and mobile widths.
- [ ] Verify production health, docs, sign-in, generation, review, approval, delivery, alerting, backup restore, and rollback.
