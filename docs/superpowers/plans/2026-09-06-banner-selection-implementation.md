# Banner selection implementation plan

**Goal:** Replace the single-composition Banners editor with a persisted multi-design/multi-size preview and review workflow.
**Architecture:** A browser-safe selection model owns combinations and filters; the Banners module owns drafts and commands. The server resolves each selection against campaign-owned copy, visuals, and immutable template manifests. Existing version, review, and delivery pipelines carry the complete batch.
**Tech stack:** React, application design-system components, Vitest/Testing Library, Node/PostgreSQL, existing immutable renderer.
**Spec:** `docs/superpowers/specs/2026-09-06-banner-selection.md` (approved user requirements).

## Global Constraints

- Preserve all unrelated work in this shared dirty feature worktree. Do not stage or commit other agents' changes. No blanket commits, reset, deployment, or external Figma writes.
- Keep Brief → Copy → Visuals → Banners → Review → Distribute; preserve local drafts, captured input keys, authorization, approval gates, and artifact integrity.
- Use app design-system tabs, selects, buttons, dialogs, and cards. New reusable controls are added there before adoption.
- No automatic image/video generation. Video category identifies dimensions; exported review/delivery remains static until a video renderer exists.
- Batch output count is the exact Cartesian product of selected designs and selected sizes; never silently process only the first design.
- Unit tests use no database. Database tests use isolated schemas, not concurrent public-schema reset suites.

### Task 1: Persist and render banner batches

Own backend, shared contracts/catalog and tests only: `shared/contracts.js`, `shared/studioContracts.js`, new `shared/bannerFormats.js`, template manifest catalog if needed, `server/services/versionService.js`, `server/services/deliveryService.js`, related repositories/routes, new migration `027_banner_batches.sql`, focused tests.

1. RED: Add behavior tests for batch save, multiple source pairs, wrong-campaign/stale/invalid pairing rejection, duplicate/empty selections, immutable snapshots, and full batch review/delivery count. Run focused tests and record expected failures.
2. Implement a dedicated `PUT /api/v1/campaigns/:id/banner-batch` with If-Match. Request: `{ designs: [{ templateId, templateVersion, copySetId, copyId, directionId }], ratioIds: [string] }`. Response uses the existing composition response envelope. Resolve slots and all provenance on the server, not client-provided text. Persist `composition.designs` carrying the request identity plus resolved `slotValues`; retain existing first-item composition fields for backwards compatibility only. No list truncation.
3. Extend existing immutable version preparation/render/finalization and delivery to include every design × ratio. Add explicit design identity to render records so equal sizes remain distinguishable. Preserve legacy single-composition versions and all safety checks. Refactor batch helpers into focused files as needed, without rewriting unrelated lineage rules.
4. Add a browser-safe `bannerFormats` array, entries `{ id, name, width, height, categories: string[] }`, using category keys `social`, `google-ads`, `stories`, `video`. Include supported common square, portrait, story, landscape and additional popular dimensions where the renderer can truthfully support them. Published manifests stay immutable; new geometry uses a new version. Expose only selectable/renderable size combinations; never silently fall back to another format.
5. GREEN: Run focused schema/routes/version/delivery tests plus isolated-schema batch integration. Report exact request/response fields, compatibility choices, commands/results and changed files. Do not run the global DB-reset suite.

### Task 2: Selection model and application interface

Own `src/studio/campaign/modules/banners/`, `moduleContracts.js` Banners projection only, `src/studio/api.js` Banners method only, `AnimatedBanner.jsx`, and new reusable DS selection component if required. Preserve other modules' concurrent changes.

1. RED: Isolated selection tests for pairing, deduplication, select all, retaining combinations across filters, exact count, and size filtering. UI tests cover tabs, choosing copy/visual, keyboard selection, confirmation, cancelled handoff, failed-save drafts, stale input keys, read-only state.
2. Add pure selection functions and extend Banners projection to all current copies and ready directions (including copy associations). Use captured source keys and existing runtime commands. Store only identifiers in requests.
3. Render summary, DS tabs, DS filters, template grid, size grid, selected-combination summary and verification dialog. Three columns when space permits, then two/one by container width. Preserve app palette and card treatment. Hover interactions also work with keyboard and touch; reduced motion disables spatial effects.
4. Preview actual supplied manifests, including custom templates, rather than fallback sample artwork. Fetch each required asset through the existing authorized asset gateway; clean up URLs.
5. Confirmation saves the exact batch and prepares review through existing version commands; label the manual Figma handoff honestly. No page orchestration changes and no auto-approval.
6. GREEN: Run focused Banners, module-chain, API and preview tests. Verify legacy consumers where APIs change.

### Task 3: Integrated verification and handoff

1. Run serial regression suite, build, and local smoke test; diagnose failures before changing code.
2. Verify desktop/mobile live Banners states, selection totals, tab filters, confirmation and Review package contents. Use synthetic test data, never mutate the user's current campaign to test.
3. Independent scoped code review and visual finish review; address material findings, document DS component adoption and module contracts.
4. Report implemented behavior, verification, and remaining direct-Figma integration boundary. Do not claim deployment.
