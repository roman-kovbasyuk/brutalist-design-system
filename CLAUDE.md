# Lingu Agents — Marketing Pipeline System

A closed-loop Claude Code system that turns a social account into researched, on-brand marketing
creative — video or static — with a **real human review checkpoint in Figma** built into both
pipelines. HyperFrames (motion) only ever runs at the very last video step, after a human has
approved the static design.

## The stage model (both pipelines share this shape)

```
Stage 0  Brief            standardized campaign request — human-approved before anything runs
Stage 1  Research           marketing-analyst / static-creative-analyst (+ competitors, if listed)
Stage 2  Design               design-strategist / static-banner-designer — STATIC output only
Stage 3  Human Figma review     human imports the draft into Figma, edits, shares the link back —
                               a genuine pause, never simulated
Stage 4  Resize / variant         creative-resizer — OPTIONAL
Stage 5  Animate (video only)       video-animator — the ONLY agent that ever touches HyperFrames
```

The static-banner pipeline ends at Stage 4 (or 3, if no resize/variant pass is needed) — a static
banner has no motion stage.

## Why design moved out of HyperFrames

Previously `design-strategist` produced a first-draft HyperFrames composition directly. That locks
in motion decisions before a human has seen the static design, is expensive to revise, and isn't
reviewable by a non-technical marketer. Now: **design produces static frames only** (one storyboard
frame per structural block for video, one banner per size for static ads), a human reviews and
corrects them in Figma, and only the human-approved result ever reaches HyperFrames — via
`video-animator`, the single agent in this system that has HyperFrames access at all.

## Figma: read-only, by design — confirmed, not assumed

The vendored `figma` skill states explicitly it never writes to Figma (its own auth section: "it
never writes to Figma," read-only scopes only). There is no REST or MCP path — even with a valid
personal access token — to create or edit Figma file content from outside Figma. This is a hard
platform constraint, not a missing feature to work around. So the handoff direction is fixed:

- **Out to Figma:** an agent renders clean HTML/PNG and writes `figma-handoff.md` with plain
  instructions — the human imports it themselves (the official **html.to.design** Figma plugin is
  the standard path). No agent claims to have "pushed to Figma."
- **Back from Figma:** read-only, via the `figma` skill — Phase 1 (asset export, literal approved
  pixels), Phase 3 (component import, structured editable HTML for `creative-resizer`'s reflow), and
  the Storyboards phase (frame-diffing → element chains → motion, for `video-animator`).

## Pipeline 1 — Video

1. **Stage 0 — Brief.** Standardized campaign request (marketing input + competitor analysis +
   marketer's document) — see `.claude/skills/marketing-design/assets/campaign-request.template.md`.
   Human-confirmed before Stage 1.
2. **Stage 1 — Research.** `marketing-analyst` scrapes/analyzes Reels via Apify MCP
   (`reels-analytics-report` skill) → self-contained analytics HTML report. Runs again per
   competitor handle the brief listed.
3. **Stage 2 — Design.** `design-strategist` turns research into a **static storyboard** — one
   designed frame per structural block (hook/intro/key/rehook/objection/cta), each with a director
   note, no HyperFrames anywhere (`static-storyboard-design` skill). Ends at `figma-handoff.md`.
4. **Stage 3 — Human Figma review.** The human imports the storyboard into Figma, arranges it as a
   SECTION of scene frames with director notes below (the exact grammar the `figma` skill's
   storyboard-import phase parses), edits, and shares the link back.
5. **Stage 4 — Resize/variant (optional).** `creative-resizer` — only if more sizes/variants of the
   approved storyboard were asked for.
6. **Stage 5 — Animate.** `video-animator` reads the confirmed Figma storyboard via the `figma`
   skill's Storyboards phase (frames are keyframes, not slides — element chains, not stills),
   assembles the HyperFrames composition, polishes with `hyperframes-animation`, verifies with
   `npx hyperframes check`, and renders the final video.

## Pipeline 2 — Static banners

Same Stage 0/3/4 shape; no Stage 5 (a static banner has no motion). Two entry variants for Stage 1/2:

- **Variant A (research-driven)** — `static-creative-analyst` scrapes organic posts and, when
  relevant, Meta Ad Library banners (`static-creatives-report` skill: `apify/instagram-post-scraper`
  + `apify/facebook-ads-scraper`, confirmed via a live discovery pass) → `static-banner-designer`
  drafts from that research.
- **Variant B (brief-driven)** — skip Stage 1 entirely; `static-banner-designer` drafts straight
  from a filled-in marketing brief.

`static-banner-designer`'s rendered PNGs are **drafts**, not the final deliverable — final banners
come from the human's Figma-approved pixels (Stage 3, via a `figma asset` export) or from
`creative-resizer`'s output (Stage 4).

## Default entry point

This project's default session agent is `orchestrator` (set via `.claude/settings.json`). Running
`claude` in this folder starts you directly in the orchestrator. Describe the account/campaign you
want run — the orchestrator walks you through Stage 0, infers which pipeline you mean, and pauses
for real at Stage 3 rather than pretending to complete a Figma import it structurally can't do.

To use a stage on its own, invoke it directly: `@marketing-analyst`, `@design-strategist`,
`@static-creative-analyst`, `@static-banner-designer`, `@creative-resizer`, `@video-animator`, or a
skill by name (e.g. `/reels-analytics-report handle 20`).

## Folder map

```
.claude/agents/       orchestrator, marketing-analyst, design-strategist, static-creative-analyst,
                        static-banner-designer, creative-resizer, video-animator
.claude/skills/        marketing-design (+ campaign-request.template.md), reels-analytics-report,
                        static-creatives-report, static-banner-design, static-storyboard-design,
                        hyperframes-* / figma (installed bundle)
projects/<slug>/       one folder per account/campaign — see projects/README.md
  STATUS.md             pipeline progress tracker (both pipelines tracked independently)
  00-brief/              campaign-request.md — Stage 0, human-approved
  01-research/            marketing-analyst output (+ competitors/<handle>/)
  01-research-static/      static-creative-analyst output (variant A only, + competitors/<handle>/)
  02-design/                design-strategist output: static storyboard + figma-handoff.md (DRAFT)
  02-design-static/          static-banner-designer output: draft banners + figma-handoff.md (DRAFT)
  resize-variants/            creative-resizer output (optional, either pipeline)
  03-creatives/                 video-animator's final rendered video(s) — HyperFrames only here
  03-creatives-static/           final banner set (static pipeline)
```

Each subagent starts with a fresh context window, so stages hand off through `projects/<slug>/`
files, not shared memory. Always read `STATUS.md` before resuming a project — `waiting on human` at
Stage 3 is a valid, expected status, not a stall to work around.

## Prerequisites (see README.md for setup steps)

- `APIFY_TOKEN` — required for Stage 1 research in either pipeline (variant A). Not needed for the
  static pipeline's brief-driven variant B.
- `FIGMA_TOKEN` — required for Stage 3's read-back and everything after it (Stage 4, Stage 5).
  Read-only scopes only; this integration never writes to Figma.
- `ffmpeg` and Node (`npx`) on PATH — required by HyperFrames (Stage 5 only, video pipeline) and by
  every pipeline's Python scripts (`ffprobe` for image/frame dimension checks).
- Playwright's Chromium build — required by Stage 2 in either pipeline (draft rendering). One-time
  install: `npx --yes playwright install chromium`.

## Conventions

- Never commit real secrets. `.mcp.json` only ever references `${APIFY_TOKEN}`, never a literal
  token — the same discipline applies to `FIGMA_TOKEN` in any config file.
- Downloaded video/image/CDN URLs expire fast — always download media to disk before processing,
  never keep just a remote URL as the source of truth for a report.
- Design and campaign specifics (palette, tone, fonts) live in `.claude/skills/marketing-design/` —
  treat that skill as the template to customize per client, not this file. It applies identically to
  both pipelines.
- HyperFrames (`hyperframes`, `hyperframes-core`, `hyperframes-animation`, any `npx hyperframes`
  command) is scoped to `video-animator` and Stage 5 only. No other agent in this system should
  invoke it — that boundary is what guarantees every motion decision happens after human review, not
  before it.
- The `figma` skill is read-only by design — no agent should ever claim to have "pushed to Figma" or
  "completed a Figma import." The human does that step; agents write instructions and wait.
- New client/account → copy `projects/_template/` to `projects/<slug>/`.
