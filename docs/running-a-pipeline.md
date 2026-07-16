# Running a Pipeline

## Stage 0 — the brief comes first

Launch Claude Code in the repo root (the `orchestrator` agent is the default session agent) and
describe the request. Before anything else, the orchestrator walks you through
`campaign-request.template.md` (marketing input, competitor analysis, marketer's brief) and saves a
confirmed copy to `00-brief/campaign-request.md`. For a quick/simple request it won't block on every
field — it fills in what it can infer and marks the rest "not specified" — but it will confirm the
brief with you before Stage 1 starts.

```
Run the video pipeline for @someaccount, last 20 reels.
```

```
Run the static-banner pipeline for @someaccount, last 15 posts.
```

```
Design static banners from this marketing brief — no research needed. [paste brief details]
```

The orchestrator infers which pipeline (and, for static, which variant) you mean, asking only if
genuinely ambiguous, and defaults to 20 reels/posts if you don't specify a count.

## Stages 1-2 run automatically; Stage 3 does not

Research (Stage 1) and design (Stage 2) run the same way this system always has — the orchestrator
spawns the right subagent, waits, confirms output, updates `STATUS.md`. Stage 2's output is
explicitly a **draft**: a static storyboard (video) or a set of draft banners (static), each with a
`figma-handoff.md` explaining how to get it into Figma (typically the html.to.design plugin).

**Stage 3 is a real pause.** The orchestrator relays those instructions, marks `STATUS.md`
`waiting on human`, and stops — it does not simulate a Figma import, because nothing in this system
can write to Figma (confirmed: the `figma` skill is read-only by design, even with a valid token).
Import the draft, edit it in Figma however you want, and come back with the file/section link. For
the video pipeline specifically, keep the scene frames arranged as a Figma SECTION ordered
left-to-right with director notes below each — that's the exact shape `video-animator` reads back.

## Stage 4 — resize/variant (say so if you want it)

If you need more sizes than Stage 2 rendered, or "variable" variants that recombine pieces from
different approved banners/scenes, say so once you're back with the Figma link:

```
Here's the approved Figma file: [link]. Also give me a 1080x1080 and a 1200x628 version.
```

The orchestrator spawns `creative-resizer`, which reads the approved design back in (read-only, via
the `figma` skill) and produces the additional sizes/variants in `resize-variants/` — without
altering what you approved. This stage only runs when asked.

## Stage 5 — animate (video pipeline only)

Once Stage 3 (and Stage 4, if it ran) is confirmed, the orchestrator spawns `video-animator`, the
only agent in this system with HyperFrames access. It reads the confirmed Figma storyboard, treats
the scene frames as keyframes (not slides — it reconstructs element-by-element motion between
states), applies any additional direction you give at this point, checks with `npx hyperframes
check`, and renders to `03-creatives/`. The static pipeline has no Stage 5 — it's done once Stage 3
(or 4) delivers the final banner set.

## Resuming a project

If `projects/<slug>/` already exists, the orchestrator reads `STATUS.md` first and resumes from the
next incomplete stage — including correctly recognizing `waiting on human` at Stage 3 as "nothing to
do until the human responds," not as an error state. It will **not** redo finished stages unless you
explicitly ask for a re-run.

## Running a single stage standalone

```
@marketing-analyst           → video research only
@static-creative-analyst        → static research only (variant A)
@design-strategist                → video design (static storyboard) only
@static-banner-designer              → static design (draft banners) only
@creative-resizer                       → resize/variant pass on an already-approved Figma design
@video-animator                            → animation only, requires a confirmed Figma storyboard
```

Or invoke the underlying skill directly by name, e.g. `/reels-analytics-report handle 20`.

## Adding brand constraints

Brand direction is shared identically across both pipelines. Mention it directly in your request
(e.g. "brand voice is playful, primary color is #58CC02"), or fill in
`.claude/skills/marketing-design/assets/brand-brief.template.md` and `brand-tokens.template.css` and
save a client-specific copy into `02-design/` or `02-design-static/`. If none is given, the design
agent uses placeholder defaults and flags that brand tokens still need to be filled in.

## What "done" looks like

**Video pipeline:** `00-brief/campaign-request.md` confirmed, `01-research/report.html`,
`02-design/` with a storyboard that passed `check_frame.py` and a completed `figma-handoff.md`
(link + "returned for animation: yes"), `resize-variants/` if requested, `03-creatives/*.mp4` from
`video-animator` with `hyperframes check` passing clean, `STATUS.md` marked done.

**Static-banner pipeline:** `00-brief/campaign-request.md` confirmed, `01-research-static/report.html`
(variant A) or the filled-in brief (variant B), `02-design-static/` with banners that passed
`check_banner.py` and a completed `figma-handoff.md`, `resize-variants/` if requested,
`03-creatives-static/*.png` as the final human-approved set, `STATUS.md` marked done.
