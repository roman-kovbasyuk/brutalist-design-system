---
name: static-banner-design
description: Turns research or a marketing brief into on-brand static banner ad DRAFTS — HTML/CSS layouts rendered to flat PNG/JPEG images at real platform ad dimensions, ready for human review in Figma. Explicitly does NOT use HyperFrames (a static banner is one frame, not a timeline) — rendering goes through a headless-browser screenshot instead. Use when the user wants static banners/ad creative rather than an animated video, or when the static-banner-designer agent needs process/platform-spec direction.
---

# Static Banner Design

Produces **draft** static ad creative: single flat images (PNG/JPEG) at real platform ad
dimensions, on-brand, grounded in evidence rather than generic templates — a preview/handoff
artifact for human review in Figma, not automatically the finished deliverable. This is the static
sibling of `marketing-design` + `hyperframes` — same evidence-driven design discipline, but the
output is one frame, not a timeline, so it does not go anywhere near HyperFrames, `hyperframes.json`,
GSAP, or any `data-*` timing attribute. Don't invoke the `hyperframes` skill from this workflow.
The finished, deliverable creative comes later, after the human's Figma review (via `figma` skill
asset export, read-only) and, optionally, `creative-resizer`'s size/variant pass.

## Two entry variants

### Variant A — research-driven

Input: a completed `01-research-static/` folder from `static-creative-analyst` (or, if it exists,
`01-research/` from the video pipeline — its hook/structure findings are still useful context even
though it's Reels, not statics). Let the account's own top-performing layout patterns (zone layout,
CTA wording, color use) drive your design choices, exactly like `design-strategist` does for video —
cite the specific finding behind each choice.

### Variant B — brief-driven

Input: the confirmed Stage 0 brief,
[marketing-design/assets/campaign-request.template.md](../marketing-design/assets/campaign-request.template.md)
— Section 1 (marketing input) and Section 3 (the marketer's offer, key message, proof points, CTA,
mandatory copy/legal lines) are the operative fields; Section 2 (competitor analysis) is optional
context if the human filled it in. Use this variant when there's no useful static research to
ground the design in (brand-new account, no existing static creative worth analyzing, or the user
already knows exactly what the banner should say and just wants it built and rendered). Skip
straight to design — do not fabricate a research stage that didn't happen, and say in your output
which variant you used.

Both variants converge on the same design → author → render → self-check flow below.

## Apply brand direction

Use the `marketing-design` skill for palette, typography, voice, and the platform-specs mindset —
its brand tokens and Do/Don't rules apply identically to static creative. If the project folder has
a filled-in `brand-brief.template.md`/`brand-tokens.template.css`, use those; otherwise use the
skill's placeholder defaults and flag clearly that brand tokens still need filling in for this
client.

## Platform sizes

Pick the size(s) the request calls for (default to the two or three most likely placements if
unspecified — say which you defaulted to). Full dimension table, safe zones, and per-platform notes:
[references/platform-specs.md](references/platform-specs.md).

## Author the banner as plain HTML/CSS

Start from [assets/banner.template.html](assets/banner.template.html) — a canvas-sized, brand-token
-driven skeleton with safe-zone guide comments. Build the banner as you would any static page: exact
pixel canvas (`width`/`height` matching the target platform size), real brand colors/type, real copy
from the research or brief — never `[PLACEHOLDER` text in a shipped draft. No animation, no
timeline, no `class="clip"`, no GSAP: this is a single rendered frame, so plain CSS positioning is
the entire toolkit.

## Render to a flat image (no HyperFrames)

Use Playwright's own CLI screenshot command — a plain headless-browser screenshot, not a video
render. Verified working end-to-end in this project's environment (Node + `npx`, no project-level
install needed — Playwright fetches itself and, once, its browser binary):

```bash
# one-time, if not already installed:
npx --yes playwright install chromium

# render (repeat per size/variant):
npx --yes playwright screenshot \
  --viewport-size=1080,1350 \
  --wait-for-timeout=400 \
  "file:///<absolute-path-to>/banner.html" \
  "<output>/banner-1080x1350.png"
```

`--viewport-size` must exactly match the canvas dimensions from the platform-specs table so the
screenshot isn't cropped or letterboxed. `--wait-for-timeout` gives web fonts a moment to paint
before the shot. Render every required size as its own HTML file (or the same file with a
`?size=` query param your CSS reads) rather than trying to reuse one canvas across aspect ratios.

**Building the `file://` URL — Windows note.** On Windows (this project's default dev environment),
a plain POSIX-style path fails (`net::ERR_FILE_NOT_FOUND`) because the Node process resolves paths
as native Windows, not MSYS/Git-Bash paths. From Git Bash, convert first:

```bash
WINPATH=$(cygpath -w "$(pwd)/banner.html")
WINPATH_FWD=${WINPATH//\\//}
npx --yes playwright screenshot --viewport-size=1080,1350 --wait-for-timeout=400 \
  "file:///$WINPATH_FWD" "<output>/banner-1080x1350.png"
```

On macOS/Linux, a plain absolute path works directly: `"file:///$(pwd)/banner.html"`.

## Self-verify before reporting done

1. **Dimension/integrity check:**
   ```bash
   python3 ${CLAUDE_SKILL_DIR}/scripts/check_banner.py <output>/banner-1080x1350.png 1080 1350
   ```
   Fails loudly on a missing file, a suspiciously small file (blank/broken render), or a pixel size
   mismatch. Fix and re-render until it passes for every size.
2. **Placeholder sweep:** grep the source HTML for `[PLACEHOLDER` and any obviously-fake copy before
   rendering — don't hand off a banner with template text baked into the image.
3. **Visual read:** use the Read tool directly on the rendered PNG (Read supports images) and look
   at it the way a scroller would — text legible at a glance, safe-zone respected, CTA readable,
   contrast sufficient, nothing clipped at the canvas edge. This is the static equivalent of
   `design-strategist`'s `hyperframes check` headless-browser gate; there is no automated substitute
   for actually looking at the image.

## Hand off for Figma review — you cannot push to Figma yourself

Nothing in this system can write to Figma (the `figma` skill is explicitly read-only by design — no
REST or MCP path creates or edits Figma file content, even with a valid token). Write
`figma-handoff.md` next to your rendered banners with plain instructions for the human:

1. Import the rendered banner(s) into Figma — the official **html.to.design** plugin is the
   standard path (it can import your source HTML directly); use the PNG as visual reference if that
   route isn't available.
2. Review/edit in Figma.
3. Share the file/frame link back — that's what unblocks final delivery (a straight `figma asset`
   export of their approved pixels) or a `creative-resizer` pass if more sizes/variants are needed.

Never say you "completed" a Figma import, and never treat your own rendered PNG as the final
deliverable in your report — it's the draft that starts the human review.

## Do / Don't

- Do keep every design decision traceable to a specific research finding or a specific brief line —
  say which, in your final report.
- Do render every required size as a separate, size-correct PNG — never upscale/crop one render to
  fake another aspect ratio.
- Don't invoke `hyperframes`, `hyperframes-core`, `hyperframes-animation`, or any `npx hyperframes`
  command from this workflow — static banners are out of scope for that toolchain by design.
- Don't hand off a banner with literal `[PLACEHOLDER` text still baked into the rendered image.
- Don't claim a Figma import happened, or call your own render "final" — say clearly it's a draft
  pending human review.
