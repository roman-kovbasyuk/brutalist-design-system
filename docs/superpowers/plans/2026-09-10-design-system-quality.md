# Design-system Quality Implementation Plan

> **For agentic workers:** Execute inline task-by-task with test-first checkpoints; use an independent reviewer at the final gate. The executing-plans skill is not installed, so its batch/checkpoint workflow is followed directly.

**Goal:** Satisfy the approved quality acceptance checklist without changing the visual design or adding product functionality.

**Architecture:** One native tab interaction owner serves public Tabs and legacy PillTabs adapters. Gallery specimens use isolated in-memory draft state. Dormant details and source-export features are removed rather than exposed as unfinished interfaces.

**Tech Stack:** React, TypeScript/JSX, Vitest, Testing Library, Vite, npm tarball fixtures.

**Spec:** [Approved quality design](../specs/2026-09-10-design-system-quality-design.md).

## Global constraints

- Preserve current appearance, routes, public imports and supported compatibility entry points.
- No product workflows, provider requests, Figma changes, package publishing, commits or pushes.
- Keep draft text out of URLs and persistent stores.
- Do not delete tests to hide failures; remove tests only with deliberately removed implementation.

## Task 1: Canonical tabs

Files: `components/navigation/Tabs.tsx`, `molecules/PillTabs.jsx`, their tests, and shared `pill-tabs.css` under `src/components/design-system/`.

- [x] Write regressions for differing values/labels, duplicate labels, disabled navigation, matching panel visibility, two distinct group prefixes, and legacy callbacks/IDs. Core assertion: `expect(document.getElementById(tab.getAttribute('aria-controls'))).toBe(panel)`.
- [x] Run `npm run test:run -- src/components/design-system/components/navigation/navigation.test.tsx src/components/design-system/AtomicContracts.test.jsx` and observe the new failures.
- [x] Implement `Tabs`, `TabPanel`, and internal `tabIds(prefix, value)` in the typed owner. Map legacy label APIs to that owner while retaining legacy slug IDs. Arrow keys/Home/End move only among enabled items; disabled buttons stay visible and non-activatable.
- [x] Rerun focused tests and typecheck.

## Task 2: Interactive, isolated specimens

Files: `src/workbench/components/FamilyGallery.tsx`, state modules, `DesignSystemWorkbench.tsx`, registry renderers, and new gallery interaction tests.

- [x] Add real integration tests: open/close dialog and popover with Escape and focus return, toggle a checkbox and tile, change tabs and combobox, edit a prompt, isolate two examples, and verify navigation/draft privacy. Core assertion: after `user.click(Open dialog)`, `screen.getByRole('dialog', {name:'Archive draft'})` is visible.
- [x] Run the tests against current code and verify missing state updates cause failures.
- [x] Supply current draft state and an actual per-example callback from the gallery. Merge defaults with draft values for controls; keep drafts in memory. Retain useful state infrastructure only where the live gallery uses it.
- [x] Give controlled examples working local callbacks; mark externally unavailable actions as demonstration-only. Pair tab examples with real panels.
- [x] Rerun tests and inspect the live interactions.

## Task 3: Remove dormant surfaces and correct docs

Files: unused `src/workbench/details/`, `export/`, obsolete state/metadata fields if no live consumer, `docs/design-system/releases.md`, ownership docs.

- [x] Trace imports from the app and package entry and inspect all callers before deleting each target.
- [x] Remove dormant details/context-export implementation and its exclusive tests/styles. Remove unused code-generation metadata so incorrect package names or invalid snippets are not presented as a supported feature.
- [x] Keep supported compatibility exports and useful validation tooling; document their disposition.
- [x] Update release/ownership documentation and confirm all relative links resolve.
- [x] Run the complete source suite and typecheck to detect broken imports or contracts.

## Task 4: Package, browser, and final acceptance

Files: `fixtures/package-consumer/src/App.tsx`, verification scripts/tests as needed, validation documentation.

- [x] Extend the consumer to render public Tabs/TabPanel with distinct labels and values; retain package-root imports and public CSS only.
- [x] Run typecheck, source tests, library build, script tests, artifact verification, fresh packed-consumer installation/build, and workbench build.
- [x] Run the Observatory harness; investigate supported-runtime results separately from library failures without silently waiving a failed command.
- [x] Inspect desktop and narrow layouts, catalog and workbench, overlay focus, disabled states and repaired interactions. Record measured widths and observed results.
- [x] Obtain independent read-only review, address substantive findings, rerun affected checks and audit every row of the approved acceptance table.
- [x] Record final evidence and limitations, leave changes uncommitted for the user, and mark the goal complete only if all in-scope requirements are verified.
