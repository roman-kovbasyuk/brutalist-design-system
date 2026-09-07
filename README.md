# Banner Studio Design System

An operational React design system for creative workflow products. It carries the Banner Studio visual language into reusable, tested components: warm canvas surfaces, cyan actions, black structural rules, compact corners, hard interaction shadows, and quiet motion.

## Status

This is the first public baseline (`0.1.0`). The package is intentionally small and stable enough to install in another React application while the catalog and component coverage grow from real use.

## Install

```sh
npm install @roman-kovbasyuk/banner-design-system
```

Import the components and stylesheet once at the application boundary. Wrap the consuming surface in `ds-root` so the design-system reset and scoped focus treatment apply.

```jsx
import { AppButton, PillTabs } from '@roman-kovbasyuk/banner-design-system'
import '@roman-kovbasyuk/banner-design-system/styles.css'

export function Example() {
  return <div className="ds-root"><AppButton variant="primary">Continue</AppButton></div>
}
```

## Included components

Foundations, `AppButton`, `TextAction`, `TokenChip`, `TokenCopyTarget`, `UpdatedText`, `ActionCard`, `AsyncStatus`, `EmptyState`, `FactGrid`, `InlineText`, `PillTabs`, `SelectMenu`, `SelectionTile`, `WorkflowSteps`, `MediaWorkflowCard`, `PreviewDialog`, `PromptComposer`, and `WorkflowModuleFrame` are exported from the package root. Domain decisions, fetching, permissions, persistence, and workflow orchestration stay in the consuming application.

The live catalog is the source of usage examples. Run `npm run dev` and open the local Vite URL.

## Design rules

Use semantic `--v2-*` roles instead of hard-coded colors. Keep component interaction and accessibility behavior with the component. Compose layout and domain state at the application boundary. Prefer native controls where they already provide the correct behavior. Every new component needs a responsibility, states, a consumer, a catalog example, and interaction coverage.

The first release supports the light application mode. The Avenir-family stack is deliberately a system fallback; no proprietary font files are bundled.

## Development

```sh
npm install
npm run check
npm run dev
```

`npm run check` runs the public component contract tests and produces the distributable library build. The CI workflow runs the same command for every push and pull request.

## Repository boundaries

This repository contains reusable UI foundations, components, examples, and documentation. It does not contain Banner Studio campaign data, authentication, provider credentials, customer artwork, or product-specific workflow logic. The source extraction was made from the Banner Studio application; the application remains the authority for domain behavior.

## Release

Versions follow semantic versioning. Breaking component contracts or token behavior require a major version after `1.0.0`; additive components and compatible fixes use minor and patch releases. Create a release commit, run `npm run check`, then publish with `npm publish --access public` after reviewing the package contents.

## License

MIT. See [LICENSE](LICENSE).
