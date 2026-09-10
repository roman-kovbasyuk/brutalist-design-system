# Component library ownership

The package API is defined by [index.ts](index.ts). Public controls live in `components/`, tokens and layout primitives in `basics/`, and reusable compositions in `ui-blocks/`. Import the package stylesheet once and wrap consumers in `DesignSystemRoot`.

## Compatibility and examples

AppButton, TextAction, SelectionTile, InlineText and ActionCard under the older `atoms/` and `molecules/` paths re-export the public implementations. FactGrid has a thin adapter from legacy `content/heading` items to public `value` items. Their behavior and styling have one owner in `components/`.

Other local controls such as PillTabs, SelectMenu and PromptComposer retain their own documented contracts. They are not automatically package exports. Flat entry points remain compatibility exports. `examples/` and `workbench/` are documentation, not consumer APIs; specimen visibility does not imply production readiness.

Use the [package guide](../../../docs/design-system/getting-started.md) for new consumers and [component contracts](../../../docs/design-system/components.md) for local catalog APIs.

## Styling and interaction

Canonical component CSS owns control states, disabled/busy behavior, focus and responsive rules. Workbench CSS composes specimen layouts. Reuse semantic `--v2-*` tokens from `basics/tokens.css`; `foundations/tokens.css` is a compatibility entry. Only the light theme is supported.

New components need explicit props, supported states, constraints, a demonstrated consumer need and keyboard/interaction tests. Applications own persistence, authorization and domain workflows.

Catalog grids reflow to their available width, with 280px minimum columns (260px for button cells) capped at 100%. Preserve focus and overlay visibility; tables own their horizontal scroll regions.
