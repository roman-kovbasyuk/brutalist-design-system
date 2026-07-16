# Phase D — HTML Report: Data Contract & Feature Spec

## Data contract — one `creatives/<id>.json` file per static creative

`scripts/build_static_report.py` reads every `*.json` file in the folder you point it at and expects
each one to match this shape (fields filled in across phases A-C):

```json
{
  "id": "static_01",
  "source": "organic",
  "type": "image",
  "url": "https://instagram.com/p/...",
  "caption": "...",
  "publishedAt": "2026-05-01",
  "isSponsored": false,
  "metrics": {
    "likes": 4321,
    "comments": 210,
    "engagementRate": null,
    "reachEstimate": null,
    "spend": null,
    "isActive": null
  },
  "hero": {"sourceUrl": "https://...", "dataUri": "data:image/jpeg;base64,..."},
  "additional": [
    {"sourceUrl": "https://...", "dataUri": "data:image/jpeg;base64,..."}
  ],
  "layout": {
    "zones": [
      {"label": "headline", "text": "...", "position": "top-third"},
      {"label": "cta", "text": "Learn more", "position": "bottom"}
    ],
    "colorNotes": "...",
    "techniqueVerdict": "..."
  }
}
```

`source` is `"organic"` or `"ad_library"`. `type` is `"image"` or `"carousel"`. Ad-only fields
(`reachEstimate`, `spend`, `isActive`, `isSponsored`) stay `null` for organic posts rather than
being omitted, so the report's sort/filter logic doesn't have to special-case missing keys.

## What the generated HTML does

Running `scripts/build_static_report.py <creatives_dir> <output.html> --account "@handle"` produces
one self-contained file (all CSS/JS inline, all images embedded as base64 — safe to double-click and
open offline) with:

- **Card gallery** — one card per creative: hero image, caption, source badge (organic/ad),
  likes/comments/date, and reach/spend when available.
- **Sort controls** — by date, likes, comments, or (for ads) reach estimate/spend, ascending or
  descending.
- **Zone detail panel** (inside each expanded card) — the hero image with a clickable list of its
  layout zones; selecting one shows the zone's transcribed text and position.
- **Additional-images strip** — thumbnails for carousel/ad-card extras, if any.
- **Cross-set summary** — creative count by source (organic/ad), average engagement (organic only),
  date range, and a simple zone-frequency tally (e.g. "CTA present: 8/10") computed in Python from
  all `static_NN.json` files (`compute_summary` in `scripts/build_static_report.py`).

## Extending it

The gallery/zone-panel logic lives entirely in the `JS` string inside
`scripts/build_static_report.py`, operating on the `CREATIVES` / `SUMMARY` constants embedded at the
bottom of the generated HTML — same pattern as `reels-analytics-report/scripts/build_report.py`.
There is no separate template file to keep in sync; edit the script directly.
