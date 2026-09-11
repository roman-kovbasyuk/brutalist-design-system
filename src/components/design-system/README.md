# Component library ownership

The package API is defined by [index.ts](index.ts). Public controls live in `components/`, tokens and layout primitives in `basics/`, and reusable compositions in `ui-blocks/`. Import the package stylesheet once and wrap consumers in `DesignSystemRoot`.

## Compatibility and examples

AppButton, TextAction, SelectionTile, InlineText and ActionCard under the older `atoms/` and `molecules/` paths re-export the public implementations. FactGrid has a thin adapter from legacy `content/heading` items to public `value` items. Their behavior and styling have one owner in `components/`.

PillTabs and PillTabPanel adapt their legacy label-based API to the same typed interaction owner as public Tabs and TabPanel. Legacy selection uses exact labels and retains historical slug IDs; legacy labels must have unique slugs for unique DOM IDs. New consumers should use public value-based tabs: values may differ from labels, and labels may repeat. Supply a unique `idPrefix` per group and the same prefix to its panels. Keep controlled values valid and enabled.

Other local controls such as SelectMenu and PromptComposer retain their own documented contracts. They are not automatically package exports. Flat entry points remain compatibility exports. `examples/` and `workbench/` are documentation, not consumer APIs; specimen visibility does not imply production readiness.

## Workbench ownership

`src/workbench/components/FamilyGallery.tsx` owns isolated in-memory specimen drafts; renderers own additional local preview state. Leaving a family discards its drafts. Shared controls own interactions, while the workbench only composes layout and supplies callbacks. No gallery action performs a provider request, upload, or real application mutation.

The unused details/options editor, context/source export layer, and old state provider were removed after checking app and package reachability. Their exclusive tests were removed with them. Registry validation and control metadata remain deliberate test/reference tooling, and route parsing retains legacy view/example parameters for URL compatibility. These are not unfinished runtime editors. Supported flat compatibility exports and relevant historical specifications remain intentionally retained.

Use the [package guide](../../../docs/design-system/getting-started.md) for new consumers and [component contracts](../../../docs/design-system/components.md) for local catalog APIs.

## Styling and interaction

Canonical component CSS owns control states, disabled/busy behavior, focus and responsive rules. Workbench CSS composes specimen layouts. Reuse semantic `--v2-*` tokens from `basics/tokens.css`; `foundations/tokens.css` is a compatibility entry. Only the light theme is supported.

New components need explicit props, supported states, constraints, a demonstrated consumer need and keyboard/interaction tests. Applications own persistence, authorization and domain workflows.

Catalog grids reflow to their available width, with 280px minimum columns (260px for button cells) capped at 100%. Preserve focus and overlay visibility; tables own their horizontal scroll regions.
