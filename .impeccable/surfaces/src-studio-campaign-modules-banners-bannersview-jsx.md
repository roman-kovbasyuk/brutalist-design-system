---
version: 1
slug: "src-studio-campaign-modules-banners-bannersview-jsx"
primary_target: "src/studio/campaign/modules/banners/BannersView.jsx"
related_targets: ["src/studio/campaign/modules/banners/banners.css", "src/studio/campaign/modules/banners/bannerSelection.js", "src/components/design-system/molecules/SelectionTile.jsx", "src/components/design-system/molecules/selection-tile.css", "src/components/design-system/README.md", "src/components/design-system/examples/library-catalog.js"]
---

# Banners Surface Record

## Overview

Banners is an Operate surface in the six-module campaign workflow. A marketer combines existing copy and visuals with published templates, selects output dimensions, and verifies the resulting banner count before preparing review. This extension inherits [DESIGN.md](../../DESIGN.md), the current Avenir-family typography, cyan controls, offwhite application canvas, black rules, and enclosing rounded module cards. It introduces no replacement visual world, global tokens, or generated imagery.

The implemented surface follows the [approved selection workflow](../../docs/superpowers/specs/2026-09-06-banner-selection.md). The Design panel shows all available templates for the current copy, visual, and preview proportion. A template without a matching proportion displays an unavailable-preview message. A requested library template moves to the front without changing the saved selection. Artwork comes from existing template manifests and stored visuals; previews render with playback stopped.

## Colors

Existing semantic tokens supply white tile surfaces, black borders and text, and cyan selected tiles and the count circle. Secondary labels use the established secondary-text role. A selected SelectionTile maps that role to ink so size dimensions remain readable on cyan. Selection also has a persistent check indicator and pressed-button semantics.

## Typography

Application typography remains inherited. The total uses the H3 token (24px) and tabular numerals. Filter labels, dimensions, explanatory labels, and saved-selection metadata use the small-text token (14px). Captions and saved-content descriptions wrap; banner artwork retains its own template typography.

## Layout

The count and Send to Figma action sit above the shared Design and Sizes & formats tabs, keeping the summary available in either panel. The circle shows selected designs multiplied by selected sizes, with the factors written beside it. Toolbars and confirmation actions wrap when space is limited.

Both grids respond to the Banners module's container width, as implemented in [module CSS](../../src/studio/campaign/modules/banners/banners.css):

| Module width | Design and size grids | Design filters |
| --- | --- | --- |
| Below 480px | One column | Stacked |
| 480px to below 800px | Two equal columns | Stacked |
| 800px and above | Three equal columns | Copy and Visual share flexible columns; Preview proportion is 180px |

These are container queries, not viewport breakpoints. Main sections and grid items use the existing 24px spacing token. Size cards contain proportional rectangle icons in a 112px-high region; the total circle is 64px square. A native disclosure below the panels lists all selected template/content combinations and their remove actions.

## Elevation & Depth

Tiles are flat at rest with a structural border. Enabled hover uses the existing hard interactive shadow. Focus uses an ink outline with a visible offset. SelectionTile transitions use the shared fast duration and easing; reduced motion removes its transitions.

## Shapes

SelectionTile uses the standard small corner radius (4px), a circular action indicator, and clipped preview content. The total uses a circle; navigation retains the shared pill treatment. The surrounding module frame keeps its established shape.

## Components

The view composes AppButton, PillTabs/PillTabPanel, SelectMenu, EmptyState, PreviewDialog, and the new shared [SelectionTile](../../src/components/design-system/molecules/SelectionTile.jsx). Its canonical API is documented in the [library README](../../src/components/design-system/README.md) and [catalog](../../src/components/design-system/examples/library-catalog.js): `label`, `selected`, `onChange`, `disabled`, `children`, `caption`, and optional `className`. The entire tile is a native button with `aria-pressed`; its accessible name changes between Select and Deselect. The plus/check affordance appears on hover, keyboard focus, and touch, and remains visible when selected. Children and captions must be non-interactive. Selection identities, asset loading, layout, and persistence remain the caller's responsibility.

The [selection model](../../src/studio/campaign/modules/banners/bannerSelection.js) identifies a design by template ID and version, copy-set ID, copy ID, and visual direction ID. Changing preview filters preserves prior combinations. Copy-specific visuals retain their original copy pairing. Select all designs adds the visible combinations; when all are selected, the action deselects those visible combinations. Preview proportion does not change selected output sizes.

Sizes & formats filters placement dimensions by All formats, Social media, Google Ads, Stories, or Video. It shows sizes supported by every selected design and can add all shown sizes. Saved historical template versions retain previously validated sizes while their details load. Missing details, unsupported sizes, and changed source inputs block preparation with local recovery actions. Busy and read-only states block selection mutations; an empty copy/visual pair and empty size category have explicit guidance.

Send to Figma opens Verify your banners with designs, copy, visuals, sizes, and the total. The disclosure states that the package contains immutable PNGs for manual import into Figma, followed by adding the link in Review; designer checks and approval remain required. Video categories are size presets for this static package. Confirmation saves the selection and then requests review preparation. Failures retain the selection and show errors; after a successful save, retrying preparation reuses that saved submission.

## Do's and Don'ts

- Do preserve selections across preview changes and keep preview proportion independent of output dimensions.
- Do keep generic interaction behavior in the design system and campaign identities and review rules in Banners.
- Do retain the manual PNG import disclosure before review preparation.
- Don't promote this module's grid, count circle, or selection composition into global application rules.

## Review Evidence

The implementation handoff reports a final **ship** verdict for the scoped contrast fixes, with all listed fixes resolved. Recorded artifacts include [desktop](../review/banners/desktop.png), [mobile](../review/banners/mobile.png), [mobile verification dialog](../review/banners/mobile-confirm.png), and final size-panel captures at [desktop](../review/banners/sizes-final-1440.png) and [mobile](../review/banners/sizes-final-mobile.png).

This documentation pass read the implemented source and existing component contracts; it did not rerun the browser review, builds, or tests. The breakpoint values above are source observations. Root DESIGN.md, PRODUCT.md, and the shared design sidecar remain unchanged.
