# VitePress Team Documentation Design

**Date:** 2026-09-03  
**Status:** Approved  
**Supersedes:** `2026-09-03-static-architecture-diagram-design.md`

## Goal

Replace the decorative React documentation page with a focused open-source documentation system. Team documentation must be authored as Markdown, easy to scan, mobile-friendly, and capable of rendering Mermaid diagrams reliably.

## Platform choice

Use VitePress as a documentation site mounted at `/docs/` alongside the existing React product at `/`. VitePress is selected because it is Markdown-first, produces static assets, includes accessible navigation and responsive layouts, and fits the existing Node/Vite toolchain.

Mermaid diagrams will be rendered from fenced `mermaid` blocks at build time or during client hydration through a maintained VitePress Mermaid integration. The chosen integration must support the installed VitePress version and require no external diagram service.

## Information architecture

The documentation contains only project-specific operational information:

1. **Overview** — the MVP boundary, source-of-truth rules, and links to the detailed pages.
2. **Workflow** — brief through copy, assets, templates, designer review, approval, and delivery; includes the primary Mermaid workflow diagram.
3. **Technical architecture** — frontend state, domain modules, local persistence, simulated integrations, production build, and Cloud Run hosting.
4. **Team process** — ownership, handoffs, required artifacts, readiness gates, and launch checklist.

Remove explanatory product positioning, promotional promises, decorative role cards, repeated descriptions of standard design work, and generic statements that the team already understands. Keep only constraints, interfaces, decisions, dependencies, and acceptance criteria specific to Lingu Studio.

## Content rules

- Markdown is the source of truth.
- Use short sections, tables only where relationships benefit from them, and task lists for executable checkpoints.
- Mark current V1 behavior separately from planned integration boundaries.
- Do not claim that Slack, Figma webhooks, provider jobs, or a backend database exist in V1 when they remain simulated or future work.
- Mermaid diagrams must match the actual V1 structure and label future integrations explicitly.
- Russian remains the primary documentation language; established technical terms may remain in English.

## Routing and build

- The React application keeps its existing root build output.
- VitePress builds into the React distribution under `dist/docs/`.
- The production build runs the app build first and the documentation build second.
- Nginx serves generated VitePress files under `/docs/` and preserves the React SPA fallback for non-documentation routes.
- The existing application navigation opens `/docs/` as a normal document navigation rather than rendering `DocumentationScreen` inside the SPA.

## Removal scope

- Remove the `DocumentationScreen` route, component, tests, and documentation-only CSS.
- Remove the static architecture SVG introduced by the superseded design.
- Remove Mermaid-source disclosure widgets and the local-only interactive checklist UI.
- Preserve the underlying checklist content by converting it to Markdown tasks, after pruning generic items.

## Verification

- Unit tests confirm that the application navigation points to `/docs/` without routing to the removed React screen.
- `npm run build` creates `dist/docs/index.html` and the expected Markdown page outputs.
- Built documentation contains Mermaid output and no raw unprocessed Mermaid fence.
- Desktop and mobile browser checks confirm readable navigation, prose, tables, task lists, and diagrams without page-level horizontal overflow.
- Docker image and Cloud Run deployment serve `/`, `/docs/`, and the generated documentation assets successfully.
