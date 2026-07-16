# Projects

One folder per account/campaign, each following the same three-stage convention. Start a new
client by copying `_template/`:

```
cp -r projects/_template projects/<new-client-slug>
```

(slug = lowercased handle, no `@`, non-alphanumerics replaced with `-` — the `orchestrator` agent
does this automatically when you ask it to run the pipeline for an account it hasn't seen before)

## Structure

```
projects/<slug>/
  STATUS.md          pipeline progress tracker — read this first when resuming a project
  01-research/         marketing-analyst output: raw Apify data, downloaded video, extracted
                         frames, transcripts, and the final analytics report.html
  02-design/            design-strategist output: the brand application notes and the first-draft
                         HyperFrames HTML/GSAP composition
  03-creatives/           final rendered video(s) after the HyperFrames animation/refinement pass
```

`01-research/raw/` (downloaded source video) is gitignored — it's disposable once frames and
transcripts have been extracted from it.

## Notes

- Every subagent in this system starts with a fresh context window, so `STATUS.md` and the folder
  contents are the only durable record of progress — keep `STATUS.md` up to date rather than relying
  on conversation memory.
- If a client has specific brand direction, save a filled-in copy of
  `.claude/skills/marketing-design/assets/brand-brief.template.md` into that client's `02-design/`
  folder rather than editing the shared skill template.
