---
name: reels-analytics-report
description: Scrapes an account's recent Instagram Reels via Apify, storyboards and analyzes the first 10 seconds of each, transcribes and segments the full video into structural blocks, and builds one self-contained HTML analytics report. Use for "analyze this account's Reels/content performance" requests, or as the core procedure of the marketing-analyst agent.
argument-hint: [account] [count]
arguments: [account, count]
---

# Reels Analytics Report

Turns `$account`'s last `$count` Reels into one self-contained HTML analytics report: metrics, a
first-10-seconds storyboard with frame-by-frame hook analysis, a synced transcript, and a full
structural breakdown of every reel. Follow the six phases below **in order** — each one feeds the
next, and skipping the rigor (e.g. eyeballing frame timestamps instead of the 0.75s grid) breaks the
sync features in the final HTML.

Output convention: everything goes under the output folder you were given (normally
`projects/<slug>/01-research/`):

```
01-research/
  raw/                      downloaded videos (gitignored, disposable after extraction)
  reels/
    reel_01.json             one consolidated JSON per reel — the data contract below
    reel_02.json
    ...
  report.html                 final deliverable, built by scripts/build_report.py
```

## Phase A — Data collection

Use the Apify MCP tools to scrape the last `$count` Reels for `$account` and capture the metrics
fields, then compute engagement rate. Full detail, including how to discover the right actor:
[references/01-data-collection.md](references/01-data-collection.md).

## Phase B — Storyboard extraction

Download each video first (CDN links expire fast), then run
`python3 ${CLAUDE_SKILL_DIR}/scripts/extract_frames.py storyboard <video> <out.json>` to get the 14
base64 frames on the 0.75s grid. Detail:
[references/02-storyboard-extraction.md](references/02-storyboard-extraction.md).

## Phase C — Hook analysis (you do this — visual judgment, not scriptable)

Look at each of the 14 frames and write the caption fields (scene, on-screen text, retention
technique) plus one hook verdict per reel. Rubric and technique taxonomy:
[references/03-hook-analysis.md](references/03-hook-analysis.md).

## Phase D — Transcription + sync

Transcribe the full audio via a dynamically-discovered Apify transcription actor, with per-segment
timestamps. Detail: [references/04-transcription-sync.md](references/04-transcription-sync.md).

## Phase E — Structure segmentation (you do this — judgment call, not scriptable)

Segment the whole reel into six blocks (hook, intro, key, rehook, objection, cta) with timecodes, a
one-line summary each, and a representative frame for blocks past the first 10s (reuse
`extract_frames.py single <video> <timestamp> <out.json>`). Mark absent blocks as absent — never
invent one. Full definitions:
[references/05-structure-segmentation.md](references/05-structure-segmentation.md).

## Phase F — Assemble the report

Once every reel has a complete `reels/reel_NN.json` (schema in
[references/06-html-report-spec.md](references/06-html-report-spec.md)), build the final HTML:

```
python3 ${CLAUDE_SKILL_DIR}/scripts/build_report.py <output>/reels <output>/report.html --account "$account"
```

This produces one self-contained file — no external requests, all images inlined as base64. Open it
and confirm the gallery, scrubber, structure bars, transcript sync, summary stats, and sorting all
work before reporting done.
