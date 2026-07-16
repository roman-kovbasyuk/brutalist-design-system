# Architecture

## Design principle: stages hand off through files, not memory

Every subagent Claude Code spawns starts with a **completely fresh context window** — it has no
memory of what happened before it was invoked, and no memory of anything after it finishes. That
means the pipeline cannot rely on conversation history to track progress. Instead:

- Each account/campaign gets its own folder: `projects/<slug>/`.
- Progress is tracked in `projects/<slug>/STATUS.md` — the single source of truth for "what stage
  is this project at."
- Each stage reads its input from files the previous stage wrote, and writes its output to files
  the next stage (or the human) will read.

This is why the orchestrator re-reads `STATUS.md` before doing anything, rather than assuming it
remembers a project from earlier in the session.

## The three stages

### 1. Research — `marketing-analyst`

- **Input:** account handle, reel count.
- **Tools:** Apify MCP (`mcp__apify`) for scraping, plus the `reels-analytics-report` skill, which
  defines the exact procedure: data collection → storyboard extraction (first 10s, frame-by-frame)
  → hook analysis → transcription + sync → structural segmentation (hook / intro / key message /
  rehook / objection handling / CTA) → final HTML report assembly.
- **Output:** `projects/<slug>/01-research/report.html` — one self-contained file (frames embedded
  as base64, zero external dependencies) — plus supporting JSON/transcripts and a gitignored `raw/`
  folder of downloaded source video.
- **Why it's rigorous:** the report's value is in frame-by-frame hook analysis and a structural
  formula derived from what's *actually* driving engagement on that account, not generic
  best-practice advice.

### 2. Design — `design-strategist`

- **Input:** the completed `01-research/` folder, optionally a filled-in brand brief.
- **Tools:** the `marketing-design` skill for brand direction (palette, tone, campaign frameworks),
  then the `hyperframes` skill as the mandatory entry point for the actual video build — it routes
  to the right creation workflow (`product-launch-video`, `motion-graphics`, `faceless-explainer`,
  `slideshow`, etc.) and manages `BRIEF.md` / `hyperframes.json` / `STORYBOARD.md` project state.
- **Output:** `projects/<slug>/02-design/` — a first-draft HyperFrames HTML/GSAP composition, with
  every creative choice traceable back to a specific finding in the research (e.g. "hook mirrors
  reel #3's close-up-face pattern, which had the highest engagement rate").
- **Quality gate:** the agent must self-verify with `npx hyperframes check` (lint + a headless-
  browser gate for runtime errors, layout, motion, and contrast) before handing off. Nothing ships
  to Stage 3 that isn't lint-clean.

### 3. Animate — driven by the orchestrator directly (no subagent)

Unlike the first two stages, animation refinement is **not** delegated to a subagent — the
orchestrator drives it directly, because it benefits from the same live session that will report
results back to the user:

1. `npx hyperframes preview` — review Studio playback.
2. Apply the `hyperframes-animation` skill to polish easing, stagger timing, and mid-scene motion —
   the refinement pass HyperFrames' own workflow expects between a first draft and a final render.
3. `npx hyperframes render` — draft quality while iterating, high quality for the final pass —
   output into `projects/<slug>/03-creatives/`.
4. Verify the rendered file exists, is non-empty, and has a plausible duration.
5. Update `STATUS.md` with the final video path(s) and mark the project done.

## Why three separate agents instead of one

Each stage needs a different tool surface and a different "voice":

- `marketing-analyst` needs Apify MCP access and near-zero creative license — it's graded on rigor,
  not taste.
- `design-strategist` needs Write/Edit and the full HyperFrames authoring skill stack, and is
  graded on how well its creative choices trace back to evidence.
- The orchestrator needs neither of those tool surfaces long-term — it needs to coordinate, track
  state, and talk to the human.

Splitting them keeps each agent's system prompt focused and keeps failures isolated: a bad Apify
run doesn't corrupt the design agent's context, and a design misstep doesn't require re-scraping.
