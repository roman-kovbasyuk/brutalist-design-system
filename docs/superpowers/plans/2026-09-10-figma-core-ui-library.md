# Project-X Figma Core UI Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable Project-X Figma library containing the repository's complete foundations and approved core UI component set.

**Architecture:** Reconstruct the library from the repository's source tokens and component contracts. Create variables and styles first, then dedicated documentation pages, then component sets in dependency order. Preserve the existing Page 1 campaign artifacts and validate every new family structurally and visually.

**Tech Stack:** Figma Plugin API through `mcp__codex_apps__figma_use_figma`, Figma metadata/screenshot tools, repository CSS/TypeScript/React source, and a local JSON state ledger.

**Spec:** `docs/superpowers/specs/2026-09-10-figma-core-ui-library-design.md`

## Global Constraints

- Use the Project-X file `DYRe17Xrx20gbKU2Widv5A`; never create a replacement file.
- Existing `Page 1` campaign screens and symbols remain untouched.
- Variables precede components; semantic variables alias primitives.
- Set explicit variable scopes and source CSS code syntax on every variable; use the exact `--primitive-*` name for primitives and `--v2-*` name for semantic variables.
- Use auto-layout and semantic token bindings for reusable component geometry and visual properties.
- Build one component at a time; never parallelize Figma mutations.
- Use deterministic names and the state ledger at `/tmp/design-system-state-20260910-figma-core-ui.json`.
- Do not invent dark mode, new product states, permissions, runtime behavior, or feature-specific organisms/UI blocks.
- If Figma mutation access remains blocked by the host usage limit, stop and mark the Observatory task `needs attention`; do not approximate or claim completion.

---

### Task 1: Preflight, state ledger, and local Figma reconciliation

**Files:**
- Create: `/tmp/design-system-state-20260910-figma-core-ui.json`
- Read: `docs/superpowers/specs/2026-09-10-figma-core-ui-library-design.md`
- Read: `src/components/design-system/basics/tokens.css`
- Read: `src/components/design-system/foundations/basics-catalog.js`
- Read: `src/components/design-system/components/`

**Interfaces:**
- Consumes: approved spec, Project-X file key, repository source contracts.
- Produces: verified page/library inventory and a resumable `{phase, step, entities, pendingValidations, completedSteps}` ledger.

- [ ] **Step 1: Re-run read-only Figma discovery.** Call metadata for the top-level pages and `Page 1`, call `get_libraries` before any search, and retry the local component/variable/style inventory through the available Figma path.
- [ ] **Step 2: Resolve existing names.** Search the target file for deterministic page names and component names before creation; record exact IDs returned by Figma and classify existing Page 1 symbols as preserved campaign artifacts.
- [ ] **Step 3: Initialize the ledger.** Write the phase and discovered IDs to `/tmp/design-system-state-20260910-figma-core-ui.json`; record any host-limit failure as a pending blocker.
- [ ] **Step 4: Pass the preflight gate.** Continue only if the Figma write path is available and the target file can be read. Otherwise update Observatory and stop.

### Task 2: Create variable collections and primitive foundations

**Figma deliverable:** `Primitives`, `Color`, `Spacing`, `Typography`, `Shape`, `Elevation`, and `Motion` collections with source-aligned modes and variables.

**Interfaces:**
- Consumes: Task 1 ledger and token declarations from `basics/tokens.css`.
- Produces: collection IDs and primitive variable IDs used by Tasks 3–8.

- [ ] **Step 1: Post the Phase 1 Checklist.** Include collection creation, primitive values, semantic aliases, scopes, code syntax, styles, and the variable/style summary exit criteria.
- [ ] **Step 2: Create collections and modes.** Use one `Value` mode for primitives, spacing, typography, shape, elevation, and motion; use one `Light` mode for semantic color roles. Record every collection/mode ID.
- [ ] **Step 3: Create primitive values.** Add the raw palette `neutral/canvas #F4F4F0`, `white #FFFFFF`, `black #000000`, `cyan #79D9FF`, `teal #23A094`, `red #DC341E`, and `gray #595959` in `Primitives`.
- [ ] **Step 4: Create non-color scales.** Add spacing 4/8/12/16/24/32/48/64, typography sizes/line heights/weights, control heights 48/44, icon sizes 16/20/24/32/48, border width 1, radii 4/30/999, shadows 2/4/8px black offsets, z references 20/40/60, motion durations 150/200ms, and the source easing curve.
- [ ] **Step 5: Set primitive scopes and syntax.** Use hidden scopes for primitives where they are not direct consumer tokens; assign `TEXT_FILL`, `GAP`, `CORNER_RADIUS`, `STROKE_COLOR`, `FRAME_FILL`, or `SHAPE_FILL` to consumer-facing variables as appropriate. Set web syntax with the `var(--...)` wrapper using each variable's exact source name: `--primitive-*` for raw palette values and `--v2-*` for semantic values.
- [ ] **Step 6: Create semantic aliases.** Add the source semantic roles: canvas, surface, ink, muted, text-secondary, border, accent, success, danger, error-text, action, on-action, on-danger, on-success, warning-text, warning-surface, warning-border, font, text roles, line roles, weight roles, control/icon roles, shadows, z roles, and motion roles. Alias each to the primitive or semantic source variable rather than duplicating raw values.
- [ ] **Step 7: Create text/effect styles.** Create named text styles for H1–H5, Lead Large, Lead Medium, Body, and Small; create named effect styles for Small, Interactive, and Floating elevation. Bind style values to the variables where the Figma API supports it.
- [ ] **Step 8: Validate and summarize.** Read back every collection, variable, scope, alias, code syntax, and style. Post the variable summary and style list, then update the ledger with completed IDs.

### Task 3: Create file structure and foundation documentation

**Figma deliverable:** The approved page skeleton and foundation specimens.

**Interfaces:**
- Consumes: Task 2 variables/styles.
- Produces: page IDs and foundation documentation used for visual QA.

- [ ] **Step 1: Post the Phase 2 Checklist.** Include the page skeleton, foundation docs, screenshots, and navigation exit criteria.
- [ ] **Step 2: Create pages idempotently.** Create `00 Cover`, `01 Foundations`, `02 Layout`, `03 Components / Actions`, `04 Components / Forms`, `05 Components / Navigation`, `06 Components / Feedback`, `07 Components / Selection`, `08 Components / Content & Data`, `09 Components / Files`, `10 Components / Overlays`, `11 Components / AI`, and `12 Utilities`; do not rename or move `Page 1`.
- [ ] **Step 3: Build the cover.** Add the library title, source repository reference, supported theme note, atomic-level legend, and links/labels for the foundation and component pages.
- [ ] **Step 4: Build foundations specimens.** On `01 Foundations`, create token swatches, type specimens, spacing bars, shape/elevation/motion samples, icon samples, and token names. On `02 Layout`, create isolated examples for Stack, Inline, Grid, Container, Divider, ScrollArea, and Surface.
- [ ] **Step 5: Validate documentation.** Check page names, visible headings, source references, and token bindings with metadata; capture screenshots for `00 Cover`, `01 Foundations`, and `02 Layout`; record page IDs and screenshot validation in the ledger.

### Task 4: Build layout primitives

**Figma deliverable:** Reusable layout components on `02 Layout`.

**Interfaces:**
- Consumes: Task 2 spacing, shape, color, and typography variables.
- Produces: `Stack`, `Inline`, `Grid`, `Container`, `Divider`, `ScrollArea`, and `Surface` components.

- [ ] **Step 1: Create `Stack`.** Use auto-layout vertical direction, a `Gap` property mapped to the source spacing values, and a three-item usage specimen.
- [ ] **Step 2: Create `Inline`.** Use auto-layout horizontal direction with source spacing options and wrapping behavior documented in the description.
- [ ] **Step 3: Create `Grid`.** Create a responsive specimen with minimum item width 280px and a token-bound gap; document that the source component accepts `minItemWidth`.
- [ ] **Step 4: Create `Container`.** Create a max-width property/specimen using the source default 1200px and a centered layout example.
- [ ] **Step 5: Create `Divider`.** Create horizontal and vertical structural variants with the 1px border token and decorative semantics documented.
- [ ] **Step 6: Create `ScrollArea`.** Create a bounded overflow specimen with a visible label and keyboard-accessible focus treatment.
- [ ] **Step 7: Create `Surface`.** Create `Tone=surface` and `Tone=canvas` variants with semantic fills and the source border/radius treatment.
- [ ] **Step 8: Validate the layout page.** For each component, run metadata plus screenshot checks before moving to the next component; record IDs and validation results.

### Task 5: Build actions and form components

**Figma deliverable:** Core action/form component sets on `03 Components / Actions` and `04 Components / Forms`.

**Interfaces:**
- Consumes: Tasks 2–4 variables/layout conventions.
- Produces: source-aligned components with documented properties and states.

- [ ] **Step 1: Create `AppButton`.** Model `Variant=primary|secondary|danger|quiet`, `Size=default|compact`, `IconOnly=true|false`, and `State=default|hover|focus|pressed|disabled|busy`; use an icon instance-swap slot and source heights 48/44. Keep the matrix below the variant cap by separating interaction-state specimens from the main variant set.
- [ ] **Step 2: Create `TextAction`.** Model the compact underlined action with default, focus, disabled, and busy specimens while retaining a 44px target.
- [ ] **Step 3: Create `TextField`.** Model label, hint, error, placeholder/value, focus, disabled, read-only, and invalid specimens using the shared field anatomy.
- [ ] **Step 4: Create `TextArea`.** Reuse the field anatomy with multiline sizing, hint/error content, focus, disabled, read-only, and invalid specimens.
- [ ] **Step 5: Create `CheckboxField`.** Model unchecked, checked, mixed/indeterminate, disabled, hint, and error states; preserve a visible label and accessible mixed-state cue.
- [ ] **Step 6: Create `RadioGroup`.** Create a group component with two/three option specimens and selected, unselected, disabled, focus, hint, and error states.
- [ ] **Step 7: Create `SelectField`.** Model closed native-select anatomy with label, hint, error, disabled, focus, and selected-value specimens; document that it is a native single-select field.
- [ ] **Step 8: Create `SwitchField`.** Model on/off, focus, disabled, hint, and error states with the source switch semantics.
- [ ] **Step 9: Validate each component.** After each creation, run metadata and screenshot checks, inspect 44px targets and contrast, and update the ledger before starting the next component.

### Task 6: Build navigation and feedback components

**Figma deliverable:** Core navigation and feedback sets on `05 Components / Navigation` and `06 Components / Feedback`.

**Interfaces:**
- Consumes: Tasks 2–5 action/field conventions.
- Produces: reusable navigation and feedback components with source-aligned states.

- [ ] **Step 1: Create `Breadcrumbs`.** Model a semantic navigation row with linked, current, and overflow specimens; use icon instance swaps for separators where needed.
- [ ] **Step 2: Create `Pagination`.** Model first/middle/last page states, disabled boundary actions, and the current-page indicator.
- [ ] **Step 3: Create `SegmentedControl`.** Model options, selected/unselected, focus, and disabled states; document that it controls a view and does not own tab panels.
- [ ] **Step 4: Create `Stepper`.** Model complete/current/upcoming/disabled steps and an active-step marker without embedding campaign workflow rules.
- [ ] **Step 5: Create `Tabs`.** Model selected/unselected, focus, disabled, and panel association specimens; keep `TabPanel` as a documented companion pattern.
- [ ] **Step 6: Create `Alert`.** Model `Tone=info|success|warning|danger`, title/body, dismissible, and focus states with non-color-only tone cues.
- [ ] **Step 7: Create `ErrorState`.** Model title, description, optional action, and focusable retry/action treatment.
- [ ] **Step 8: Create `Progress`.** Model determinate and indeterminate states, visible labels, optional value display, and accessible progress semantics.
- [ ] **Step 9: Create `Skeleton`.** Model one-line and multi-line loading placeholders with reduced-motion guidance.
- [ ] **Step 10: Create `StatusBadge`.** Model neutral, success, warning, and danger tones with text labels and no action semantics.
- [ ] **Step 11: Validate each component.** Run metadata and screenshot checks sequentially; verify target sizes, contrast, focus visibility, and status meaning.

### Task 7: Build selection, content, and data components

**Figma deliverable:** Selection/content/data sets on `07 Components / Selection` and `08 Components / Content & Data`.

**Interfaces:**
- Consumes: Tasks 2–6 variables and action/navigation patterns.
- Produces: reusable content and data components with stable slots and source contracts.

- [ ] **Step 1: Create `Combobox`.** Model closed/open, query, selected option, no-results, disabled, and focus specimens; keep option text and selected-value slots editable.
- [ ] **Step 2: Create `MultiSelect`.** Model closed/open, selected chips, removable chip action, empty, disabled, and focus specimens; keep chips distinct from status badges.
- [ ] **Step 3: Create `ActionCard`.** Model label, status, content, persistent action, highlighted, dismissing, and exiting specimens; document that caller-supplied content owns domain behavior.
- [ ] **Step 4: Create `FactGrid`.** Model two-column and one-column responsive layouts, labelled facts, and accent-emphasized cells.
- [ ] **Step 5: Create `InlineText`.** Model display, editing, saving, failed-save, changed-source notice, read-only, required, and multiline specimens with a 44px edit target.
- [ ] **Step 6: Create `SelectionTile`.** Model selected/unselected, hover/focus, disabled, caption, and content-slot states as one pressed surface.
- [ ] **Step 7: Create `BulkActionBar`.** Model no selection, selected count, clear action, and action-slot variants.
- [ ] **Step 8: Create `FilterToolbar`.** Model query empty/entered, result count, clear action, filter slot, focus, and disabled states.
- [ ] **Step 9: Create `Table`.** Model header/body/footer, selected row, empty state, horizontal overflow, caption, and action-cell slots; do not invent sorting/filtering behavior absent from the source contract.
- [ ] **Step 10: Validate each component.** Check metadata, screenshot, responsive layout, action target sizes, and data hierarchy after every component.

### Task 8: Build file, overlay, and AI components

**Figma deliverable:** File components on `09 Components / Files`, overlay components on `10 Components / Overlays`, and AI components on `11 Components / AI`.

**Interfaces:**
- Consumes: Tasks 2–7 variables, actions, fields, feedback, and layout.
- Produces: reusable file/overlay/AI components with states documented but no runtime behavior invented.

- [ ] **Step 1: Create `FileDropzone`.** Model idle, drag-over, selected/error, disabled, and focus states with upload affordance and source acceptance guidance.
- [ ] **Step 2: Create `FileList`.** Model empty, one-file, multiple-file, removing, and error rows with accessible remove actions.
- [ ] **Step 3: Create `Dialog`.** Model closed trigger, open modal, title/description, close action, focus containment, and Escape/restore notes.
- [ ] **Step 4: Create `Drawer`.** Reuse the dialog anatomy with left/right/top/bottom side variants and responsive open/close specimens.
- [ ] **Step 5: Create `Popover`.** Model closed/open, side, alignment, trigger focus, and bounded content.
- [ ] **Step 6: Create `Tooltip`.** Model hidden/visible, focus/hover, side, and non-essential helper content; document that essential instructions remain visible elsewhere.
- [ ] **Step 7: Create `Menu`.** Model closed/open, selected/disabled menu items, keyboard focus, and destructive item tone without inventing menu actions.
- [ ] **Step 8: Create `AIResult`.** Model title, result content, optional action, loading/empty/error/ready content supplied by the caller.
- [ ] **Step 9: Create `AITaskStatus`.** Model pending, success, error, and determinate-progress states with text labels and optional progress value.
- [ ] **Step 10: Validate each component.** Run metadata and screenshot checks sequentially; verify overlay layering, focus representation, contrast, and non-color-only states.

### Task 9: Integration QA and handoff

**Figma deliverable:** Fully validated, documented library with final screenshots and a complete state ledger.

**Interfaces:**
- Consumes: all page/component/style/variable IDs from Tasks 1–8.
- Produces: final QA report, screenshots, and Observatory ready report.

- [ ] **Step 1: Run the Phase 4 Checklist.** Include Code Connect availability, accessibility, naming, binding, screenshot, and handoff checks.
- [ ] **Step 2: Run the naming audit.** Confirm deterministic page/component names, no duplicate library nodes, no unnamed reusable nodes, and source-aligned variant/property names.
- [ ] **Step 3: Run the binding audit.** Inspect every reusable component for unresolved fills, strokes, text styles, spacing, radius, and effect values; allow hardcoded geometry only where the spec permits it.
- [ ] **Step 4: Run the accessibility audit.** Confirm contrast, 44px minimum interactive targets, visible focus specimens, readable status labels, and no essential information conveyed by color alone.
- [ ] **Step 5: Capture final screenshots.** Capture every created page and representative component-family specimen; record screenshot references and validation notes in the ledger.
- [ ] **Step 6: Check Code Connect.** If the Figma connection exposes reliable mappings, add mappings for the repository source paths; otherwise record that no mappings were available and keep the library complete without fabricated links.
- [ ] **Step 7: Update Observatory.** Re-read the task, attach the final verification note, and set the task to `ready` only after Figma metadata and screenshots confirm the approved outcome. If any required validation is blocked, set `needs attention` with the exact blocker.

## Verification commands and tool calls

Repository source verification is read-only for this Figma task:

```sh
node observatory/cli.mjs list
node observatory/cli.mjs get c521237a-bbaa-455e-be02-aabb8c02c383
```

Every mutation call must use the loaded Figma skills, one page context per call, and return all created or changed node IDs. The implementation agent must use `get_metadata` after each component and `get_screenshot` after each page/component family. No application source files are modified by this plan.
