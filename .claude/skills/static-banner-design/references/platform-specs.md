# Static Platform Specs

Pick the size(s) the request calls for; default to Instagram Feed Square + Story/Vertical if
unspecified, and say so in your output.

| Placement | Pixels | Aspect | Safe zone notes |
|---|---|---|---|
| Instagram/Facebook Feed — square | 1080×1080 | 1:1 | Keep essential text/logo inside the center ~90% — feed crops are gentle but avoid touching the edge. |
| Instagram/Facebook Feed — portrait | 1080×1350 | 4:5 | Same center-safe rule; this is the highest-real-estate feed format, use it for text-heavy static ads. |
| Instagram/Facebook Story or Reel-cover static | 1080×1920 | 9:16 | Keep text inside the center ~80% width / ~75% height — top and bottom are covered by platform UI (profile bar, CTA sticker, reply bar), same rule the video pipeline's `marketing-design` skill already documents for Reels. |
| Facebook link/collection ad | 1200×628 | 1.91:1 | Landscape — logo/CTA typically bottom-left or bottom-right; leave the right ~20% clear if the placement overlays a "Learn More" button. |
| Google Display (common) | 300×250, 336×280, 728×90, 160×600 | varies | Small canvases — one headline, one CTA, minimal copy; test legibility at actual size, not zoomed in. |
| Generic square social/display | 1200×1200 | 1:1 | Higher-res twin of the IG square spec, for placements that don't compress as aggressively. |

## Cross-platform rules

- The rendered PNG **is** the deliverable — there's no "safe zone will be cropped later" excuse;
  render at the exact target pixels and keep everything essential inside the safe zone described
  above.
- Match text size to the platform's real viewing context: a 300×250 Google Display unit is often
  seen at literal 300×250 px, not full-screen — don't reuse Story-scale type sizes there.
- If the brief/research calls for a carousel/multi-card ad, render each card as its own correctly
  sized PNG (usually 1080×1080), not as panels inside one oversized image.
