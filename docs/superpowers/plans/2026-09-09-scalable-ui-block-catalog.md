# Scalable UI Block Catalog Implementation Plan

> **For agentic workers:** Execute inline task-by-task.

**Goal:** Organize the current UI blocks into extensible alphabetical groups with a responsive grid.

**Architecture:** `UIBlocks.jsx` owns a registry of existing previews and derives sorted groups. A shared catalog stylesheet controls grid spacing and card presentation.

**Tech Stack:** React and CSS.

**Spec:** `docs/superpowers/specs/2026-09-09-scalable-ui-block-catalog-design.md`

---

### Task 1: Create the data-driven block catalog

**Files:** `src/components/design-system/examples/UIBlocks.jsx`

- [ ] Define registry entries for Prompt input, Scheduling, and Settings form with groups AI, Scheduling, and Settings.
- [ ] Derive groups and entries with locale-aware alphabetical sorting.
- [ ] Render one section per group, each containing a responsive grid of minimal specimen cards.

### Task 2: Style grouped grids

**Files:** `src/styles/ui-blocks.css`

- [ ] Add grid layout, group spacing, and generous card gaps using existing tokens.
- [ ] Keep single-column fallback at narrow widths.

### Task 3: Verify

- [ ] Run `npm run test:run -- src/screens/DesignSystemScreen.test.jsx`.
- [ ] Run `npm run build`.
