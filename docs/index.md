# Lingu Agents — Marketing Pipeline System

**Lingu Agents** is a closed-loop [Claude Code](https://claude.com/product/claude-code) system that
turns a social media account into researched, on-brand marketing creative — end to end, with a real
**human review checkpoint in Figma** built into both of its pipelines. HyperFrames (motion) only
ever runs at the very last video step, after a human has approved the static design.

You give it a handle (or a marketing brief) and it works through: a standardized brief, research,
static design, a pause for you to review and edit in Figma, an optional resize/variant pass, and —
for video — a final animation step. Nothing is treated as "final" until a human has actually looked
at it in Figma.

```
Stage 0  Brief            standardized campaign request — human-approved before anything runs
Stage 1  Research           marketing-analyst / static-creative-analyst (+ competitors, if listed)
Stage 2  Design               design-strategist / static-banner-designer — STATIC output only
Stage 3  Human Figma review     you import the draft into Figma, edit, share the link back
Stage 4  Resize / variant         creative-resizer — OPTIONAL
Stage 5  Animate (video only)       video-animator — the ONLY stage that touches HyperFrames
```

The static-banner pipeline ends at Stage 4 (or 3) — there's no motion stage for a flat banner.

## Where to go from here

| Page | What's in it |
|---|---|
| [Architecture](architecture.md) | How every stage fits together, why design moved out of HyperFrames, and why Figma is read-only by design |
| [Setup & Prerequisites](setup-and-prerequisites.md) | Everything you need installed and configured, including `FIGMA_TOKEN` |
| [Running a Pipeline](running-a-pipeline.md) | How to kick off a new client, work through the Figma checkpoint, resume, or run a single stage standalone |
| [Agents & Skills Reference](agents-and-skills-reference.md) | What each of the seven agents and their skills actually do |
| [Project Folder Convention](project-folder-convention.md) | The `projects/<slug>/` layout, `STATUS.md`, and the new `00-brief/` / `resize-variants/` folders |
| [Troubleshooting](troubleshooting.md) | Common failure points and how to unstick them |

## At a glance

- **Entry point:** the `orchestrator` agent — launch `claude` in the repo root and describe the
  account. It walks you through Stage 0, infers the right pipeline, and genuinely pauses at Stage 3
  rather than pretending to complete a Figma import it structurally cannot do.
- **Stage 0 (Brief):** a standardized campaign request — marketing input, competitor analysis, and
  the marketer's brief — confirmed by you before any agent starts.
- **Stage 1 (Research):** `marketing-analyst` / `static-creative-analyst` scrape via Apify and
  produce a self-contained HTML analytics report, plus one per competitor if the brief listed any.
- **Stage 2 (Design):** `design-strategist` / `static-banner-designer` produce **static** creative
  only — a storyboard of designed frames for video, draft banners for static ads — no HyperFrames
  anywhere in this stage.
- **Stage 3 (Human Figma review):** you import the draft into Figma (the html.to.design plugin is
  the standard path), edit it, and share the link back. Nothing in this system can write to Figma —
  the vendored `figma` skill is read-only by design, so this step is a genuine, unautomatable pause.
- **Stage 4 (Resize/variant, optional):** `creative-resizer` expands your approved design into more
  platform sizes and recombined "variable" variants, without changing what you approved.
- **Stage 5 (Animate, video only):** `video-animator` — the only agent in the system with HyperFrames
  access — turns your approved, adapted storyboard into the final rendered video.
- **State:** every client/account lives in `projects/<slug>/`, tracked by a `STATUS.md` file — this
  is the only durable memory between agent invocations. `waiting on human` at Stage 3 is a normal,
  expected status, not a stall.
