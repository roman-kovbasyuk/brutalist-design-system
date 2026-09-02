# Copy and Shot Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a compact Copy stage with five actionable shot prompts and explicit hero/action highlighting.

**Architecture:** Extend the deterministic prompt domain model, render it through a focused `CopyWorkspace` component, and replace only the Copy-stage layout styles. Preserve the existing workflow state and Stage 3 asset-generation contract.

**Tech Stack:** React 19, Vite, plain CSS, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-09-02-copy-shot-workbench-design.md`

## Global Constraints

- The app remains frontend-only and local-first.
- The Copy stage contains exactly five deterministic shot prompts.
- Hero and action are labelled and visually distinct without relying on color alone.
- Existing Back and Generate visuals behavior is preserved.

---

### Task 1: Prompt semantics

**Files:**
- Modify: `src/domain/campaign.js`
- Test: `src/domain/campaign.test.js`

**Interfaces:**
- Consumes: `generatePromptIdeas(strategy)` and the existing `strategy.imagePrompt` string.
- Produces: five prompt objects with stable `id`, `title`, `hero`, `subject`, `action`, `shot`, `prompt`, and cost fields.

- [ ] Write a failing domain assertion for the five shot titles and non-empty hero/action values.
- [ ] Run `npm test -- --run src/domain/campaign.test.js` and confirm the assertion fails.
- [ ] Replace generic seed-derived prompt copy with five deterministic shot narratives while retaining seed artwork metadata.
- [ ] Run the focused domain test and confirm it passes.

### Task 2: Copy workbench UI

**Files:**
- Create: `src/components/CopyWorkspace.jsx`
- Modify: `src/screens/WorkflowScreen.jsx`
- Modify: `src/App.test.jsx`

**Interfaces:**
- Consumes: `strategy`, `promptIdeas`, and `onCopyChange(field, value)`.
- Produces: editable copy fields and an ordered five-row shot prompt region with labelled hero/action marks.

- [ ] Add a failing UI test that reaches Copy and asserts five shot rows plus five hero and five action labels.
- [ ] Run the focused UI test and confirm it fails.
- [ ] Build `CopyWorkspace` with semantic form controls, strategy context, legend, and ordered prompt rows.
- [ ] Replace the old strategy/copy/prompt blocks in `WorkflowScreen` with `CopyWorkspace`.
- [ ] Run the focused UI test and confirm it passes.

### Task 3: Responsive visual finish

**Files:**
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: the class contract from `CopyWorkspace`.
- Produces: a two-column desktop workbench, single-column responsive layout, marker treatments, and restrained interaction states.

- [ ] Add the desktop layout and intentional tight/generous spacing rhythm.
- [ ] Add hero and action marker treatments, hover/focus states, and responsive collapse below 1080px.
- [ ] Run `npm test -- --run` and `npm run build`.
- [ ] Run `node /Users/roman/.agents/skills/impeccable/scripts/detect.mjs --json src/components/CopyWorkspace.jsx src/screens/WorkflowScreen.jsx src/styles/app.css` and resolve material findings.
- [ ] Inspect the final diff and commit the completed redesign.

### Task 4: Video cost dialog layout repair

**Files:**
- Modify: `src/components/CostDialog.jsx`
- Modify: `src/styles/app.css`
- Test: `src/App.test.jsx`

**Interfaces:**
- Consumes: the existing `estimate`, `onCancel`, and `onConfirm` props.
- Produces: the same accessible dialog behavior with a full-width content wrapper and unclipped actions.

- [ ] Add a failing assertion for the dedicated `.cost-dialog__content` wrapper.
- [ ] Give the content wrapper a stable class and replace the broad `.cost-dialog > div` selector.
- [ ] Structure the warning and title as one header row while keeping description, estimate, and actions full width.
- [ ] Verify the dialog test, full suite, production build, and final UI detector.
