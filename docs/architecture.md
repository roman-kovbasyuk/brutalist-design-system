# Architecture

## Design principle: stages hand off through files, not memory

Every subagent Claude Code spawns starts with a **completely fresh context window** — it has no
memory of what happened before it was invoked, and no memory of anything after it finishes. That
means the pipeline cannot rely on conversation history to track progress. Instead:

- Each account/campaign gets its own folder: `projects/<slug>/`.
- Progress is tracked in `projects/<slug>/STATUS.md` — the single source of truth for "what stage
  is this project at," including whether it's genuinely paused waiting on a human.
- Each stage reads its input from files the previous stage wrote, and writes its output to files
  the next stage (or the human) will read.

This is why the orchestrator re-reads `STATUS.md` before doing anything, rather than assuming it
remembers a project from earlier in the session.

## Design principle: motion happens after human review, not before it

`design-strategist` used to produce a first-draft HyperFrames composition directly. That locks in
motion decisions before anyone has seen the static design, is expensive to revise, and isn't
reviewable by a non-technical marketer. The system now enforces a stricter split:

- **Design stages produce static frames only** — one storyboard frame per structural block for
  video, one banner per platform size for static ads. No agent at this stage loads `hyperframes`,
  `hyperframes-core`, or runs any `npx hyperframes` command.
- **A human reviews and corrects the static design in Figma** — this is Stage 3, a real pause.
- **Only `video-animator`** — the single agent left with HyperFrames access in the whole system —
  ever produces motion, and only from a human-approved design.

## Design principle: Figma is read-only — confirmed, not assumed

The vendored `figma` skill states explicitly, in its own auth section, that it never writes to
Figma — every scope it requests is read-only, and there is no REST or MCP path to create/edit Figma
file content, even with a valid personal access token. This is a platform constraint, not a gap to
engineer around, and it fixes the shape of the handoff:

- **Out to Figma:** an agent renders HTML/PNG and writes plain-language import instructions
  (`figma-handoff.md`) — the human does the actual import (typically via the html.to.design plugin).
- **Back from Figma:** read-only, via three phases of the `figma` skill —
  - **Phase 1 (assets)** — literal exported pixels of the human's approved frames; the ground truth
    for "what did they actually approve."
  - **Phase 3 (components)** — node tree → editable HTML at exact Figma geometry; what makes
    `creative-resizer`'s reflow possible (a flat pixel export can only be scaled/cropped, never
    genuinely re-laid-out).
  - **Storyboards phase** — a SECTION of scene frames, diffed into element chains and turned into
    real motion; what `video-animator` runs on.

## The stage model (both pipelines share this shape)

```
Stage 0  Brief            standardized campaign request — human-approved before anything runs
Stage 1  Research           marketing-analyst / static-creative-analyst (+ competitors, if listed)
Stage 2  Design               design-strategist / static-banner-designer — STATIC output only
Stage 3  Human Figma review     a real pause — human imports, edits, shares the link back
Stage 4  Resize / variant         creative-resizer — OPTIONAL
Stage 5  Animate (video only)       video-animator — the ONLY agent that touches HyperFrames
```

The static-banner pipeline ends at Stage 4 (or 3, if no resize/variant pass is needed).

### Stage 0 — Brief

Not an agent output — a human-confirmed document. `.claude/skills/marketing-design/assets/
campaign-request.template.md` has three parts: marketing input (product, goal, audience), competitor
analysis (handles to research alongside the client's own account, known competitor creative), and
the marketer's brief (offer, message, proof, tone, CTA). Saved to
`projects/<slug>/00-brief/campaign-request.md`. Nothing in Stage 1 should start against an
unconfirmed brief.

### Stage 1 — Research — `marketing-analyst` / `static-creative-analyst`

- **Input:** account handle, count; plus any competitor handles the brief listed.
- **Tools:** Apify MCP (`mcp__apify`) plus `reels-analytics-report` (video) or
  `static-creatives-report` (static: `apify/instagram-post-scraper` for organic posts,
  `apify/facebook-ads-scraper` for paid banners — both actor IDs confirmed via a live discovery
  pass).
- **Output:** a self-contained HTML analytics report per account researched, including one per
  competitor under `01-research/competitors/<handle>/` or `01-research-static/competitors/<handle>/`
  — reference/differentiation material, not a separate deliverable.

### Stage 2 — Design — `design-strategist` / `static-banner-designer`

- **Input:** the completed research, or (static, variant B) a filled-in marketing brief.
- **Tools:** `marketing-design` for brand direction (shared identically by both pipelines), then
  `static-storyboard-design` (video) or `static-banner-design` (static ads) for authoring and
  rendering. **Never** `hyperframes`/`hyperframes-core`/`hyperframes-animation` — out of scope for
  this stage by design.
- **Render mechanism:** `npx playwright screenshot` against local `file://` HTML — a plain
  headless-browser screenshot, not a video render.
- **Output:** video — one designed frame per structural block plus a director note each
  (`02-design/`, `storyboard.json`); static — one draft banner per platform size (`02-design-static/`).
  Both end at a `figma-handoff.md` with plain import instructions for the human. **This output is a
  draft, not the final deliverable.**
- **Quality gate:** `check_frame.py` / `check_banner.py` (ffprobe-based dimension/integrity check)
  per rendered frame, a `[PLACEHOLDER` grep sweep, and a direct visual Read of every PNG.

### Stage 3 — Human Figma review

The human imports the draft (via the html.to.design plugin, typically) into Figma, arranges/confirms
it, edits whatever needs editing, and shares the file/section link back. For video specifically, the
storyboard needs to land as a Figma SECTION of frame-sized nodes ordered by x-position with
director-note TEXT nodes below each — the exact grammar `static-storyboard-design` built the HTML
to already match, and the exact grammar the `figma` skill's Storyboards phase parses back out. This
stage has no automated substitute — the orchestrator's job here is to relay instructions clearly and
then actually wait, recording `waiting on human` in `STATUS.md` until a real link comes back.

### Stage 4 — Resize/variant (optional) — `creative-resizer`

- **Input:** the confirmed Figma file/section link (read back via `figma` skill Phase 3 for
  structured, reflowable HTML — or Phase 1 when the literal approved pixels are what's needed
  verbatim), plus target sizes and/or a variant count.
- **Constraint:** must not change the approved creative decisions — copy, brand tokens, and concept
  stay fixed; only layout reflow (resize) or recombination of existing approved pieces (variant)
  happens here.
- **Output:** `projects/<slug>/resize-variants/{sizes,variants}/`, each entry traceable to its
  source approved piece(s).
- **Only runs when asked** — not a default step after Stage 3.

### Stage 5 — Animate (video only) — `video-animator`

- **Input:** the confirmed Figma storyboard link, `storyboard.json`.
- **Tools:** `figma` skill's Storyboards phase (frames are keyframes, not slides — diff adjacent
  scenes into element chains, animate elements between states), then `hyperframes-animation` for
  easing/stagger polish, then the HyperFrames CLI. **This is the only agent in the entire system
  that loads `hyperframes`/`hyperframes-core` or runs `npx hyperframes` commands.**
- **Quality gate:** `npx hyperframes check` before rendering — same bar the old design-stage gate
  used to enforce, just moved to where motion actually gets authored now.
- **Output:** `projects/<slug>/03-creatives/*.mp4`.

The static pipeline has no Stage 5 — its final deliverable (`03-creatives-static/`) is either the
human's Figma-approved pixels (a straight Phase-1 asset export) or `creative-resizer`'s output.

## Why separate agents instead of one

Each stage needs a different tool surface and a different "voice," and the split is what makes the
motion boundary structurally enforceable rather than just a written rule:

- `marketing-analyst` / `static-creative-analyst` need Apify MCP access and near-zero creative
  license — graded on rigor, not taste.
- `design-strategist` / `static-banner-designer` need Write/Edit and the static-authoring +
  Playwright toolchain, explicitly **not** HyperFrames — that's what makes "design never produces
  motion" a fact about their tool access, not just an instruction they could ignore.
- `creative-resizer` needs read-only Figma access plus the same static-authoring toolchain, and is
  explicitly told not to alter approved creative decisions.
- `video-animator` is the only agent with HyperFrames + the `figma` skill together — the single
  place in the system where motion gets authored, and only from a human-approved source.
- The orchestrator needs none of those tool surfaces long-term — it coordinates, tracks state,
  relays the human checkpoint honestly, and talks to the human.

Splitting them keeps each agent's system prompt focused, keeps failures isolated (a bad Apify run
doesn't corrupt a design agent's context; a design misstep doesn't require re-scraping), and — most
importantly for this system's core promise — makes "nothing animates before a human approves the
static design" true by construction, not just by convention.
