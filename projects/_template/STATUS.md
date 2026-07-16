# Project status — [account handle]

- **Account:** `@[handle]`
- **Requested reel count:** [N] <!-- video pipeline -->
- **Requested static post count:** [N] <!-- static pipeline, variant A only -->
- **Created:** [YYYY-MM-DD]
- **Last updated:** [YYYY-MM-DD]

Delete whichever pipeline's rows below don't apply to this project — most projects only run one.
**Stage 3 (Human Figma review) is a real pause, not something an agent completes on its own** — it
stays "waiting on human" until the person actually returns a Figma link.

## Video pipeline progress

| Stage | Status | Output | Notes |
|---|---|---|---|
| 0. Brief (human) | not started | `00-brief/campaign-request.md` | |
| 1. Research (`marketing-analyst`) | not started | `01-research/report.html` (+ `competitors/<handle>/` if any) | |
| 2. Design (`design-strategist`) | not started | `02-design/` (static storyboard — frames + `storyboard.json`, no HyperFrames) | |
| 3. Human Figma review | not started | `02-design/figma-handoff.md` | waiting on human until a Figma link comes back |
| 4. Resize/variant (`creative-resizer`) | not started / n/a | `resize-variants/` | optional — only if extra sizes/variants were requested |
| 5. Animate (`video-animator`) | not started | `03-creatives/` | the only stage that touches HyperFrames |

## Static-banner pipeline progress

- **Variant:** [A — research-driven / B — brief-driven]

| Stage | Status | Output | Notes |
|---|---|---|---|
| 0. Brief (human) | not started | `00-brief/campaign-request.md` | shared with video pipeline if both run |
| 1. Research (`static-creative-analyst`) — variant A only | not started / n/a (variant B) | `01-research-static/report.html` (+ `competitors/<handle>/` if any) | |
| 2. Design (`static-banner-designer`) | not started | `02-design-static/` (draft banners, no HyperFrames) | draft — pending human review |
| 3. Human Figma review | not started | `02-design-static/figma-handoff.md` | waiting on human until a Figma link comes back |
| 4. Resize/variant (`creative-resizer`) | not started / n/a | `resize-variants/` | optional |
| (no Stage 5 for this pipeline) | done once Stage 3/4 is confirmed | `03-creatives-static/` | human-approved pixels (Figma asset export) or resize-variants output — a static banner has no animate stage |

Status values: `not started` / `in progress` / `waiting on human` / `blocked — <reason>` / `done` / `n/a`.

## Blockers / open questions

- (none yet)

## Final deliverables

- Analytics report (video): 
- Rendered video(s): 
- Analytics report (static): 
- Final banner set (static): 
