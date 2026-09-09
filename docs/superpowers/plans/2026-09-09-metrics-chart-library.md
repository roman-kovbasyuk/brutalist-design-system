# Metrics Chart Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable token-driven SVG chart primitives, demonstrate them in the Components Metrics catalog, and expose the same chart family as UI blocks.

**Architecture:** Create a focused `charts/` library with pure geometry helpers and React primitives. Keep all chart styling in a chart stylesheet that consumes existing `--v2-*` tokens. Compose the primitives in a Metrics specimen first, then register the same components in the UI-block catalog without duplicating rendering logic.

**Tech Stack:** React 19, JSX, inline SVG, CSS custom properties, Vitest, Testing Library, Vite.

**Spec:** `docs/superpowers/specs/2026-09-09-metrics-chart-library-design.md`

## Global Constraints

- Keep the first pass dependency-free; use SVG geometry and existing design tokens.
- Charts must expose an accessible name and concise text summary; color cannot be the only data signal.
- Use white surfaces, thin borders, existing spacing/radius/color tokens, and the catalog’s responsive container rules.
- Keep chart primitives in `src/components/design-system/`; catalog and UI-block files consume them.
- Static specimen data only; do not add data fetching or campaign state.
- Use test-first steps for every behavior change.

## File map

- Create `src/components/design-system/charts/ChartFrame.jsx`: shared title, summary, legend, and chart surface shell.
- Create `src/components/design-system/charts/chart-primitives.jsx`: `PieChart`, `BarChart`, `LineChart`, and `TokenBurnHeatmap` SVG renderers plus safe geometry helpers.
- Create `src/components/design-system/charts/MetricWidget.jsx`: compact metric widget with optional trend.
- Create `src/components/design-system/charts/charts.css`: token-based chart layout, SVG, legend, and responsive styles.
- Create `src/components/design-system/charts/charts.test.jsx`: rendering, accessibility, and empty/zero data tests.
- Modify `src/components/design-system/examples/DataSpecimens.jsx`: replace the plain Metrics trio with the chart showcase composed from shared primitives.
- Modify `src/components/design-system/examples/UIBlocks.jsx`: register a chart dashboard block that consumes the same primitives.
- Modify `src/screens/DesignSystemScreen.test.jsx`: assert Metrics and UI-block chart labels are present and the shared chart class names are loaded.

### Task 1: Create chart primitive contracts and failing tests

**Files:**
- Create: `src/components/design-system/charts/charts.test.jsx`
- Create: `src/components/design-system/charts/chart-primitives.jsx`

**Interfaces:**
- `PieChart({ data, variant = 'filled', label })` renders an SVG and a visually hidden summary; `data` is `{ label: string, value: number, color?: string }[]`.
- `BarChart({ data, label })` renders `{ label: string, value: number }[]` with labeled bars.
- `LineChart({ data, label })` renders `{ label: string, value: number }[]` with labeled points.
- `TokenBurnHeatmap({ data, label })` renders `{ label: string, value: number }[]` as normalized horizontal cells.

- [ ] **Step 1: Write failing tests** for one pie variant, donut variant, bar labels, line summary, heatmap labels, and zero/empty data. Assert accessible names and summaries rather than SVG implementation details.
- [ ] **Step 2: Run the focused test** with `npm run test:run -- src/components/design-system/charts/charts.test.jsx`; confirm it fails because the primitives do not exist.
- [ ] **Step 3: Implement the minimal primitives** with deterministic geometry: pie angles based on the positive-value sum, donut as a hollow center, bars normalized to the maximum positive value, line points normalized to the value range, and heatmap intensity clamped to `0..1`.
- [ ] **Step 4: Run the focused test** and confirm all primitive tests pass.
- [ ] **Step 5: Commit** with `git add src/components/design-system/charts && git commit -m "feat: add svg chart primitives"`.

### Task 2: Add shared chart framing, metrics, and styles

**Files:**
- Create: `src/components/design-system/charts/ChartFrame.jsx`
- Create: `src/components/design-system/charts/MetricWidget.jsx`
- Create: `src/components/design-system/charts/charts.css`
- Modify: `src/components/design-system/charts/charts.test.jsx`

**Interfaces:**
- `ChartFrame({ title, summary, legend, children, className = '' })` renders a bordered chart surface with a heading, optional legend, and accessible summary.
- `MetricWidget({ label, value, detail, trend })` renders a `dl`-compatible metric surface; `trend` is `{ direction: 'up' | 'down' | 'flat', label: string }`.

- [ ] **Step 1: Add failing tests** for ChartFrame heading/summary/legend and MetricWidget trend text and accessible semantics.
- [ ] **Step 2: Run the focused test** and confirm the new tests fail.
- [ ] **Step 3: Implement the frame and widget** and import `charts.css` from the chart entry point. Use existing `--v2-*` tokens, no hard-coded product colors except token fallbacks.
- [ ] **Step 4: Add CSS tests/assertions** for the shared chart classes and responsive one-column rule, then run `npm run test:run -- src/components/design-system/charts/charts.test.jsx`.
- [ ] **Step 5: Commit** with `git add src/components/design-system/charts && git commit -m "feat: style chart surfaces and metrics"`.

### Task 3: Replace the Metrics specimen with the chart showcase

**Files:**
- Modify: `src/components/design-system/examples/DataSpecimens.jsx`
- Modify: `src/screens/DesignSystemScreen.test.jsx`

**Interfaces:**
- `DataSpecimens` consumes only public chart exports and static specimen arrays. It must continue exporting the existing `DataSpecimens` component.

- [ ] **Step 1: Add failing screen assertions** for headings/labels `Campaign mix`, `Formats by campaign`, `Weekly approvals`, `Token burn`, and the existing metric labels.
- [ ] **Step 2: Run the screen test** with `npm run test:run -- src/screens/DesignSystemScreen.test.jsx`; confirm the new chart assertions fail.
- [ ] **Step 3: Compose the Metrics card** with a responsive chart grid: filled pie, donut pie, compact pie, bar chart, line chart, horizontal token-burn heatmap, and three `MetricWidget` examples. Keep all content static and descriptive.
- [ ] **Step 4: Add the catalog chart-grid rules** to `src/components/design-system/charts/charts.css` so cells touch through borders and collapse at the existing container breakpoint. Run the focused screen test and the chart test.
- [ ] **Step 5: Commit** with `git add src/components/design-system/examples/DataSpecimens.jsx src/screens/DesignSystemScreen.test.jsx src/components/design-system/charts/charts.css && git commit -m "feat: add metrics chart catalog"`.

### Task 4: Register the chart dashboard as a UI block

**Files:**
- Modify: `src/components/design-system/examples/UIBlocks.jsx`
- Modify: `src/screens/DesignSystemScreen.test.jsx`

**Interfaces:**
- Add one `uiBlockCatalog` entry `{ id: 'chart-dashboard', name: 'Chart dashboard', group: 'Data', render: () => <ChartDashboardBlock /> }`.
- `ChartDashboardBlock` consumes the same chart primitives and static demo data as Metrics, with no copied SVG markup.

- [ ] **Step 1: Add a failing assertion** that the UI Blocks route exposes `Chart dashboard` and its chart headings.
- [ ] **Step 2: Run the focused screen test** and confirm it fails.
- [ ] **Step 3: Implement `ChartDashboardBlock`** as a compact composition of `ChartFrame`, `MetricWidget`, `BarChart`, and `TokenBurnHeatmap`, using the UI-block surface conventions.
- [ ] **Step 4: Run the focused tests** for charts and the design-system screen.
- [ ] **Step 5: Commit** with `git add src/components/design-system/examples/UIBlocks.jsx src/screens/DesignSystemScreen.test.jsx && git commit -m "feat: expose charts as ui block"`.

### Task 5: Full verification and browser review

**Files:**
- Modify only files required by verification findings.

- [ ] **Step 1: Run `npm run test:run`** and resolve regressions without weakening existing assertions.
- [ ] **Step 2: Run `npm run build`** and confirm the build completes; record any existing chunk-size warning separately.
- [ ] **Step 3: Open `http://127.0.0.1:5178/?section=components`** and verify the Metrics chart grid, readable summaries, and responsive collapse.
- [ ] **Step 4: Open the UI Blocks route** and verify `Chart dashboard` uses the same primitives and token styling.
- [ ] **Step 5: Update the Observatory task** with the verified Design System / Components and UI blocks locations and a concise ready note.
- [ ] **Step 6: Commit any final verification fixes** with `git add` scoped to the changed chart files and a descriptive message.
