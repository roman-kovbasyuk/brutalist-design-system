# Lingu Studio SaaS Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved modern SaaS dashboard and seven-stage creative-production workflow as a deterministic local React application.

**Architecture:** Keep campaign rules and deterministic generation in pure domain modules. A campaign workspace owns transient UI state, while review status is mirrored into localStorage for the separate designer route. Split the large workflow into focused stage components and reuse the existing banner renderer and template dataset.

**Tech Stack:** React 19, Vite 8, plain CSS, Lucide React, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-02-lingu-studio-saas-workflow-design.md`

## Global Constraints

- The application remains frontend-only and runs without API credentials.
- External generation, Figma, email, Slack, and rendering operations are explicitly labeled simulations.
- All runtime UI copy is English.
- Structured comparable data uses semantic tables; visual assets use galleries.
- Motion supports `prefers-reduced-motion`.

---

### Task 1: Campaign production domain

**Files:**
- Modify: `src/domain/campaign.js`
- Modify: `src/domain/campaign.test.js`
- Create: `src/data/campaigns.js`

**Interfaces:**
- Produces `generatePromptIdeas(strategy)`, `createStaticAsset(prompt)`, `createVideoAsset(staticAsset)`, `estimateVideoBatch(assets)`, `createBannerCandidates(input)`, and dashboard fixtures.

- [ ] Add failing literal-output tests for prompt ideas, linked static/video assets, cost estimates, banner filters, and production totals.
- [ ] Run `npm run test:run -- src/domain/campaign.test.js` and confirm the new assertions fail.
- [ ] Implement deterministic functions and stable IDs without external calls.
- [ ] Run the domain tests and confirm they pass.

### Task 2: Dashboard and application routing

**Files:**
- Create: `src/screens/DashboardScreen.jsx`
- Create: `src/screens/DesignerReviewScreen.jsx`
- Modify: `src/App.jsx`
- Modify: `src/components/AppShell.jsx`
- Modify: `src/App.test.jsx`

**Interfaces:**
- Dashboard accepts `onOpenCampaign` and renders metric/history fixtures.
- Designer review accepts campaign data and writes `ready-for-approval` through the review persistence interface.

- [ ] Add failing tests for default Dashboard, history table columns, campaign navigation, and designer endpoint state change.
- [ ] Run the app tests and confirm the new behaviors fail.
- [ ] Implement Dashboard navigation and pathname-based designer route.
- [ ] Run the app tests and confirm they pass.

### Task 3: Brief processing and Copy stages

**Files:**
- Create: `src/components/ProcessingScreen.jsx`
- Modify: `src/screens/WorkflowScreen.jsx`
- Modify: `src/App.test.jsx`

**Interfaces:**
- ProcessingScreen accepts `states`, `activeIndex`, and `progress`.

- [ ] Add a failing workflow test that observes processing status before Copy.
- [ ] Implement the timed determinate transition and generated prompt initialization.
- [ ] Verify the workflow test and full suite.

### Task 4: Three-tab AI Assets workspace

**Files:**
- Create: `src/components/AssetWorkspace.jsx`
- Create: `src/components/CostDialog.jsx`
- Modify: `src/screens/WorkflowScreen.jsx`
- Modify: `src/App.test.jsx`

**Interfaces:**
- AssetWorkspace emits static and video generation requests and selected tab changes.
- CostDialog emits confirm/cancel for the exact estimate supplied.

- [ ] Add failing tests for prompt generation, per-prompt static generation, hover-equivalent video actions, and bulk cost confirmation.
- [ ] Implement semantic tabs, galleries, empty states, and dialog.
- [ ] Verify focused and full tests.

### Task 5: Banner preview, filters, selection, and motion

**Files:**
- Create: `src/components/BannerWorkspace.jsx`
- Modify: `src/components/BannerPreview.jsx`
- Modify: `src/components/BannerPreview.test.jsx`
- Modify: `src/screens/WorkflowScreen.jsx`
- Modify: `src/App.test.jsx`

**Interfaces:**
- BannerWorkspace accepts candidates, filters, selected IDs, and motion settings; emits all state changes.
- BannerPreview accepts `motionPreset` and applies text/image/CTA animation classes.

- [ ] Add failing tests for format/platform/media filtering, persistent multi-selection, detail characteristics, and motion classes.
- [ ] Implement the toolbar, banner gallery, detail panel, and motion controls.
- [ ] Verify focused and full tests.

### Task 6: Review preparation, designer lifecycle, and Delivery

**Files:**
- Create: `src/components/ReviewWorkspace.jsx`
- Create: `src/domain/reviewStore.js`
- Create: `src/domain/reviewStore.test.js`
- Modify: `src/screens/WorkflowScreen.jsx`
- Modify: `src/screens/DesignerReviewScreen.jsx`
- Modify: `src/App.test.jsx`

**Interfaces:**
- Review store exposes `readReview(id)`, `writeReview(id, record)`, and `subscribeToReview(id, listener)`.
- ReviewWorkspace renders selected thumbnails and the semantic review table.

- [ ] Add failing tests for review persistence, selected-banner table rows, yellow in-review state, designer-ready state, marketer confirmation, and delivery totals.
- [ ] Implement localStorage persistence and cross-tab synchronization.
- [ ] Implement Prepare for review, Approval, and expanded Delivery.
- [ ] Verify focused and full tests.

### Task 7: Modern SaaS visual system and bounded QA

**Files:**
- Modify: `DESIGN.md`
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/global.css`
- Replace: `src/styles/app.css`

**Interfaces:**
- CSS exposes shared states for tabs, tables, cards, dialogs, selections, review status, and motion presets.

- [ ] Apply the white surface system, fixed SaaS type scale, table styling, 44 px controls, and responsive layouts.
- [ ] Add state transitions, dynamic yellow highlights, hover/focus microanimations, and reduced-motion overrides.
- [ ] Run the Impeccable detector once after UI editing is complete.
- [ ] Run `npm run test:run`, `npm run build`, `npm audit --audit-level=high`, and `git diff --check`.
- [ ] Inspect desktop and mobile in one browser QA round, apply one batched correction pass, and confirm once.
- [ ] Request independent code and visual reviews; resolve every Critical/Important or P0/P1 finding.
- [ ] Commit the completed redesign on `codex/mvp-v1`.

