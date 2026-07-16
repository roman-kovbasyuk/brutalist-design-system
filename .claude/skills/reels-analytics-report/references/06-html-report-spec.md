# Phase F — HTML Report: Data Contract & Feature Spec

## Data contract — one `reels/<id>.json` file per reel

`scripts/build_report.py` reads every `*.json` file in the folder you point it at and expects each
one to match this shape (fields filled in across phases A-E):

```json
{
  "id": "reel_01",
  "url": "https://instagram.com/reel/...",
  "caption": "...",
  "publishedAt": "2026-05-01",
  "durationSec": 27.4,
  "metrics": {
    "views": 123456,
    "likes": 4321,
    "comments": 210,
    "shares": 55,
    "saves": null,
    "engagementRate": 0.0368
  },
  "cover": {"dataUri": "data:image/jpeg;base64,..."},
  "storyboard": [
    {"t": 0.0, "dataUri": "data:image/jpeg;base64,...",
     "caption": {"scene": "...", "onScreenText": "...", "technique": "close-up-face"}}
  ],
  "hookVerdict": "...",
  "transcript": [
    {"start": 0.0, "end": 1.8, "text": "..."}
  ],
  "structure": [
    {"block": "hook", "present": true, "start": 0.0, "end": 2.5, "summary": "...", "frame": {"dataUri": "..."}},
    {"block": "intro", "present": true, "start": 2.5, "end": 6.0, "summary": "...", "frame": {"dataUri": "..."}},
    {"block": "key", "present": true, "start": 6.0, "end": 18.0, "summary": "...", "frame": {"dataUri": "..."}},
    {"block": "rehook", "present": false, "note": "рехук отсутствует"},
    {"block": "objection", "present": true, "start": 18.0, "end": 24.0, "summary": "...", "frame": {"dataUri": "..."}},
    {"block": "cta", "present": true, "start": 24.0, "end": 27.4, "summary": "...", "frame": {"dataUri": "..."}}
  ]
}
```

## What the generated HTML does

Running `scripts/build_report.py <reels_dir> <output.html> --account "@handle"` produces one
self-contained file (all CSS/JS inline, all images embedded as base64 — safe to double-click and
open offline) with:

- **Card gallery** — one card per reel: cover, caption, views/likes/comments/ER/duration/date.
- **Sort controls** — by views, likes, comments, ER, date, or duration, ascending or descending.
- **Storyboard scrubber** (inside each expanded card) — 14 clickable thumbnails; selecting one shows
  a larger preview, its timecode, its Phase C caption fields, and the transcript line covering that
  timestamp (or a "no speech" note).
- **Structure bar** — a proportionally-segmented, color-coded strip per reel; clicking a segment
  shows its summary and the transcript text spoken during that block. Absent blocks render as a
  hatched "missing" segment.
- **Collapsible full transcript** — click any line to jump the scrubber to the nearest covered frame.
- **Cross-reel summary** — average hook duration, share of reels with a rehook, average CTA start
  time, average ER, computed once in Python from all `reel.json` files (`compute_summary` in
  `scripts/build_report.py`).

## Extending it

The gallery/scrubber/structure logic lives entirely in the `JS` string inside
`scripts/build_report.py`, operating on the `REELS` / `SUMMARY` constants embedded at the bottom of
the generated HTML. To change a visual or add a metric, edit that script directly — there is no
separate template file to keep in sync.
