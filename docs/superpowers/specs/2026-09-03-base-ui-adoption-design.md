# Base UI adoption design

## Goal

Adopt Base UI as Lingu Studio's unstyled interaction-primitives layer without changing the existing visual design or widening the product scope.

## Considered approaches

1. **Targeted primitive migration (selected).** Add Base UI, replace the custom format selector and the three existing overlay implementations, and retain their current component APIs and CSS classes where practical. This removes the highest-risk hand-written focus and keyboard behavior while keeping the change reviewable.
2. **Format selector only.** Replace only `FormatSelect`. This is the smallest change, but leaves three different dialog implementations and does not establish a consistent overlay foundation.
3. **Full component-system abstraction.** Create project-wide wrappers for every future primitive before migrating call sites. This offers consistency but adds speculative architecture the current prototype does not need.

## Scope

- Install `@base-ui-components/react` using the existing npm workflow.
- Rebuild `FormatSelect` with Base UI Select while preserving its values, labels, icons, filter behavior, and existing visual treatment.
- Rebuild the video-cost confirmation, banner-detail preview, and asset preview with Base UI Dialog.
- Preserve the current public props and parent-owned state transitions.
- Preserve native `<select>` controls where custom presentation is unnecessary.
- Preserve the existing design tokens, class-based styling, responsive layout, and reduced-motion behavior.

The change does not introduce a general component library, Tailwind, global state, new routes, or new product behavior.

## Interaction design

The format control remains a button-like field with an icon, selected label, and chevron. Opening it exposes the same four options. Pointer selection, arrow-key navigation, Enter/Space selection, Escape dismissal, outside-click dismissal, and focus restoration are delegated to Base UI.

Each overlay keeps its present content and styling. Base UI owns modal semantics, focus management, Escape dismissal, backdrop interaction, and portal placement. Existing close and confirmation actions continue to call the same parent callbacks.

## Component boundaries

- `FormatSelect` remains local to `BannerWorkspace.jsx` because it is specific to banner-format filtering.
- `CostDialog` retains its current exported API.
- `BannerDetailDialog` remains local to `BannerWorkspace.jsx` because it depends on banner-specific preview controls.
- The asset preview remains local to `AssetWorkspace.jsx` because it is a single-purpose preview.

No generic wrapper is introduced until a repeated product-specific API emerges.

## Testing

Tests will be written before each production migration and observed failing for the missing Base UI behavior or structure. They will cover user-visible contracts rather than internal library details:

- The format selector opens, exposes the current selection, changes format by keyboard and pointer, closes with Escape, and restores focus.
- Each dialog exposes the correct accessible name and content, closes through its intended close action, and preserves confirmation behavior.
- Existing workflow and component tests remain green.
- The final verification runs the full test suite and production build.

## Success criteria

- Base UI is the only new runtime dependency.
- No hand-written listbox keyboard or document-level outside-click code remains in `FormatSelect`.
- The three overlays use one accessible dialog primitive.
- The rendered interface retains the established Lingu Studio appearance.
- All tests and the production build pass without warnings introduced by this change.
