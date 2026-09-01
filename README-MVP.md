# Lingu Studio V1

Lingu Studio is a local-first prototype for controlled advertising-creative production. A client
submits one text brief, chooses an AI-proposed visual direction and a template, then receives a
designer-reviewed creative package adapted to four formats.

## Run locally

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

Tests:

```bash
npm run test:run
```

## What works

- Seven-stage guided workflow with durable in-session state.
- Free-form brief analysis and generated campaign copy.
- Static-image and video prompt generation.
- Five client-selectable visual directions.
- Twenty distinct banner compositions.
- Ratio-correct master preview.
- Blocking Figma/designer-review checkpoint.
- Final reflow previews for 1080×1080, 1080×1350, 1080×1920, and 1200×628.
- Downloadable JSON production manifest.
- Separate template-library and design-system screens.
- Responsive desktop and mobile interfaces.

## Deliberate prototype boundaries

The V1 does not call an image model, video model, Figma API, or renderer. Those steps are presented
as explicit demo states and never claim that a real external operation occurred. Refreshing the
page resets campaign state.

The existing `.claude/` directory is legacy/reference material. The new application has no imports
from it and runs normally without Claude Code or any token configuration.

## Architecture

```text
src/
  components/       shared shell, step rail, banner and template rendering
  data/             twenty templates and five deterministic visual seeds
  domain/           brief, generation, stage-gating, and resize decisions
  screens/          workflow, template library, and design-system views
  styles/           tokens, browser defaults, and responsive product UI
```

The domain layer is pure JavaScript. Real integrations should preserve these boundaries:

- `analyzeBrief(brief)` → strategy and copy;
- `generateVisuals(strategy)` → selectable visual directions;
- Figma handoff → approved review record;
- render job → files for every entry returned by `getResizeLayouts(template)`.

## Product documentation

- [Product context](PRODUCT.md)
- [Visual system](DESIGN.md)
- [PRD and product specification](docs/superpowers/specs/2026-09-01-lingu-studio-v1-design.md)
- [Implementation plan](docs/superpowers/plans/2026-09-01-lingu-studio-v1.md)

## Next integrations

1. Replace local brief analysis with a provider adapter.
2. Replace deterministic visual seeds with image/video generation jobs.
3. Export the review packet to Figma or an internal review service.
4. Render static and animated assets from the approved layout contract.
5. Add persistence, accounts, billing, and delivery only after the creative loop is validated.
