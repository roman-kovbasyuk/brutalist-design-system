# VitePress Team Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a minimal Markdown-first `/docs/` site with reliable Mermaid diagrams and concise technical team documentation.

**Architecture:** VitePress builds Markdown docs into `dist/docs`; the existing Vite app builds into `dist` and serves `/`. Nginx routes `/docs/` to the generated static docs and keeps SPA fallback for product routes.

**Tech Stack:** VitePress 1.6.4, vitepress-plugin-mermaid 2.0.17, React 19, Vite 8, Nginx, Vitest

**Spec:** `docs/superpowers/specs/2026-09-03-vitepress-team-docs-design.md`

## Global Constraints

- Markdown is the source of truth.
- Keep only project-specific workflow, technical architecture, interfaces, dependencies, and acceptance gates.
- Mark V1 behavior separately from future integration boundaries.
- Build docs into `dist/docs/` alongside the React app.
- Keep Mermaid local; no external diagram service.
- Remove the decorative React documentation screen and static SVG.

### Task 1: Install and configure VitePress

**Files:** `package.json`, `package-lock.json`, `.vitepress/config.js`, `scripts/build.mjs`, `nginx.conf`

- [ ] Install `vitepress@1.6.4` and `vitepress-plugin-mermaid@2.0.17` as dev dependencies.
- [ ] Add `.vitepress/config.js` with `/docs/` base, concise nav/sidebar, Mermaid plugin, and mobile-safe theme.
- [ ] Add `scripts/build.mjs` to run Vite build then VitePress build with outDir `dist/docs`.
- [ ] Update the `build` script to call `node scripts/build.mjs`.
- [ ] Update Nginx to serve `/docs/` static output before the SPA fallback.

### Task 2: Convert docs to focused Markdown pages

**Files:** `.vitepress/index.md`, `.vitepress/workflow.md`, `.vitepress/architecture.md`, `.vitepress/team-process.md`

- [ ] Write overview with only scope, current V1 status, source-of-truth rules, and page links.
- [ ] Write workflow page with the actual eight-step Mermaid flow and explicit human review gate.
- [ ] Write architecture page covering React modules, local state, deterministic demo boundaries, build output, and Cloud Run.
- [ ] Write team process page with ownership, concrete artifacts, handoffs, readiness checks, and pruned launch checklist.
- [ ] Remove generic pitch copy, decorative role narratives, and self-evident design guidance.

### Task 3: Replace the app route and remove legacy UI

**Files:** `src/components/AppShell.jsx`, `src/App.jsx`, `src/screens/DocumentationScreen.jsx`, `src/screens/DocumentationScreen.test.jsx`, `src/styles/app.css`, `public/docs/lingu-studio-architecture.svg`

- [ ] Change Documentation navigation to a normal `/docs/` link.
- [ ] Remove the `docs` SPA route and `DocumentationScreen` import/rendering.
- [ ] Delete documentation-only component tests and CSS after confirming no shared selectors are used.
- [ ] Delete the superseded SVG.
- [ ] Update route tests to assert navigation leaves the SPA for `/docs/`.

### Task 4: Verify and deploy

- [ ] Run focused route tests, full tests, `npm run build`, and `git diff --check`.
- [ ] Inspect `/docs/`, Mermaid SVG output, navigation, and mobile layout in a browser.
- [ ] Deploy with Python 3.11 to existing public Cloud Run service `lingu-studio` in `europe-west6`.
- [ ] Verify `/`, `/docs/`, and a generated Mermaid asset return HTTP 200.
