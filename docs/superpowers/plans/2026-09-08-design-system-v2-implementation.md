# Design System v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development when delegation is selected, or execute inline task-by-task with review checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking. Read this plan and the relevant stage plan before editing.

**Goal:** Deliver a portable, product-independent neobrutalist UI library with grouped galleries, working code examples, and reusable application blocks for design engineers and less experienced developers.

**Architecture:** Basics → Components → UI Blocks is the common source and browsing structure. Independent component APIs feed a typed example registry; the workbench presents related examples together, with optional in-place Code/Adjust details. Consumer applications own their data, requests, permissions and workflows.

**Tech Stack:** Existing React 19, Vite 8, plain CSS, Radix, Lucide, Vitest and Testing Library; incremental TypeScript; Storybook for isolated stories; Playwright and axe for browser verification. Preserve existing dependency versions unless a documented compatibility issue requires a change.

**Spec:** [Assessment, decisions and 42-row inventory](../../design-system/v2-assessment-and-proposal.md). User corrections in the conversation take precedence: approachable categories; no product coupling; grouped comparison instead of one page per component.

## Global Constraints

- “Use three understandable categories throughout the library and workbench: **Basics, Components, UI Blocks**.”
- “The system is independent of any product.”
- “Preserve solid color, black structural rules, hard elevation, and tactile microinteractions.”
- “The default browsing unit is a **family gallery**, not an individual component page.”
- “Clicking a preview exercises that component; it must not unexpectedly select a specimen or open documentation.”
- “Change the details presentation without remounting examples or discarding their local state.”
- “Keep compatibility exports during migration.”
- Use shared controls and layouts from `src/components/design-system/`; add missing shared behavior there before using it in the workbench.
- Keep the off-white/white/black/cyan/teal/red identity, 4px standard corners, 44/48px control targets, and 150/200ms motion defaults. Document role additions, not an unsolicited visual redesign.
- No product imports, remote API calls, authentication, generated AI requests or booking services in examples.
- Preserve all unrelated working-tree changes. Deleted product files are not to be restored. Historical product documentation is cleanup evidence, not a feature specification.
- All commands and paths in these plans are relative to `/Users/roman/Documents/Dev/tools/brutalist-design-system` unless stated otherwise.
- Planning authorizes no package publication, deployment or automatic commit of the existing working tree. During execution, review and commit only the named task files, never `git add .`.

## Release structure

| Stage | Execution plan | Depends on | Working deliverable |
| --- | --- | --- | --- |
| A — Portable core | [Core plan](2026-09-08-design-system-v2-core.md) | Existing repository | Typed shared controls and styles working without catalog/product wrappers; reusable layout/navigation/details building pieces |
| B — Grouped workbench | [Workbench plan](2026-09-08-design-system-v2-workbench.md) | A | Basics, Buttons, Inputs and Selection galleries; cross-family search; in-place code/options; settings block; copied code running in an isolated consumer |
| C — Application coverage | [Components and blocks plan](2026-09-08-design-system-v2-blocks.md) | B | Broader controls, four complete UI Blocks, agent context export, package-consumption and release checks |

**First release boundary: A + B.** It must finish the complete browse → compare → adjust → copy → run journey. C adds application breadth; it is not required to prove the first release. The “Later” inventory remains a separate demand-led backlog, not hidden work inside these tasks.

Execute A1–A6, B1–B6, then C1–C9 in order: **21 tasks total**. Each task has its own reviewable deliverable. No concurrent edits to the registry, public export file or shared CSS without explicit coordination. Product integration is a separate project after the public API works.

## File ownership

| Location | Responsibility |
| --- | --- |
| `src/components/design-system/basics/` | Token values, typography, scoped base styles, layout helpers |
| `src/components/design-system/components/` | Canonical controls, interaction behavior, CSS, tests and example modules |
| `src/components/design-system/ui-blocks/` | Generic complete sections/pages, with state supplied through props and callbacks |
| `src/components/design-system/index.ts` and `styles.css` | Deliberate consumer entry points; no workbench imports |
| `src/workbench/registry/` | Serializable component documentation and typed family/example definitions |
| `src/workbench/` | Routing, search, gallery composition, example state and details UI |
| `src/examples/consumer/` | Fresh-app source-consumption proof using only the public API and stylesheet |
| `tests/browser/` | Browser interactions, accessibility and visual baselines |
| `scripts/` | Registry validation, generated-example checks and package proof; directory is currently absent and will be created |
| `.storybook/` | Story configuration, reading the same example components as the gallery |

Old `atoms/`, `molecules/`, `organisms/` and flat paths stay as compatibility re-exports when their implementations move. Do not perform an all-at-once directory rename. Port only the families owned by the active task.

## Execution baseline and verification policy

- [ ] Record `git status --short`, active branch and `node --version`; inspect local instructions. If isolation is needed, use the using-git-worktrees skill at execution time and explicitly preserve the current uncommitted design-system extraction as the starting state. Do not start from a stale default branch.
- [ ] Run `npm run test:run` and `npm run build`. The earlier assessment recorded 60 passing tests in 9 files; repeat once at execution because the tree may have changed.
- [ ] For behavioral changes, write the task's failing behavior test and confirm the intended failure before implementation. A missing import during the initial red step is expected, but replace it with an observable behavior failure once the surface exists.
- [ ] Test behavior, state ownership and consumption; do not add tests that only assert incidental CSS text or mirror implementation details. Replace existing CSS-string assertions only when their responsibility is covered by semantic/browser checks.
- [ ] Every UI family receives labelled/default, focus, disabled and relevant pending/error examples. Verify actual keyboard interaction and reduced motion; static forced-state specimens are clearly labelled.
- [ ] Run each task's targeted tests, then stage acceptance once. Do not repeat broad tests without a new change or unresolved failure.
- [ ] Inspect desktop and narrow layouts in one batched pass; fix findings together and confirm once. Do not claim full accessibility compliance from an automated scan.
- [ ] Keep `npm run build` producing `dist/` for the existing site. Library artifacts and consumer proofs use separate output directories and cannot overwrite it.

## Routing and preview decisions

Use query-based routes under the existing deployment base: `?section=components&family=buttons&example=primary&view=code`. The spec's `/components/buttons` path was illustrative. Query routes allow static-host refresh without a new server rewrite requirement. Derive links from `import.meta.env.BASE_URL`; preserve the existing `section=basics/components/ui-blocks` entry points and map recognized old anchors to current examples.

A stable example key is `familyId/exampleId`. Keep configuration and meaningful input drafts above the responsive details container. Gallery previews remain mounted during inspection, resizing and same-family selection. Retain cross-family serializable drafts in memory for the session. Files remain in memory, never in a shared URL. URL options are allowlisted enums/booleans; edited free text is excluded.

Preview-area breakpoints: at least 1120px for side details with a usable gallery; 640–1119px for details below the selected row; below 640px for a labelled modal sheet. Determine layout from available content width, not just window width. Tokens or a single layout constants module own these thresholds. Drawer infrastructure is shared; the workbench owns only composition.

Do not migrate a live preview into a different React tree to expand it. Expand its stable host using layout; keep the same component identity. Put responsive examples in container-aware hosts. Whole-viewport behavior is verified in Storybook/browser tests; a narrow box is not advertised as viewport emulation.

## Inventory coverage

Every inventory row is assigned below. “Later” work has an explicit entry condition rather than an invented implementation.

| Inventory area | Implementation tasks |
| --- | --- |
| Colors; typography; spacing/sizing; borders/elevation | A1, B2 |
| Motion/interaction; accessibility | A1–A6, B4, B6, C9 |
| Layout | A2 |
| Icons | B2, C9 |
| Buttons/text actions | A3, B2–B4 |
| Inputs/field structure; checkbox/radio/switch | A4, B2–B4 |
| Select/combobox/multiselect | A5, C1 |
| Tabs/view switching/steps | A5, C1 |
| Sidebar/breadcrumbs/pagination | A5, B3, C3 |
| Dialogs/confirmations; menus/popovers/tooltips/drawers | A6, C2 |
| Status/alerts/notifications; loading/empty/error | C2 |
| Cards/facts/selection; inline editing | C4 |
| Tables/filtering/bulk actions | C3 |
| File upload; AI input/results | C5 |
| Settings/edit-form block | B5 |
| App layout | A2, C6 |
| Item browser; item detail; AI workspace | C6, C7, C8 |
| Workbench galleries; search/navigation | B1–B3 |
| Workbench Code/Adjust; state/responsive previews | B4, B6 |
| Workbench usage/readiness | B1, B4, C9 |
| Coding-agent context | C9 |
| Public API/style portability | A1–A6, B5, C9 |
| Automated quality checks | A3, B6, C9 |
| Distribution/maintenance | B5, C9 |

## Later backlog

| Item | Entry condition | Required outcome when scheduled |
| --- | --- | --- |
| Full dark theme and compact/comfortable density | Core tokens and representative blocks are stable; an adoption need is confirmed | Verified color pairs, focus, elevation, controls and data-density rules across all Stable entries |
| Date/time, currency, color, rating and range controls | A consumer or chosen UI Block needs the control | Its own bounds, locale/timezone, form and keyboard contract; no promotion of a demo by renaming it |
| DataGrid, charts, rich text, trees and collaboration | A concrete workflow defines interactions and data scale | Specialist implementation behind a shared styled API, accessible fallback and performance proof |
| Dashboard and sign-in blocks | A representative consumer use case is selected | Complete UI states with external data/auth callbacks; no bundled authentication or analytics service |
| Scheduling | Scheduling is chosen as a supported generic use case | Configurable dates, timezones, availability and confirmation states; no booking service |

## Review and release gates

| Gate | Evidence |
| --- | --- |
| A complete | Core controls render and behave in a page importing only the public stylesheet/API; compatibility imports still work |
| B complete | Compare Buttons/Inputs without navigation; Code/Adjust works in place; keyboard and refresh/deep-link checks pass; configured settings example compiles in the isolated consumer; gallery input survives responsive changes |
| C complete | Four blocks have deterministic loading/empty/error/ready stories; all supported snippets compile; a tarball installs into a consumer with no source alias; agent exports match current contracts |
| Stable designation | Typed API, working links/examples, source/dependency validation, tested keyboard behavior, relevant automated accessibility checks and reviewed visual baselines |

No entry receives an “accessible” or “Stable” badge solely because it uses Radix or passes a build. Unsupported features remain absent or explicitly Experimental.

## Technical references checked for this plan

- [Storybook React/Vite](https://storybook.js.org/docs/get-started/frameworks/react-vite): isolated React examples with the existing build tool.
- [Storybook Vitest integration](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon): keep story tests in a dedicated project so existing jsdom tests remain intact.
- [Vite library mode](https://vite.dev/guide/build#library-mode): separate library output and consumer entry points.
- [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog): controlled overlays and focus behavior behind shared styling.

Dependency installation belongs to execution. Inspect peer and engine requirements then pin the selected compatible versions in the lockfile. No new dependencies were installed during planning.
