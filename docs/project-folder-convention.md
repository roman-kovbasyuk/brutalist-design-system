# Project Folder Convention

Every account/campaign lives in its own folder under `projects/`, following the same structure.
One project folder can carry either or both pipelines' output at once — they occupy disjoint
subfolders and never interfere with each other.

## Starting a new client

```
cp -r projects/_template projects/<new-client-slug>
```

(the `orchestrator` agent does this automatically when asked to run a pipeline for an account it
hasn't seen before — slug = lowercased handle, `@` stripped, non-alphanumerics replaced with `-`)

## Structure

```
projects/<slug>/
  STATUS.md                  pipeline progress tracker — read this FIRST when resuming a project

  00-brief/                    campaign-request.md — Stage 0, the standardized intake (marketing
                               input + competitor analysis + marketer's brief), human-approved
                               before Stage 1 starts. Shared by both pipelines.

  # video pipeline
  01-research/                 marketing-analyst output (+ competitors/<handle>/ if the brief listed
                                any)
  02-design/                    design-strategist output: a STATIC storyboard (frames +
                                storyboard.json, no HyperFrames) plus figma-handoff.md — a DRAFT
  03-creatives/                   video-animator's final rendered video(s) — the only folder that
                                ever contains HyperFrames render output

  # static-banner pipeline (no HyperFrames anywhere)
  01-research-static/            static-creative-analyst output (variant A only, +
                                   competitors/<handle>/ if any)
  02-design-static/                static-banner-designer output: draft banner HTML/PNG (and/or a
                                   filled-in marketing brief for variant B) plus figma-handoff.md
  03-creatives-static/               final banner set: the human's Figma-approved pixels, or
                                   creative-resizer's output

  # shared, optional
  resize-variants/                 creative-resizer output — sizes/ and variants/ — only present if
                                   a resize/variant pass was requested after Stage 3
```

## `STATUS.md` is the source of truth — including "waiting on human"

Every subagent in this system starts with a **fresh context window** — it has no memory of prior
runs. `STATUS.md` is therefore the only durable record of progress, and it now needs to represent a
state no earlier version of this system had: genuinely paused, waiting on a person, at Stage 3
(Human Figma review). `waiting on human` is a normal, expected status — don't treat it as a stall to
work around, and don't ever mark Stage 3 done without an actual Figma link the human provided.

## What's gitignored inside a project folder

- `01-research/raw/` — downloaded source video. Disposable once frames/transcripts are extracted.
- `01-research-static/raw/` — downloaded source images. Disposable once base64 versions are
  embedded in the static report.

Everything else — brief, analytics reports, storyboard/banner drafts, `figma-handoff.md`,
resize-variants, and final creatives — is tracked in git so the whole team can see progress and
finished work without re-running any stage.

## Customizing brand direction per client

Save a filled-in copy of `.claude/skills/marketing-design/assets/brand-brief.template.md` (and
`brand-tokens.template.css`) into that client's `02-design/` or `02-design-static/` folder — brand
tokens are shared identically across both pipelines — rather than editing the shared skill template.

- Video pipeline: pin a preferred Apify actor for scraping/transcription in
  `.claude/skills/reels-analytics-report/references/01-data-collection.md` and
  `references/04-transcription-sync.md` — otherwise the skill discovers one dynamically each run.
- Static pipeline: actors are already pinned in
  `.claude/skills/static-creatives-report/references/01-data-collection.md`.
- Static pipeline's brief-driven variant (B) uses the Stage 0 brief directly — no separate
  brief-input template of its own; `static-banner-designer` reads Section 1 + Section 3 of
  `00-brief/campaign-request.md`.
- Stage 0: save the filled-in
  `.claude/skills/marketing-design/assets/campaign-request.template.md` copy into `00-brief/`.

## Existing example projects

`projects/duolingo/` and `projects/fast-track-norwegian/` predate this stage model — they were built
under the old flow (HyperFrames draft directly in `02-design/`, no Figma checkpoint). They're left as
historical reference, not migrated; new projects follow the six-stage model documented here.
