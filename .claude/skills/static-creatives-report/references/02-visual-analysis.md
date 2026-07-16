# Phase C — Visual & Layout Analysis

This is agent judgment, not a script — you're looking at each downloaded hero (and any additional
carousel/ad-card) image and describing what's actually on it. This is the static equivalent of the
video skill's Phase C hook analysis: same rigor, applied to a single frame instead of 14.

## Zone taxonomy

Identify which of these zones are present on each creative and transcribe their content. Not every
creative has every zone — mark absent zones as absent, never invent one.

| Zone | What it is | What to capture |
|---|---|---|
| `headline` | the largest/first-read text | exact text, approximate position (`top-third`, `center`, `bottom-third`) |
| `subhead` | supporting line under/near the headline | exact text, position |
| `proof` | social proof, stat, testimonial snippet, before/after | exact text or description, position |
| `cta` | the ask — button, arrow, "Swipe up", "Learn more" | exact text, position, whether it's a real button/pill or just text |
| `logo` | brand mark / lockup | position, size relative to frame (small corner mark vs. dominant) |
| `product` | product shot, screenshot, UI mock | what's shown, how much of the frame it occupies |

## Per-creative fields to write

- **`layout.zones[]`** — one entry per present zone (see schema in
  [03-html-report-spec.md](03-html-report-spec.md)).
- **`layout.colorNotes`** — dominant palette (2-4 colors), whether it's high-contrast or muted,
  whether it matches or contrasts with the platform's own chrome (white IG background, etc).
- **`layout.techniqueVerdict`** — one sentence: why this creative stops the scroll or converts, in
  concrete terms (e.g. "single bold stat as headline with product screenshot below — proof-led, no
  lifestyle photography").

## Cross-set pattern synthesis

After every creative has its per-item fields, look across the whole set (not scriptable — this is
where the value is) and note, directly on a few representative creatives or as a short closing
paragraph you paste into the report title/summary area if the build script exposes one:

- The most common zone layout (e.g. "headline top-third + CTA bottom, on 8 of 10 posts").
- The most common CTA wording/style.
- Whether paid banners (if scraped) diverge from organic posts in style, and how.
- Anything a designer should treat as this account's established static-creative "formula" —
  mirroring how the video skill's structure segmentation feeds `design-strategist`'s creative
  choices, this feeds `static-banner-designer`'s.

## Rubric

- Be concrete, not generic. "Bold headline, clean layout" is not a finding; "48pt+ headline
  occupying the top 25% of frame, single accent color reserved for the CTA pill" is.
- Quote real on-image text verbatim in `layout.zones[].text` — don't paraphrase.
- If a creative is a carousel/multi-card ad, analyze the first card in depth (it's the one that has
  to earn the swipe) and note briefly what the following cards do differently, if anything.
