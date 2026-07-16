# Project Folder Convention

Every account/campaign lives in its own folder under `projects/`, following the same structure.

## Starting a new client

```
cp -r projects/_template projects/<new-client-slug>
```

(the `orchestrator` agent does this automatically when asked to run the pipeline for an account it
hasn't seen before — slug = lowercased handle, `@` stripped, non-alphanumerics replaced with `-`)

## Structure

```
projects/<slug>/
  STATUS.md            pipeline progress tracker — read this FIRST when resuming a project
  01-research/           marketing-analyst output: raw Apify data, downloaded video, extracted
                          frames, transcripts, and the final analytics report.html
  02-design/              design-strategist output: brand application notes and the first-draft
                          HyperFrames HTML/GSAP composition
  03-creatives/            final rendered video(s) after the HyperFrames animation/refinement pass
```

## `STATUS.md` is the source of truth

Every subagent in this system starts with a **fresh context window** — it has no memory of prior
runs. `STATUS.md` (plus the folder contents themselves) is therefore the only durable record of
progress across invocations. Always read it before resuming a project, and keep it current rather
than relying on conversation memory.

## What's gitignored inside a project folder

- `01-research/raw/` — downloaded source video. Disposable once frames and transcripts have been
  extracted from it; regenerable by re-running Stage 1.

Everything else in a project folder — the analytics report, design drafts, snapshots, and final
rendered creatives — is tracked in git so the whole team can see finished work without re-running
the pipeline.

## Customizing brand direction per client

If a client has specific brand direction, save a filled-in copy of
`.claude/skills/marketing-design/assets/brand-brief.template.md` (and `brand-tokens.template.css`)
into that client's `02-design/` folder, rather than editing the shared skill template directly. If
you have a preferred Apify actor for scraping or transcription, pin its ID in
`.claude/skills/reels-analytics-report/references/01-data-collection.md` and
`references/04-transcription-sync.md` — otherwise the skill discovers one dynamically each run.

## Existing example projects

This repo currently includes two example client projects you can look at for reference:

- `projects/duolingo/` — research stage complete (analytics report + storyboarded reels).
- `projects/fast-track-norwegian/` — full pipeline run through multiple design variants and
  rendered creatives in `03-creatives/`.
