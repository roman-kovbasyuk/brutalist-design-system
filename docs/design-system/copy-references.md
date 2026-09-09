# Catalog copy references

Basics, Components, and UI blocks use `TokenCopyTarget`. The label below the pointer shows the exact clipboard value. Copy buttons also support keyboard activation. Live preview controls retain their normal interactions; copy from the surrounding sample area or its copy action.

The sidebar's **Click to copy** switch enables or disables clipboard actions, copy cursors, and reference popovers across all three tabs. It starts enabled and remembers the preference locally. Turning it off leaves live previews usable.

- Tokens copy their canonical CSS custom-property name. Typography copies its font recipe. Icons copy their Lucide ID and selected size token.
- Shared controls copy their implementation name and relevant props, such as `AppButton variant="danger"`, `AppButton variant="primary" busy`, or `SelectMenu`.
- Example-only patterns copy the owning function and CSS selector, such as `DropdownFields — Autocomplete (.v2-combobox)`. These identify a recipe in the catalog source, not a standalone exported component.
- UI blocks copy `PromptInputBlock`, `SchedulingBlock`, or `SettingsBlock`, all in `src/components/design-system/examples/UIBlocks.jsx`.
- Group headings identify a component group; individual samples identify their own pattern.

## Finding an example-only reference

All paths below are relative to `src/components/design-system/examples/`.

| Owning function | Source |
| --- | --- |
| ControlSpecimens, NavigationSpecimens | ControlSpecimens.jsx |
| InputAnatomyFields, PickerFields, DropdownFields, AdvancedControlSpecimens | AdvancedControlSpecimens.jsx |
| FeedbackSpecimens, DataSpecimens, ContentObjectSpecimens, local StatusLabel | DataSpecimens.jsx |
| MotionSpecimens | MotionSpecimens.jsx |

Each sample declares `data-component-reference` explicitly. Grid cells reuse that value for pointer feedback and keyboard copy actions. References must describe the rendered sample; do not derive them from incidental DOM IDs or display copy. When a sample's variant changes, update its reference with the same state.
