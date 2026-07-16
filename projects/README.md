# Projects

One folder per account/campaign. Each folder can carry either or both of this system's two
pipelines — an account might have only the video pipeline run, only the static-banner pipeline run,
or both, independently. Both pipelines pass through a **human review checkpoint in Figma** before
anything counts as final — see [docs/architecture.md](../docs/architecture.md) for the full stage
breakdown. Start a new client by copying `_template/`:

```
cp -r projects/_template projects/<new-client-slug>
```

(slug = lowercased handle, no `@`, non-alphanumerics replaced with `-` — the `orchestrator` agent
does this automatically when you ask it to run a pipeline for an account it hasn't seen before)

## Structure

```
projects/<slug>/
  STATUS.md                  pipeline progress tracker — read this first when resuming a project

  00-brief/                    campaign-request.md — the standardized Stage 0 intake (marketing
                               input + competitor analysis + marketer's brief), human-approved
                               before any research/design agent runs. Shared by both pipelines.

  # video pipeline
  01-research/                 marketing-analyst output: raw Apify data, downloaded video, extracted
                                frames, transcripts, the final analytics report.html, and
                                competitors/<handle>/ if the brief listed any
  02-design/                    design-strategist output: a STATIC storyboard (one designed frame
                                per structural block, storyboard.json, no HyperFrames) plus
                                figma-handoff.md — a DRAFT pending human review
  03-creatives/                   video-animator's final rendered video(s) — the only stage that
                                touches HyperFrames, and only after the Stage 3 Figma checkpoint

  # static-banner pipeline (no HyperFrames anywhere)
  01-research-static/            static-creative-analyst output: raw Apify data, downloaded images,
                                   the final analytics report.html (variant A only), and
                                   competitors/<handle>/ if the brief listed any
  02-design-static/                static-banner-designer output: draft banner HTML/PNG (and/or a
                                   filled-in marketing brief for variant B) plus figma-handoff.md —
                                   a DRAFT pending human review
  03-creatives-static/               final banner set — the human's Figma-approved pixels, or
                                   creative-resizer's output if a resize/variant pass ran

  # shared, optional, either pipeline
  resize-variants/                 creative-resizer output (only if extra sizes/variants were
                                   requested after the Stage 3 checkpoint): sizes/ and variants/
```

`01-research/raw/` (downloaded source video) and `01-research-static/raw/` (downloaded source
images) are both gitignored — disposable once frames/images have been extracted and embedded in
their respective reports.

## The human checkpoint (Stage 3) is not optional infrastructure

Nothing in this system can write to Figma — the `figma` skill is read-only by design, even with a
valid token. So `02-design/figma-handoff.md` and `02-design-static/figma-handoff.md` are genuine
pauses: an agent renders a draft, writes instructions, and stops. The project only moves to
Stage 4/5 once a human has actually imported the draft into Figma, edited it, and shared the
file/section link back — check `STATUS.md`, not the presence of files, to see whether a project is
truly past this point (`waiting on human` is a valid, expected status, not a stall).

## Which pipeline is this project using?

Check `STATUS.md` — it tracks both pipelines' progress independently in separate tables, and either
section can be marked `n/a` if that pipeline was never requested for this account.

## Notes

- Every subagent in this system starts with a fresh context window, so `STATUS.md` and the folder
  contents are the only durable record of progress — keep `STATUS.md` up to date rather than relying
  on conversation memory.
- If a client has specific brand direction, save a filled-in copy of
  `.claude/skills/marketing-design/assets/brand-brief.template.md` into that client's `02-design/`
  or `02-design-static/` folder (whichever pipeline applies) rather than editing the shared skill
  template.
- The static pipeline's brief-driven variant (B) has no separate brief template of its own — it
  reads Section 1 + Section 3 directly from the Stage 0 brief below.
- The Stage 0 brief lives at `.claude/skills/marketing-design/assets/campaign-request.template.md`
  — fill in a client-specific copy at `00-brief/campaign-request.md` before Stage 1 starts.
