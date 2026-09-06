# Visuals module implementation plan

> **For agentic workers:** Implement sequentially with test-driven development and review each checkpoint. The existing six-module migration is the foundation, not part of this change.

**Goal:** Ship the approved two-method Visuals flow, immediate static generation, durable uploads, prompt copying and isolated retries.
**Architecture:** Keep the campaign runtime and generation control plane. Visuals owns batch orchestration and presentation. Server snapshots validated copy inputs and persists asset linkage. Shared design-system components own repeated layout and controls.
**Tech Stack:** React, Vitest, Fastify, PostgreSQL, Zod, Sharp, existing private asset stores.
**Spec:** `docs/superpowers/specs/2026-09-06-visuals-module-design.md`.

## Global constraints

- No paid generation on mount, brief analysis, copy approval or reload. Only explicit Visuals actions initiate images.
- Append generated results. Never regenerate successful/uploaded images or retry unresolved jobs with a fresh key. An explicit replacement upload swaps only the reference after success and preserves old asset bytes.
- Selected-copy generation validates approved, current, visible copy IDs; campaign-wide generation consumes all current copy and produces exactly three directions.
- Preserve existing authorization, budget limits, revisions, generation fencing and Banners selection. Do not change the page or neighbouring modules.
- Do not stage, commit or overwrite concurrent Copy, architecture or design-system changes. Coordinate shared contract consumers when the Visuals output changes.

## Checkpoint 1 — Direction contracts and persistence

Files: `shared/contracts.js`, new `server/services/visualContext.js`, generation repository/service/providers, `025_visual_assets.sql`, workspace projection and `shared/studioContracts.js`.

- [x] Add a failing real-database test: campaign mode works with generated but unapproved copy; selected-copy mode produces one prompt per approved ID and rejects unknown/unapproved IDs.
- [x] Extend `directionGenerationRequestSchema`: legacy `{}` plus `{mode:'campaign'}` and `{mode:'selected_copy', copyIds:string[]}`. Provider requests add `copies` and mode; selected results carry explicit `copyId`.
- [x] Persist `scope`, `copy_snapshot`, `batch_id`; expose latest image job status without exposing private job inputs. Validate exact counts and copy linkage before persistence.
- [x] Guard image generation against ready assets and pending/unknown jobs for the same direction. Keep existing durable image completion.
- [x] Run `npm test -- --run server/repositories/visuals.integration.test.js server/providers server/services/generationService.test.js server/routes/generation.test.js`.

Expected assertions include `expect(campaignDirections).toHaveLength(3)` and `expect(linked.map(item => item.copy.id)).toEqual([approved.id])`.

## Checkpoint 2 — Durable uploads

Files: new `server/services/visualUploadService.js`, `server/routes/visuals.js`, service wiring in app/bootstrap/demo, API adapter, upload integration tests.

- [x] Write failing tests for valid image upload, read-back bytes, replay, invalid bytes, role/revision rejection and no generation-job creation.
- [x] Implement `uploadVisual({actor,campaignId,input,expectedRevision,idempotencyKey})`. Accept a direction target or explicit campaign/copy target. Limit to 5 MB PNG/JPEG/WebP, verify decoded dimensions/content, use private storage, durable orphan intent and transactional idempotency.
- [x] Expose authenticated POST `/api/v1/campaigns/:campaignId/visual-uploads`, bounded body size, If-Match and Idempotency-Key.
- [x] Keep active jobs fenced. Allow an explicit replacement upload on an editable current card; retain its previous asset until the new one commits and invalidate any selected composition. Preserve explicit copy targeting.
- [x] Run `npm test -- --run server/services/visualUploadService.integration.test.js server/routes/visuals.test.js src/studio/api.test.js`.

## Checkpoint 3 — Independent module commands

Files: Visuals commands/model tests, Visuals input projection and availability, existing module boundary tests.

- [x] Write failing tests for two method inputs, immediate prompt→image dispatch, repeated-click prevention, success preservation, partial failure, unknown-job stopping and missing-only bulk generation.
- [x] Implement `generate(mode)`, `image(directionId)`, `generateAll()`, `upload(target,file)` and existing `select(directionId)` through runtime commands. Use an explicit `onProgress` callback into module-local state; never a generation effect.
- [x] Expose generated/approved copy and latest direction job in Visuals input. Permit campaign-wide visuals before approval without marking Copy complete prematurely.
- [x] Run `npm test -- --run src/studio/campaign`.

## Checkpoint 4 — Shared UI and Visuals states

Files: new design-system option/result layout components, Visuals view/module/CSS, component contract docs and interaction tests.

- [x] Write failing interaction tests for exact empty message, selected count/disabled guidance, both method buttons, three-column result labels, Upload visual, Copy prompt, per-card errors/retry and retained assets during progress.
- [x] Reuse AppButton, existing tokens and WorkflowModuleFrame. Add only missing generic layout patterns to the shared library. Desktop Prompt | Static visual | Video stacks in this order in a narrow container.
- [x] Add accessible file selection, exact clipboard copying with local feedback, video placeholder and ready-image selection for Banners. No fake success or new video endpoint.
- [x] Verify keyboard/read-only states, long prompts, desktop/mobile layout and no auto requests on reload.

## Checkpoint 5 — Verification and handoff

- [x] Run focused backend, provider, module, UI, API and adjacent-chain regressions; build production bundle.
- [x] Exercise both methods, upload, copy prompt and selection in the local demo (no paid provider calls). Inspect desktop/mobile once, batch any fixes, confirm once.
- [x] Review final diff for accidental edits, stale linkage, concurrency, accessibility and generation-cost safety.
- [x] Document module commands, upload limits, persistence and verification results. Report any untested live-provider boundary explicitly.

## Plan review

All six approved states and upload/copy links map to a checkpoint. Shared files are additive and coordinated with Copy/architecture tasks. No page controller changes, provider bypass or new dependency is needed. Generation keys remain per durable job; a browser closing may leave prompt-only cards, which require a fresh explicit bulk action to generate images.

## Verification record — 6 September 2026

- All **1,221 tests / 116 files** passed in the final sole full-suite run, including the final UI fixes. Concurrent whole-repository tests reset the shared test database and must be serialized across tasks.
- Production application and documentation builds passed. Existing documentation chunk-size warning remains.
- Real database cases reach immutable review for campaign-wide, copy-linked, direct-upload and prompt-card-upload visuals. They also cover final partial Copy batches and legacy selection/approval preservation.
- Independent code review found and verified fixes to the Banners lineage consumer, upload provenance, filename normalization, historical-card visibility and bulk count. No findings remain in that reviewed scope.
- Local mock-provider browser checks: three campaign visuals, two copy-linked visuals, durable upload, exact clipboard content, refresh persistence and desktop/mobile layouts. No live provider call or production deployment was made.
- Mechanical UI detector returned no findings. Fresh UI review scored all three requested fixes resolved: approval terminology, original Copy option numbers and card-local upload errors. Visual evidence is in `.impeccable/review/visuals-*.png`.
