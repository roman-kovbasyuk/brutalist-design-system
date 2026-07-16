# Lingu Agents — Marketing Pipeline System

**Lingu Agents** is a closed-loop [Claude Code](https://claude.com/product/claude-code) system that
turns a social media account into researched, on-brand, animated video creatives — end to end,
with no manual handoffs between steps.

You give it a handle (e.g. `@duolingo`) and a reel count. It scrapes and analyzes that account's
content, designs a branded creative concept grounded in what's actually working for that account,
and renders a finished vertical video ad — automatically, across three coordinated AI agents.

```
  handle + reel count
        │
        ▼
┌───────────────┐    ┌───────────────────┐    ┌────────────────┐
│  1. RESEARCH  │───▶│    2. DESIGN       │───▶│  3. ANIMATE    │
│ marketing-    │    │ design-strategist  │    │ orchestrator   │
│ analyst agent │    │ agent              │    │ + HyperFrames  │
└───────────────┘    └───────────────────┘    └────────────────┘
        │                     │                       │
        ▼                     ▼                       ▼
  analytics report    branded HTML/GSAP        rendered .mp4
  (HTML, self-        composition draft        creative(s)
  contained)          (lint-clean)
```

## Where to go from here

| Page | What's in it |
|---|---|
| [Architecture](architecture.md) | How the three stages fit together, who drives what, and why state lives on disk instead of in conversation memory |
| [Setup & Prerequisites](setup-and-prerequisites.md) | Everything you need installed and configured before your first run |
| [Running a Pipeline](running-a-pipeline.md) | How to kick off a new client, resume an in-progress one, or run a single stage standalone |
| [Agents & Skills Reference](agents-and-skills-reference.md) | What each agent (`orchestrator`, `marketing-analyst`, `design-strategist`) and its skills actually do |
| [Project Folder Convention](project-folder-convention.md) | The `projects/<slug>/` layout, `STATUS.md`, and how to start a new client |
| [Troubleshooting](troubleshooting.md) | Common failure points and how to unstick them |

## At a glance

- **Entry point:** the `orchestrator` agent (default agent for this project — just launch
  `claude` in the repo root and describe the account).
- **Stage 1 (Research):** `marketing-analyst` agent + `reels-analytics-report` skill — scrapes
  Reels via Apify, storyboards the first 10 seconds of each, transcribes and segments the full
  video, and produces one self-contained HTML analytics report.
- **Stage 2 (Design):** `design-strategist` agent + `marketing-design` skill — reads the research,
  applies brand direction, and produces a first-draft HyperFrames HTML/GSAP video composition.
- **Stage 3 (Animate):** driven by the orchestrator itself — previews, polishes motion via the
  `hyperframes-animation` skill, and renders the final video with the HyperFrames CLI.
- **State:** every client/account lives in `projects/<slug>/`, tracked by a `STATUS.md` file — this
  is the only durable memory between agent invocations, since each subagent starts with a fresh
  context window.

See the repository [README](https://github.com/vladbaranov-ship-it/lingu-agents#readme) for the
condensed human setup guide, and [CLAUDE.md](https://github.com/vladbaranov-ship-it/lingu-agents/blob/master/CLAUDE.md)
for the instructions the agents themselves are given.
