# Scene Grammar, Render & Handoff

## Layout — mirror what Figma's storyboard-import phase expects

The `figma` skill's Storyboards phase (used later by `video-animator`) parses a Figma SECTION by a
specific, mechanical grammar: frame-sized nodes are scenes, **scene order = x-position** (sorted
left-to-right), and TEXT nodes below the strip are director notes paired to the scene whose x-range
they overlap. Building your HTML storyboard in that exact shape now means the human's Figma import
(via html.to.design or manual recreation) preserves it with minimal rework, and `video-animator` can
parse it mechanically later instead of re-deriving structure.

Concretely, lay out one HTML page as a horizontal strip:

```html
<div class="storyboard-strip">
  <div class="scene" data-block="hook" style="width:<canvas-width>px">
    <!-- full scene content, exact canvas pixel size -->
  </div>
  <div class="director-note" data-for="hook">SLIDES LEFT — headline enters from off-canvas right</div>

  <div class="scene" data-block="intro" style="width:<canvas-width>px">...</div>
  <div class="director-note" data-for="intro">TEXT LINES REVEAL ONE AFTER THE OTHER</div>

  <!-- ...one pair per present block, in structural order... -->
</div>
```

`.storyboard-strip` is `display:flex; flex-direction:row` with each `.scene` at the exact target
canvas width/height (no scaling) and its `.director-note` sitting directly beneath it in normal
document flow — matching "director notes are TEXT nodes below the strip, paired by x-range overlap."
Keep gutters between scenes modest and consistent; Figma import tools handle simple flexbox rows
well, don't nest anything more exotic than needed.

## Director-note vocabulary (shared with the `figma` skill's storyboard parser)

| Note | Use for |
|---|---|
| `EXPLOSION / BURST` | Incoming scale ~1.5→1 + fade — high-energy scene starts |
| `SLIDES / SLIDE TO THE... / SCROLL` | Directional slide-in from a named edge |
| `MORPH / REVEALS` | Crossfade, or a same-scene internal reveal if the motion is inside one frame |
| `CYCLE THROUGH / EACH ONE` | A longer hold, or an internal item-by-item animation |
| (no fitting verb) | Write one plain sentence of intent — the parser falls back to a crossfade + slow drift, which is a fine default for a scene with no strong motion idea |

Pick the verb that matches your actual intent for that scene — don't default to the same note on
every scene, and don't invent motion the static frame doesn't visually support (e.g. don't write
`EXPLOSION` under a calm proof-point scene).

## Render

Same command shape as `static-banner-design`, run once per scene at the target canvas size, plus
once for the full-strip contact sheet:

```bash
# one-time, if not already installed:
npx --yes playwright install chromium

# one scene:
npx --yes playwright screenshot --viewport-size=1080,1920 --wait-for-timeout=400 \
  "file:///<absolute-path>/scene-hook.html" "<output>/frames/hook.png"

# full strip (viewport width = sum of scene widths + gutters, height = canvas height + note space):
npx --yes playwright screenshot --viewport-size=<strip-width>,<strip-height> --wait-for-timeout=400 \
  "file:///<absolute-path>/storyboard-strip.html" "<output>/storyboard-contact-sheet.png"
```

See `static-banner-design/SKILL.md` for the Windows `file://` URL note (`cygpath -w`, forward
slashes) if `net::ERR_FILE_NOT_FOUND` shows up.

## Self-check

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/check_frame.py <output>/frames/hook.png 1080 1920
```

Same ffprobe-based dimension/integrity gate as `static-banner-design`'s `check_banner.py` — run it
per scene frame. Then grep every scene's source HTML for `[PLACEHOLDER` before/after rendering, and
Read each rendered PNG directly (the Read tool supports images) to visually confirm legibility,
safe-zone compliance, and that nothing reads as an accidental duplicate of another scene.

## Manifest

Write `<output>/storyboard.json` alongside the frames:

```json
{
  "aspect": "1080x1920",
  "scenes": [
    {"block": "hook", "order": 0, "frame": "frames/hook.png", "html": "scene-hook.html",
     "directorNote": "SLIDES LEFT — headline enters from off-canvas right",
     "researchBasis": "reel #3's close-up-face open, highest ER in the report"}
  ]
}
```

This is what `video-animator` and `creative-resizer` read to know scene order, aspect, and intent
without re-deriving it from the HTML/PNGs.

## Figma handoff record

Write `<output>/figma-handoff.md`:

```md
# Figma handoff — [project] storyboard

- Storyboard rendered: [date]
- Contact sheet: storyboard-contact-sheet.png
- Import method used: [html.to.design / manual recreation from PNG reference / other]
- Figma file: [PLACEHOLDER — fill in once the human shares it back]
- Figma section/node: [PLACEHOLDER — fileKey:nodeId once known]
- Returned for animation: [PLACEHOLDER — yes/no, date]
```

Leave the placeholders blank — this file gets completed during Stage 3 (the human checkpoint), not
by this skill.
