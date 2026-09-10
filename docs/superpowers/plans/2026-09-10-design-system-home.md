# Design System Home Screen Implementation Plan

> **For agentic workers:** Execute this plan inline in the current session.

**Goal:** Build the new root design-system home screen with summary cards, anchor search, and grouped latest updates.

**Architecture:** Add a focused overview component and stylesheet, then render it from the existing `DesignSystemScreen` root state. Reuse current catalogs and route/anchor conventions so existing section pages remain unchanged.

**Tech Stack:** React, existing design-system CSS tokens, Vitest and Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-10-design-system-home-design.md`

## Global Constraints

- Use shared design-system tokens and controls.
- Preserve existing `/design-system?section=...` routes and anchors.
- Keep the overview responsive and keyboard accessible.

### Task 1: Overview component and data

**Files:**
- Create: `src/components/design-system/examples/DesignSystemOverview.jsx`
- Modify: `src/screens/DesignSystemScreen.jsx`

- [ ] Add derived summary counts and a dated update model.
- [ ] Add `OverviewSearch` state with filtered results and real hrefs.
- [ ] Render four cards, search, and grouped updates.
- [ ] Render the overview only when `overviewOnRoot` and no section is selected.

### Task 2: Overview styling

**Files:**
- Modify: `src/styles/design-system.css`

- [ ] Add responsive grid styles for summary cards and update rows.
- [ ] Add accessible search/listbox focus and status colors using existing tokens.
- [ ] Keep mobile layout single-column.

### Task 3: Verification

**Files:**
- Modify: `src/screens/DesignSystemScreen.test.jsx`

- [ ] Test summary headings and counts.
- [ ] Test search filtering and anchor href selection.
- [ ] Test grouped dates and change status labels.
- [ ] Run the focused screen test and browser-check the root route.
