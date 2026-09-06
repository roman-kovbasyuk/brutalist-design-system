# Banners module: approved selection workflow

The Banners module assembles existing copy and visuals in predefined templates. It is not a freeform design editor and does not generate images.

- Keep the six-module campaign chain and the application sidebar unchanged.
- Two application design-system tabs: **Design** and **Sizes & formats**.
- Design displays every available template. Controls choose copy, visual, and one preview proportion (square, horizontal, vertical). All previews use that proportion. Copy-specific visuals retain their copy pairing.
- Select any template/content combinations, or all visible designs. Switching preview controls does not overwrite earlier selections. Selection actions appear on hover, keyboard focus, and touch.
- Sizes & formats displays selectable size cards, proportional rectangle icons, dimensions, and category filters including Social media, Google Ads, Stories, and Video. Categories describe placement dimensions, not promises of video export.
- Preview proportion and selected output sizes are independent.
- A persistent summary states designs × sizes = banners, with the total in a circle.
- Before review handoff, a modal verifies selected designs, content, sizes, and total. Saving and rendering failures preserve the selection and permit safe retry.
- Persist the full selection, render every selected combination, and include every output in the immutable reviewed/delivered package. Preserve authorization, source provenance, idempotency, and designer approval requirements.
- Figma currently has a manual package/import-and-link integration. Be explicit about it; never claim an automatic external Figma write. Preparing a package must not mark designer review or approval complete.

Use existing application design-system components first. New generic interaction patterns belong there; banner-specific state and selection rules belong in the Banners module.
