# Agents & Skills Reference

## Agents (`.claude/agents/`)

### `orchestrator`
- **Role:** default entry point and coordinator. Drives all three stages, resumes in-progress
  projects via `STATUS.md`, and is the only stage that talks to the user directly.
- **Tools:** `Agent(marketing-analyst, design-strategist)`, Read, Write, Edit, Glob, Grep, Bash, Skill.
- **Drives Stage 3 (Animate) itself** rather than delegating — see [Architecture](architecture.md)
  for why.

### `marketing-analyst`
- **Role:** Stage 1 (Research). Turns raw Apify scrapes into a rigorous, self-contained analytics
  report — no shortcuts on the frame-by-frame math even when tedious.
- **Tools:** Read, Write, Glob, Grep, Bash, Skill, `mcp__apify`.
- **Skill used:** `reels-analytics-report` (see below) — followed precisely and in order.
- **Reports back:** reel count processed, path to the final HTML report, and any data-quality
  caveats (missing fields, failed downloads) — never raw JSON.

### `design-strategist`
- **Role:** Stage 2 (Design). Turns research into a branded creative concept and a full first-draft
  HyperFrames video composition.
- **Tools:** Read, Write, Edit, Glob, Grep, Bash, Skill.
- **Skills used:** `marketing-design` for brand direction, then `hyperframes` as the mandatory entry
  point for actual composition authoring (which in turn routes to `hyperframes-core` for structural
  contract and `hyperframes-animation` for motion).
- **Quality gate:** must self-verify with `npx hyperframes check` before reporting done.
- **Reports back:** workflow used, scene count/duration, specific research-backed creative choices,
  and confirmation the check passed clean.

## Skills relevant to this pipeline

| Skill | Used by | Purpose |
|---|---|---|
| `reels-analytics-report` | `marketing-analyst` | Defines the full research procedure: data collection, storyboard extraction, hook analysis, transcription sync, structure segmentation, HTML report assembly |
| `marketing-design` | `design-strategist` | Brand/creative-direction template — palette, typography, voice, campaign frameworks, platform specs. Customize per client here, not in `CLAUDE.md` |
| `hyperframes` | `design-strategist`, orchestrator | Mandatory entry point for any video creation/editing/rendering task; routes to the right specialized workflow and manages project state |
| `hyperframes-core` | `design-strategist` | The composition contract — structure, `data-*` timing attributes, determinism rules |
| `hyperframes-animation` | `design-strategist`, orchestrator (Stage 3) | Atomic motion rules, scene blueprints, transitions, runtime adapters (GSAP default) |
| `hyperframes-cli` | orchestrator (Stage 3) | `preview`, `render`, `check`, `lint` and the rest of the CLI development loop |

## Reference docs inside each skill

- `.claude/skills/reels-analytics-report/references/01..06-*.md` — one file per research phase.
- `.claude/skills/marketing-design/assets/brand-brief.template.md` and
  `brand-tokens.template.css` — fill in per client.
- `.claude/skills/marketing-design/references/campaign-frameworks.md` — campaign strategy patterns.

The full HyperFrames skill bundle (`hyperframes-*`, plus general-purpose video skills like
`media-use`, `motion-graphics`, `product-launch-video`, etc.) is vendored under `.claude/skills/`
and tracked in `skills-lock.json` so every teammate gets the same versions without re-installing.
