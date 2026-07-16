---
name: static-creatives-report
description: Scrapes an account's static creative — organic image/carousel posts via Apify, and optionally paid banners via the Meta Ad Library — downloads and visually analyzes layout/copy/CTA patterns, and builds one self-contained HTML analytics report. Use for "analyze this account's static posts/ad banners" requests, or as the core procedure of the static-creative-analyst agent.
argument-hint: [account] [count]
arguments: [account, count]
---

# Static Creatives Report

Turns `$account`'s last `$count` static posts (plus, when relevant, its live Meta Ad Library
banners) into one self-contained HTML analytics report: metrics, a hero image per creative, an
agent-authored layout/copy breakdown (headline, subhead, CTA, proof zones), and cross-set pattern
notes. This is the **static** sibling of `reels-analytics-report` — same rigor, no video: there is
no storyboard/transcript/structure-timing phase because a static creative has no timeline, only a
layout.

Output convention: everything goes under the output folder you were given (normally
`projects/<slug>/01-research-static/`):

```
01-research-static/
  raw/                      downloaded source images (gitignored, disposable after extraction)
  creatives/
    static_01.json           one consolidated JSON per creative — the data contract below
    static_02.json
    ...
  report.html                 final deliverable, built by scripts/build_static_report.py
```

## Phase A — Data collection

Use the Apify MCP tools to scrape:

1. **Organic static posts** (required) — the account's last `$count` non-Reel posts (single image
   or carousel).
2. **Paid ad banners** (optional, only if the request or the account's own ad activity calls for
   it) — the account's live/recent creative in the Meta Ad Library.

Full detail on which actors to use, what fields to capture, and how to compute engagement rate:
[references/01-data-collection.md](references/01-data-collection.md).

## Phase B — Image preparation

Download every hero/carousel image first (CDN links expire fast — never keep a remote URL as the
source of truth), then re-encode each to a base64 data URI with:

```
python3 ${CLAUDE_SKILL_DIR}/scripts/prepare_image.py <image_url> <out.json> --raw-dir <output>/raw
```

This shells `ffmpeg` (already a project prerequisite) to resize/re-encode, so no extra Python
dependency is needed. Run it once per hero image and once per additional carousel/ad-card image.

## Phase C — Visual & layout analysis (you do this — visual judgment, not scriptable)

Look at each downloaded image and write the layout zones (headline, subhead, CTA, proof/social
proof, logo/lockup), color notes, and one technique verdict per creative — the static equivalent of
the video skill's hook analysis. Rubric and zone taxonomy:
[references/02-visual-analysis.md](references/02-visual-analysis.md).

## Phase D — Assemble the report

Once every creative has a complete `creatives/static_NN.json` (schema in
[references/03-html-report-spec.md](references/03-html-report-spec.md)), build the final HTML:

```
python3 ${CLAUDE_SKILL_DIR}/scripts/build_static_report.py <output>/creatives <output>/report.html --account "$account"
```

This produces one self-contained file — no external requests, all images inlined as base64. Open it
and confirm the gallery, sorting, and zone-detail panels all work before reporting done.

## Relationship to the video pipeline

This skill does not touch `01-research/`, `02-design/`, `03-creatives/`, or any HyperFrames file —
it is a fully separate, additive track that happens to share the same Apify MCP access and the same
`projects/<slug>/` root. Running it never changes the state of an account's video-pipeline stages,
and vice versa.
