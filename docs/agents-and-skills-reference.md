# Agents & Skills Reference

## Agents (`.claude/agents/`)

### `orchestrator`
- **Role:** default entry point and coordinator for both pipelines, across all six stages (0-5).
  Walks the user through Stage 0, infers which pipeline/variant a request needs, drives Stages 1-2
  and 4, and — critically — **genuinely pauses at Stage 3** rather than simulating a Figma import it
  structurally cannot perform. Resumes in-progress projects via `STATUS.md`.
- **Tools:** `Agent(marketing-analyst, design-strategist, static-creative-analyst,
  static-banner-designer, creative-resizer, video-animator)`, Read, Write, Edit, Glob, Grep, Bash,
  Skill. **Does not** run `npx hyperframes` commands itself anymore — that moved entirely to
  `video-animator`.

### `marketing-analyst` — Stage 1, video pipeline
- **Role:** turns raw Apify scrapes into a rigorous, self-contained analytics report — no shortcuts
  on the frame-by-frame math. Also runs against any competitor handles Stage 0's brief listed.
- **Tools:** Read, Write, Glob, Grep, Bash, Skill, `mcp__apify`.
- **Skill used:** `reels-analytics-report`.
- **Reports back:** reel count processed, report path, data-quality caveats — never raw JSON.

### `static-creative-analyst` — Stage 1, static pipeline (variant A only)
- **Role:** the static sibling of `marketing-analyst` — same rigor over organic posts and, when
  relevant, Meta Ad Library banners.
- **Tools:** Read, Write, Glob, Grep, Bash, Skill, `mcp__apify`.
- **Skill used:** `static-creatives-report` (pinned actors: `apify/instagram-post-scraper`,
  `apify/facebook-ads-scraper`).
- **Reports back:** creative count (organic vs. ad), report path, dominant layout pattern, caveats.

### `design-strategist` — Stage 2, video pipeline
- **Role:** turns research into a branded **static storyboard** — one designed frame per structural
  block, a director note each, no motion. **Does not** have `hyperframes` in its skill list at all.
- **Tools:** Read, Write, Edit, Glob, Grep, Bash, Skill.
- **Skills used:** `marketing-design` for brand direction, `static-storyboard-design` for scene
  authoring/rendering/Figma-handoff.
- **Quality gate:** `check_frame.py` per scene, a `[PLACEHOLDER` sweep, a visual Read of every frame.
- **Reports back:** scene count and their structural-block mapping (with the research finding
  behind each), aspect ratio, check confirmation, and the exact next action the human needs to take.

### `static-banner-designer` — Stage 2, static pipeline (both variants)
- **Role:** turns research or a marketing brief into **draft** static banners — real HTML/CSS,
  rendered to flat PNG/JPEG, explicitly not the final deliverable.
- **Tools:** Read, Write, Edit, Glob, Grep, Bash, Skill. **No** `hyperframes` skill access.
- **Skills used:** `marketing-design`, `static-banner-design`.
- **Quality gate:** `check_banner.py` per size, a `[PLACEHOLDER` sweep, a visual Read of every PNG.
- **Reports back:** variant used (A/B), sizes rendered, the research/brief line behind each choice,
  check confirmation, and the human's next action.

### `creative-resizer` — Stage 4, either pipeline (optional)
- **Role:** expands an already human-approved design (pulled back from Figma, read-only) into more
  platform sizes and recombined "variable" variants, without altering the approved creative
  decisions.
- **Tools:** Read, Write, Edit, Glob, Grep, Bash, Skill.
- **Skills used:** `figma` (Phase 1 assets, Phase 3 components), `static-banner-design`,
  `static-storyboard-design`.
- **Reports back:** how many sizes/variants, which approved source(s) each variant recombined,
  check confirmation, output path.

### `video-animator` — Stage 5, video pipeline only
- **Role:** the **only** agent in this system with HyperFrames access. Turns a human-approved Figma
  storyboard into the final animated video.
- **Tools:** Read, Write, Edit, Glob, Grep, Bash, Skill.
- **Skills used:** `figma` (Storyboards phase — frames are keyframes, not slides), `hyperframes`,
  `hyperframes-animation`.
- **Precondition:** a completed `figma-handoff.md` with a real link and "returned for animation:
  yes" — refuses to animate an unconfirmed draft or invent a Figma link.
- **Quality gate:** `npx hyperframes check` before rendering.
- **Reports back:** which Figma source it animated from, scene count/duration, the element
  chains/director notes behind major motion beats, check confirmation, rendered path(s).

## Skills relevant to this pipeline

| Skill | Used by | Purpose |
|---|---|---|
| `reels-analytics-report` | `marketing-analyst` | Video research: data collection, storyboard extraction, hook analysis, transcription sync, structure segmentation, HTML report |
| `static-creatives-report` | `static-creative-analyst` | Static research: Apify data collection (organic + optional ad library), image prep, visual/layout analysis, HTML report |
| `marketing-design` | `design-strategist`, `static-banner-designer` | Brand/creative-direction template — palette, typography, voice, campaign frameworks, platform specs. Also holds `campaign-request.template.md`, the Stage 0 brief. Shared identically by both pipelines |
| `static-storyboard-design` | `design-strategist`, `creative-resizer` | Video design stage: static storyboard authoring, scene grammar (matches the `figma` skill's storyboard-import parser), rendering, self-check |
| `static-banner-design` | `static-banner-designer`, `creative-resizer` | Static design stage: platform ad-size specs, HTML/CSS banner template, rendering, self-check |
| `figma` | `creative-resizer`, `video-animator` | **Read-only** Figma integration — asset export, component import, and the Storyboards (motion-reconstruction) phase. Never writes to Figma |
| `hyperframes` | `video-animator` | Mandatory entry point for the actual video build. **Scoped to Stage 5 only** — no other agent loads it |
| `hyperframes-animation` | `video-animator` | Atomic motion rules, scene blueprints, transitions, runtime adapters — the polish pass |

## Reference docs inside each skill

- `.claude/skills/reels-analytics-report/references/01..06-*.md` — one file per research phase.
- `.claude/skills/static-creatives-report/references/01..03-*.md` — one file per research phase.
- `.claude/skills/marketing-design/assets/campaign-request.template.md` — Stage 0 brief.
- `.claude/skills/marketing-design/assets/brand-brief.template.md` /
  `brand-tokens.template.css` — fill in per client, used by both pipelines.
- `.claude/skills/static-storyboard-design/references/scene-grammar.md` — the strip layout,
  director-note vocabulary, render/check/manifest/handoff spec for video storyboards.
- `.claude/skills/static-banner-design/assets/banner.template.html`,
  `references/platform-specs.md`.

The full HyperFrames skill bundle (`hyperframes-*`, `figma`, plus general-purpose video skills) is
vendored under `.claude/skills/` and tracked in `skills-lock.json`. `static-creatives-report`,
`static-banner-design`, and `static-storyboard-design` are this repo's own skills, kept outside that
vendored surface and deliberately never loading `hyperframes`.
