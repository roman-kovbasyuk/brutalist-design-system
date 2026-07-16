# Project status — @duolingo

- **Account:** `@duolingo`
- **Requested reel count:** 20
- **Created:** 2026-07-16
- **Last updated:** 2026-07-16

## Pipeline progress

| Stage | Status | Output | Notes |
|---|---|---|---|
| 1. Research (`marketing-analyst`) | done | `01-research/report.html` | Scraped + analyzed last 20 reels (apify/instagram-reel-scraper + crawlerbros/instagram-transcript-scraper). 20/20 processed, all storyboards/transcripts/structure segmented. |
| 2. Design (`design-strategist`) | not started | `02-design/` (HyperFrames composition) | |
| 3. Animate (orchestrator + HyperFrames skills) | not started | `03-creatives/` | |

Status values: `not started` / `in progress` / `blocked — <reason>` / `done`.

## Blockers / open questions

- `shares` and `saves` metrics are not exposed by the Apify actor used (`apify/instagram-reel-scraper`) even with the add-on enabled — both are `null` for all 20 reels in the report.
- Automated Whisper transcription (`crawlerbros/instagram-transcript-scraper`) only completed segment-level transcripts for 9/20 reels before its run hit Apify's cost cap; the remaining 11 reels use the flat single-line transcript captured during the initial scrape (noted inline in each reel's transcript array) — mostly fine since these reels are music/caption-driven with burned-in bilingual captions, not spoken dialogue.
- One reel (reel_12, duration 6.77s) has ~2s of tail frames that failed to extract due to an ffmpeg mjpeg-encoder quirk on that specific file; noted in its structure block.

## Final deliverables

- Analytics report: `projects/duolingo/01-research/report.html`
- Rendered video(s): (pending — stages 2–3 not started)
