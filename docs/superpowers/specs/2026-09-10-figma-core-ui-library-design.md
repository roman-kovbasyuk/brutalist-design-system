# Project-X Figma Core UI Library

Date: 2026-09-10  
Status: Approved design; implementation pending written-spec review

## Goal

Create a reusable Figma component library in the Project-X file that mirrors the repository's canonical design-system foundations and core UI contracts. The library is for design reuse and developer handoff; it does not change the existing campaign screens or introduce new product behavior.

Figma file: `DYRe17Xrx20gbKU2Widv5A`  
Reference node: `100:71` (`Desugn Systen`)  
Current Figma page: `Page 1`

## Scope

### Foundations

Create and document the complete source foundation set:

- Color: primitive palette plus semantic light-mode roles.
- Typography: Avenir Next family, heading/body roles, sizes, line heights, and weights.
- Spacing: the source 4/8/12/16/24/32/48/64 scale.
- Shape and sizing: control heights, icon sizes, border width, and radii.
- Elevation: small, interactive, and floating offset shadows plus z-index references.
- Motion: fast/disclosure durations and the canonical easing curve.
- Layout: Stack, Inline, Grid, Container, Divider, ScrollArea, and Surface.
- Icons: the documented Lucide icon set and supported 16/20/24/32/48 sizes.

Variables will use a primitive-to-semantic architecture. Semantic variables will alias primitives, use explicit scopes, and preserve the source CSS custom-property names in code syntax. The application is light-only for this pass; no dark-mode behavior will be invented.

### Core UI components

Build the reusable components already owned by `src/components/design-system/`, excluding feature-specific organisms, examples, campaign workflow modules, and page-level UI blocks:

- Actions: `AppButton`, `TextAction`.
- Forms: `TextField`, `TextArea`, `CheckboxField`, `RadioGroup`, `SelectField`, `SwitchField`.
- Navigation: `Breadcrumbs`, `Pagination`, `SegmentedControl`, `Stepper`, `Tabs`.
- Feedback: `Alert`, `ErrorState`, `Progress`, `Skeleton`, `StatusBadge`.
- Selection: `Combobox`, `MultiSelect`.
- Content and data: `ActionCard`, `FactGrid`, `InlineText`, `SelectionTile`, `BulkActionBar`, `FilterToolbar`, `Table`.
- Files: `FileDropzone`, `FileList`.
- Overlays: `Dialog`, `Drawer`, `Popover`, `Tooltip`, `Menu`.
- AI: `AIResult`, `AITaskStatus`.

Provider-only helpers such as `ToastProvider` are documented as dependencies where relevant, but are not treated as standalone visual components in this pass.

## Figma information architecture

Create the following pages, leaving existing Page 1 campaign artifacts intact:

1. `00 Cover`
2. `01 Foundations`
3. `02 Layout`
4. `03 Components / Actions`
5. `04 Components / Forms`
6. `05 Components / Navigation`
7. `06 Components / Feedback`
8. `07 Components / Selection`
9. `08 Components / Content & Data`
10. `09 Components / Files`
11. `10 Components / Overlays`
12. `11 Components / AI`
13. `12 Utilities`

Each component family page will contain a short usage note and source reference. Related controls may share a page, but each reusable component remains independently named, described, and validated.

## Component construction rules

- Use auto-layout for component internals and specimens.
- Bind fills, strokes, text, padding, gaps, and radii to semantic variables wherever the source contract defines them.
- Keep fixed geometry only for icon grids, structural dividers, and other intentionally fixed primitives.
- Create variant sets around the source API: visual variant, size, state, and boolean/property axes only where they improve reuse.
- Avoid combinatorial state explosions. Interaction states that do not need independent design inspection should be documented as states rather than multiplied into every variant matrix.
- Use text, boolean, and instance-swap properties for source-aligned customization; use instance-swap for icons.
- Add component descriptions containing purpose, properties, supported states, usage, and constraints.
- Preserve existing campaign symbols and screen content. New library objects must have deterministic names and must not replace the existing module tree.

## Validation

For every foundation page and component family:

- Verify node hierarchy, naming, variant/property structure, and variable bindings with Figma metadata.
- Capture a visual screenshot and inspect spacing, typography, contrast, focus/state representation, and responsive specimens.
- Audit accessibility: text contrast, minimum 44px interactive targets, keyboard-visible focus states, and non-color-only status communication.
- Audit unresolved hardcoded visual values and duplicate/unnamed library nodes.
- Record created page, component, variable, and style IDs in a local state ledger so work can resume safely.

Code Connect mappings are optional follow-up work unless the Figma connection exposes a reliable mapping for the repository paths during implementation.

## Gap analysis and known constraints

- The repository already has the source truth for tokens and component contracts.
- Project-X Page 1 contains campaign screens, visual explorations, and some existing symbols/instances, including `AppButton` and `MediaWorkflowCard`, but not an organized foundations/components library.
- Figma library searches returned unrelated third-party kits and no safe reusable match for this source system's API/token model; rebuild locally is the selected approach.
- The Figma `use_figma` inventory call was rejected by the host usage limit during discovery. Before mutation, local Figma variables/components/styles must be rechecked through the available read-only or mutation-capable Figma path. If the limit persists, implementation is blocked rather than approximated.
- Existing repository changes in the worktree are unrelated to this Figma-only task and must be preserved.

## Non-goals

- Do not redesign or rewrite the campaign screens in Page 1.
- Do not create feature-specific campaign modules, organisms, templates, or UI blocks in this pass.
- Do not invent dark mode, new product states, backend behavior, or permissions.
- Do not import third-party libraries merely because they have similarly named components.
