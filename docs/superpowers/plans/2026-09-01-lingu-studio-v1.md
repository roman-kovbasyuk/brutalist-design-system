# Lingu Studio V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first React prototype that demonstrates the full brief-to-reviewed-resized-banner workflow, 20 templates, and the shared design system.

**Architecture:** A Vite SPA keeps workflow state in React and delegates all business rules to pure modules. Deterministic local generators stand behind integration-shaped functions so real AI, Figma, and renderer adapters can replace them later.

**Tech Stack:** React 19, Vite 7, Vitest 3, Testing Library, Lucide React, plain CSS.

**Spec:** `docs/superpowers/specs/2026-09-01-lingu-studio-v1-design.md`

## Global Constraints

- Runs locally without Claude Code, cloud infrastructure, secrets, or provider SDKs.
- Russian UI copy.
- Exactly 20 template definitions and five generated visual directions.
- Designer approval blocks final output.
- Final formats: 1080×1080, 1080×1350, 1080×1920, 1200×628.
- Monochrome app chrome; campaign visuals may use color.
- WCAG 2.2 AA intent, keyboard controls, responsive desktop/mobile layouts.

---

### Task 1: Domain contracts and generation

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`
- Create: `src/domain/campaign.js`, `src/domain/campaign.test.js`
- Create: `src/data/templates.js`, `src/data/visuals.js`

**Interfaces:**
- Produces `analyzeBrief(brief)`, `generateVisuals(strategy)`, `canAdvance(state)`, `getResizeLayout(template, format)`, `templates`.

- [ ] Write tests that reject empty briefs, derive campaign content, return five visuals, enforce review gating, return four format strategies, and expose exactly 20 templates.
- [ ] Run `npm test -- --run` and verify failures caused by missing modules.
- [ ] Implement the minimal pure modules and fixtures.
- [ ] Run `npm test -- --run` and verify the domain suite passes.

### Task 2: Application shell and workflow

**Files:**
- Create: `src/main.jsx`, `src/App.jsx`, `src/App.test.jsx`
- Create: `src/components/AppShell.jsx`, `src/components/StepRail.jsx`, `src/components/BannerPreview.jsx`
- Create: `src/screens/WorkflowScreen.jsx`

**Interfaces:**
- Consumes domain functions and template/visual data.
- Produces a seven-stage client workflow and accessible primary navigation.

- [ ] Write component tests for navigation, brief validation, visual selection, template selection, review gating, approval, and four final outputs.
- [ ] Run the focused test and confirm it fails because the app is absent.
- [ ] Implement the minimal shell, state transitions, and stage screens.
- [ ] Run the focused test and then the complete suite.

### Task 3: Template library and design-system reference

**Files:**
- Create: `src/screens/TemplatesScreen.jsx`, `src/screens/DesignSystemScreen.jsx`
- Create: `src/components/TemplateCard.jsx`, `src/components/DesignTokenDemo.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes `templates` and shared components.
- Produces navigable `templates` and `system` views.

- [ ] Write tests that find 20 templates and the design-system content contract.
- [ ] Run the focused test and confirm the expected missing-view failure.
- [ ] Implement the two reference screens and route switching.
- [ ] Run the focused and full test suites.

### Task 4: Visual system and responsive behavior

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/global.css`, `src/styles/app.css`
- Modify: all UI components only where class hooks are required.

**Interfaces:**
- Produces the monochrome design system, responsive shell, ratio-correct canvases, focus states, and reduced-motion behavior.

- [ ] Add behavioral accessibility assertions for labelled navigation and disabled stage actions.
- [ ] Implement CSS tokens, layout, component states, banner variants, and mobile adaptations.
- [ ] Run tests and `npm run build`.

### Task 5: Browser verification and handoff

**Files:**
- Modify only files implicated by browser findings.
- Create: `README-MVP.md`

**Interfaces:**
- Produces verified desktop/mobile UI and local run instructions.

- [ ] Run the Impeccable detector once over changed UI targets.
- [ ] Start the Vite server and capture desktop/mobile screenshots.
- [ ] Fix findings in one bounded batch and recapture once.
- [ ] Run `npm test -- --run`, `npm run build`, and inspect `git diff --check`.
- [ ] Document setup, demo limitations, architecture boundaries, and follow-on adapter work.
