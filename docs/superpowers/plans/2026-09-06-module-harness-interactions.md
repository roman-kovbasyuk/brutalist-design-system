# Module Harness Interaction Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Make all current module commands usable in the isolated test/debug harness and protect them with real component interaction tests.

**Architecture:** Preserve the live runtime and module contracts. Extend only the harness's named test action defaults; test real views with deterministic fixture inputs and recorded boundary commands.

**Tech Stack:** React, Vitest, Testing Library.

**Spec:** `docs/superpowers/plans/2026-09-06-integration-handoff.md`, together with the user's approved independently debuggable six-module architecture.

## Global Constraints

- Do not edit production modules, shared contracts, backend, design-system components or other agents' files.
- Work only in the existing integrated-mvp worktree; do not stage or commit while shared owner changes continue.
- Reuse canonical components and named actions. No new product functionality or abstractions.
- Tests must perform real component interactions and observe boundary intent; rendering alone is insufficient.
- Run only focused harness tests; no full suite, browser sessions, paid providers or user demo data.

### Task 1: Restore complete isolated module interaction ports

**Files:**
- Modify: `src/studio/campaign/testing/ModuleHarness.jsx`
- Modify: `src/studio/campaign/testing/ModuleHarness.test.jsx`
- Modify if needed for test-only fixtures: `src/studio/campaign/testing/workspaceFixtures.js`

**Interfaces:**
- Consumes real modules from `moduleRegistry`, `projectModuleInput` and `deriveWorkflowState`.
- Produces recorded `{ moduleId, action, args }` for every invoked default action, retaining custom action overrides and dirty reporting.
- Missing current actions: `refine`, `preparePrompts`, `generateAll`, `upload`, `saveBatch`, `prepareReview`.

- [ ] Write regression interactions that fail against the incomplete harness. At minimum: analyzed Brief chat submit records `refine` with entered instruction and source key; a failed Visuals prepare-prompts state exposes Retry prompt request which records `preparePrompts({retry:true})`; a Banners selection and confirmation records `saveBatch` and then `prepareReview` without undefined callbacks. Use real labels from current views and hand-authored scenario inputs; do not mock the module components.
- [ ] Run `npm test -- --run src/studio/campaign/testing/ModuleHarness.test.jsx` and record the actual failure from missing callbacks. Correct fixture/selector errors before treating a failure as regression evidence.
- [ ] Extend the existing default action list with the six missing names, retaining the existing override spread order and record function. Do not modify the real coordinator or add a production action registry for this test-only fix.
- [ ] Add action smoke coverage for Visuals missing-image bulk generation and upload with a tiny fixture PNG if the current view exposes them; keep fixtures deterministic and no real network. Verify custom overrides still take precedence via the actual interactive action.
- [ ] Re-run the focused harness tests and `workspaceFixtures.test.js`; inspect the diff for accidental production edits.
- [ ] Report changed files, RED/GREEN evidence and any scenario limitations. Do not commit; the controller owns the final verified integration commit.
- [ ] Independent review verifies both isolated-debug contract and meaningful interaction coverage. Fix findings in the same scoped files and rerun covering tests.
