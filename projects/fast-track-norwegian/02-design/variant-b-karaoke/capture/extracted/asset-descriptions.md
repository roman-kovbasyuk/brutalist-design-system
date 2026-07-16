# Asset inventory — variant-b-karaoke (no-capture project)

No site was captured — this is a script-driven promo with no live-action footage or
photography anywhere. The only real asset used is the brand logo mark, sourced from the
client's frozen Figma export:

- `image_001` — spark logo mark (4-point star, blue→teal→white gradient), PNG, used as-is
  inside the brand-blue label pill on Frame 1 (static), Frame 2 (beat-pulse on stressed
  words only), and Frame 3 (inside the CTA lockup pill). Source: `.media/images/image_001.png`
  (see `projects/fast-track-norwegian/.media/index.md` / `manifest.jsonl` for provenance).

Everything else in every frame is built from `brand-tokens.css` (gradient, pill geometry,
type) directly in HTML/CSS/SVG — no other imagery, icons, or photography is used. This
matches the hard constraint: motion graphics / kinetic typography only, no live-action.
