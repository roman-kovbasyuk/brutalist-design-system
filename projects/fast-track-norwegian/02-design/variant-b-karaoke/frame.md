---
version: alpha
name: Fast-Track Norwegian — Frame (variant-b-karaoke)
description: >
  Video-first design system for Lingu / Fast-Track Norwegian, built DIRECTLY from the client's
  own brand-tokens.css / brand-brief.md (Figma-sourced) — no shipped frame-preset was remixed
  (BRIEF.md `style_preset: brand-tokens-direct`). Atoms are the royal-blue → periwinkle diagonal
  gradient, the spark logo mark, and the fully-rounded pill-radius chrome language shared with
  sibling variants A and C. This variant's whole point is near-zero scene motion — the karaoke
  caption typography IS the video.
unit: the frame — 1080×1920 (9:16 Reels/Stories), this campaign's only target format
principle: brand gradient always visible · pill radius everywhere · caption IS the motion

colors:
  bg-gradient-start: "#3A42FF"
  bg-gradient-end: "#A5A8FF"
  accent-deep: "#111AFA"
  glass-panel: "#0209BD"
  text-on-brand: "#FFFFFF"
  text-on-light: "#060B13"
  text-muted: "rgba(255,255,255,0.6)"
  label-pill-fill: "#3B42EA"

gradients:
  brand: "linear-gradient(135deg, #3A42FF 0%, #A5A8FF 100%)"
  brand-reverse: "linear-gradient(135deg, #A5A8FF 0%, #111AFA 100%)"

radii:
  pill-label: "17px"    # at 1200px-wide reference scale; scale proportionally to canvas width
  pill-panel: "34px"
  pill-button: "26px"
  pill-full: "999px"    # fully-rounded chrome, generic use

typography:
  # Inter = headlines (700) / body (500). Plus Jakarta Sans = CTA / price / labels (600/400).
  body:        { fontFamily: "Inter", weight: 500, lineHeight: 1.4, color: "text-on-brand" }
  hook-line:   { fontFamily: "Inter", cqw: 8.5, weight: 700, lineHeight: 1.15, tracking: "-0.01em", color: "text-on-brand" }
  karaoke-word:{ fontFamily: "Inter", cqw: 9.5, weight: 700, lineHeight: 1.2, color: "text-on-brand" }
  label:       { fontFamily: "Plus Jakarta Sans", px: 30, weight: 600, color: "text-on-brand" }
  price:       { fontFamily: "Plus Jakarta Sans", cqw: 11, weight: 700, color: "text-on-brand" }
  cta-button:  { fontFamily: "Plus Jakarta Sans", px: 34, weight: 600, color: "text-on-light" }
  code-caption:{ fontFamily: "Plus Jakarta Sans", px: 28, weight: 400, color: "text-muted" }

spacing:
  pad-x: "8cqw"
  safe-top: "12.5cqh"    # platform UI clears ~top 12.5% / bottom 25% on 9:16 Reels
  safe-bottom: "25cqh"

components:
  label-pill:
    backgroundColor: "{colors.label-pill-fill}"
    rounded: "{radii.pill-label}"
    description: "Houses spark logo mark + 'Fast-Track Norwegian' wordmark (Inter 700). Always visible somewhere in the campaign; this variant keeps it small/top on frames 1-2, full lockup on frame 3."
  promo-panel:
    backgroundColor: "{colors.glass-panel} at 24% opacity"
    rounded: "{radii.pill-panel}"
    description: "Frosted glass-morphism block housing '15% off' + 'with code FASTTRACK' + the CTA button. Frame 3 only."
  cta-button:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.text-on-light}"
    border: "1px solid rgba(6,11,19,0.15)"
    rounded: "{radii.pill-button}"
    description: "Solid white pill, dark text, flanked by narrow chevrons. Frame 3 only."
  spark-logo:
    asset: "assets/image_001.png"
    description: "4-point star mark, blue→teal→white gradient. Used as-is, never recolored/redrawn. Pulses (scale+glow) only on stressed karaoke words in Frame 2 — otherwise perfectly static."
  karaoke-word-active:
    textColor: "#FFFFFF"
    weight: 700
    description: "The one word/phrase currently 'spoken' — full opacity + a subtle scale-up (1.0→1.06) the instant its timestamp starts. Inactive words sit at ~38% opacity, same size, no motion — a static field the active word moves through."
---

# Fast-Track Norwegian — Frame (variant-b-karaoke)

## Overview

This is the **zero-motion karaoke** variant of a 3-variant campaign. Per `@duolingo` structural
research (`projects/duolingo/01-research/report.html`), the account's cheapest and most repeatable
high-performing format is a "reaction image + karaoke caption" reel with **no scene changes at
all** — the caption animation alone carries the whole video. This frame system recreates that
exact structural pattern, but on Fast-Track Norwegian's own royal-blue → periwinkle diagonal
gradient instead of a stock reaction photo, using the brand's own pill-radius UI chrome and
Inter / Plus Jakarta Sans type system.

**Key characteristics at frame scale:**

- **Brand diagonal gradient** (`#3A42FF → #A5A8FF`, 135°) fills every frame, full-bleed, always.
- **Fully-rounded pill chrome only** — label pill, promo panel, CTA button all pill-radius; never
  a sharp corner anywhere.
- **Inter 700** for the karaoke/hook headline type; **Plus Jakarta Sans 600/400** for CTA chrome.
- **The spark logo mark** (`assets/image_001.png`) is the only recurring brand asset — static
  except for a gentle beat-pulse on stressed words in Frame 2.
- **Almost no other motion.** No pans, no zooms, no cuts within a frame. The karaoke word-reveal
  IS the motion budget for the whole video — this is deliberate, not an oversight.

## Composition Rules

### Do

- Keep the brand gradient full-bleed behind every frame, same direction throughout (135°,
  `#3A42FF → #A5A8FF`) for visual continuity across all 3 frames.
- Keep all UI chrome pill-radius (`--radius-pill-label` / `-panel` / `-button` equivalents above).
- Center all typography inside the platform-safe zone (clear the top ~12.5% and bottom ~25% of a
  9:16 canvas, per Reels/Stories UI overlay).
- Let the karaoke word-highlight be the loudest motion element in the whole video; everything else
  (background, logo position, panel position) stays still once it has entered.
- Match Frame 3's CTA chrome pixel-for-pixel in spirit to sibling variants A/C — same pill radii,
  same panel opacity, same button treatment — so the 3-variant campaign reads as one shoot.

### Don't

- No sharp corners anywhere (breaks the pill-radius signature).
- No second background hue outside the blue/periwinkle family.
- No pans, parallax, or camera drift "to keep it alive" — stillness is correct here; per the
  research this format's low production cost IS the point.
- No live-action photography or footage anywhere in this variant.
- Body copy never sits in the Plus Jakarta Sans display face at small sizes below its floor —
  reserve Plus Jakarta Sans for CTA/label/price chrome only.

## Known gaps (flag, do not silently improvise)

- The brand brief's decorative script face **"Sweet Sucker Punch"** (used elsewhere in the Figma
  set only for an oversized "15%" flourish numeral) has no locally available font file for this
  build — no `@font-face` can be authored for it without fabricating a source. This build renders
  "15%" in Plus Jakarta Sans 700 instead. Flag for the client: license/export that face as a
  `.woff2` if the flourish numeral is wanted in a future pass.
- `brand-tokens.css` pill radii are specified at a 1200px-wide reference scale; this frame scales
  them proportionally for the 1080px-wide canvas (`px × 1080/1200`) rather than reusing the raw
  px values verbatim, so the pill proportions read correctly at this frame's actual width.
