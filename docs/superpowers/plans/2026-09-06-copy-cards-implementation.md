# Copy cards implementation

Approved design: `../specs/2026-09-06-copy-module-design.md`.

Scope: Copy owns its cards, approval, removal, preview and append commands. Preserve the six-module page and existing campaign permissions, revision checks, generation budgets and idempotency.

## 1. Persistent options
- [x] Add independent `approved_candidate_ids` to copy sets; retain immutable generation history and soft deletion.
- [x] Add a revision-checked approval endpoint, service and command. The first approval supplies the existing banner selection; subsequent approvals do not replace that selection or invalidate its composition.
- [x] Return visible options oldest first, with approved IDs filtered to visible candidates.
- [x] Reserve up to five visible slots per copy-generation job, including pending/unknown reservations. Enforce 30 visible options on the server; deletion frees a slot. Providers retain their five-option response contract; the final partial batch publishes only its reserved slots.
- [x] Supply earlier headlines to generation so additional batches explore different wording.

## 2. Cards and interactions
- [x] Add shared design-system action-card, empty-state and preview-dialog patterns, using existing buttons and motion tokens.
- [x] Replace Copy tabs/table with cards; expose Approve/Delete on hover, focus and touch, with persistent Preview.
- [x] Keep mutations failure-safe, preview generation-free and lazy-loaded, and animations reduced-motion aware.
- [x] Put Generate More Options below the cards. Append without re-analyzing Brief or clearing approvals; disable at 30.
- [x] Render the default Copy guidance even before Brief is complete. Initial five options continue to come from the existing Brief coordinator.

## 3. Verification
- [x] Run failing behavioral tests before implementation: persistence, independent approvals, ordering, limit/reservations/replay, cards, preview and failures.
- [x] Run targeted frontend, contract, route and PostgreSQL integration tests; then full relevant suites and production build.
- [x] Check desktop/mobile layout and preview focus in the browser; verify reduced-motion behavior in isolated tests. Hover/focus/coarse-pointer rules share one canonical component. No existing campaign content changed during browser verification.
- [x] Verify the downstream review-version consumer accepts the new Copy reservation metadata (coordinated with the Visuals integration owner).

## Verification checkpoint, 6 September 2026

179 focused tests pass across 17 files. The full shared-checkout run passed 1195 checks; its five failures were new Visuals command tests under concurrent implementation. App and documentation builds pass; documentation retains a large-chunk advisory. Browser checks confirmed five saved cards, per-card modal preview, Escape focus restoration, no console errors and no card-header overflow at 390px. API3010 restarted with migrations024/025; review-locked artifacts are not backfilled or rewritten.

Review fixes: explicit reuse of an already-approved card after deletion of the selected card; stale-source guidance without blocking retries of a successfully analyzed Brief; same-key generation reconciliation at capacity. The existing coordinator's one-time creation marker and no-generation-on-remount tests remain intact; durable recovery of an interrupted analysis-to-copy handoff across a browser restart is not newly implemented here.

Downstream verification: 25 tests across six files pass, including the real-database Visuals/version suite. Copy's final partial batch records `copySlots: 2`, publishes exactly two candidates, and reaches `in_review` through the regular composition/version path. The Visuals integration owner also added a sixth version case for legacy selected-copy approval: linked generation and selection now use the same effective approvals as the workspace projection. An authorized linked-visual selection preserves the old implicit approval before moving the banner selection, so approving and using option B does not lose option A's approval. Review-locked history remains untouched.

Handoff: the integration owner verified all six downstream version cases after the legacy approval-preservation fix (14:34), including the partial batch. The latest full run from this task passed 1216 checks and caught that regression before its fix; final serial full-suite sign-off and the final backend restart belong to the parallel integration owner. The API readiness endpoint is healthy.
