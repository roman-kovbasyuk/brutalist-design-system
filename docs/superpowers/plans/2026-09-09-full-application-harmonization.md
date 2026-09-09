# Full Application Harmonization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Review every shipped screen, component family, example, and token entry in the Brutalist Design System workspace, then make the semantic v2 design-system contract the single visual source of truth.

**Architecture:** Treat `src/components/design-system/foundations/tokens.css` as the canonical token layer. Keep compatibility exports and legacy names only as aliases to semantic v2 values, so existing consumers keep working without maintaining a second visual palette. Record the review as a checked-in inventory and verify the catalog, workbench, package build, test suite, and detector together.

**Tech Stack:** React 19, TypeScript/TSX, Vite, plain CSS, Vitest, Testing Library, Impeccable detector.

**Spec:** `DESIGN.md`, `docs/design-system/audit.md`, and this repository's current component registry.

## Global Constraints

- The light application theme remains the only supported application mode.
- Shared application UI uses `--v2-*` semantic tokens; legacy names may remain only as aliases.
- Banner artwork and illustrative demo values remain content examples and do not become application tokens.
- Preserve public component exports and existing route behavior.
- Do not remove the user's untracked local files.

---

### Task 1: Record the current application inventory and baseline

**Files:**
- Create: `docs/design-system/full-application-review.md`
- Modify: `docs/design-system/validation.md`

- [ ] Inventory the two runtime route modes (`/design-system` basics catalog and `?mode=workbench` component catalog), the shared shell, all registered families, and all exported component groups.
- [ ] Record measurable baseline evidence: source counts, raw-color/token scan, test command, build command, and current detector scope.
- [ ] Classify findings as fixed, remaining, or intentionally example-only, with file paths for each actionable item.
- [ ] Add an explicit acceptance checklist for a future consumer application without claiming this repository contains the removed legacy product screens.
- [ ] Verify all links in the review point to files or stable catalog routes.

### Task 2: Make semantic v2 tokens canonical at the application entrypoint

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/global.css`
- Modify: `src/components/design-system/basics/tokens.css`
- Test: `src/components/design-system/basics/tokens.test.ts`

- [ ] Replace divergent legacy palette values with aliases to semantic v2 roles wherever the concept exists.
- [ ] Alias global font, body size, line height, radii, focus, shadow, and motion values to the v2 contract.
- [ ] Keep compatibility names for older consumers, but make the source of truth visibly one-way: legacy aliases point to v2 and never define a competing color or type scale.
- [ ] Add a token contract test that resolves representative aliases and fails if a legacy application alias diverges from its v2 role.
- [ ] Run the focused token tests and inspect the generated CSS for unresolved custom properties.

### Task 3: Align registry metadata and examples with the public component contract

**Files:**
- Modify: `src/workbench/registry/metadata.ts`
- Modify: `src/workbench/registry/entries.ts`
- Modify: `src/workbench/registry/renderers.tsx`
- Modify: `src/workbench/registry/validateRegistry.ts`
- Test: `src/workbench/registry/registry.test.ts`

- [ ] Ensure every registry source path resolves to a shipped file and every entry has a renderer.
- [ ] Ensure metadata tokens list the actual semantic roles consumed by each example rather than a generic placeholder list.
- [ ] Ensure generated snippets use the package's public import surface and preserve the current component names.
- [ ] Add registry tests for source existence, renderer completeness, and semantic token references.
- [ ] Run the registry and workbench tests before changing visual styles.

### Task 4: Normalize shared shell and component CSS around the token contract

**Files:**
- Modify: `src/components/design-system/basics/base.css`
- Modify: `src/components/design-system/basics/layout/layout.css`
- Modify: `src/components/design-system/components/**/*.css`
- Modify: `src/components/design-system/molecules/**/*.css`
- Modify: `src/components/design-system/organisms/**/*.css`
- Modify: `src/components/design-system/ui-blocks/**/*.css`
- Modify: `src/workbench/workbench.css`
- Modify: `src/styles/application-design-system.css`

- [ ] Replace application-facing hard-coded palette and typography values with semantic tokens, retaining literal dimensions only for content/media constraints or documented breakpoints.
- [ ] Preserve the chosen neobrutalist language: black structural rules, cyan action, compact 4px controls, documented hard-offset interaction shadows, and Avenir-family typography.
- [ ] Verify focus, disabled, loading, empty, error, hover, and reduced-motion states remain present for each interactive family.
- [ ] Keep examples visually honest: speculative dark previews and artwork colors must be explicitly scoped and must not alter the application theme.
- [ ] Run `git diff --check` and the detector once after the bounded CSS pass.

### Task 5: Verify the complete workspace and close the review

**Files:**
- Modify: `docs/design-system/full-application-review.md`
- Modify: `docs/design-system/validation.md`

- [ ] Run `npm run test:run`, `npm run build`, and the package consumer verification.
- [ ] Start the app and inspect both route modes at desktop and narrow widths, including keyboard focus and reduced-motion behavior.
- [ ] Run the Impeccable detector against the changed UI targets and classify any findings rather than ignoring them.
- [ ] Re-run the token, registry, and route tests after any verification fixes.
- [ ] Mark the review complete only when the implementation, documentation, and verification evidence agree.
