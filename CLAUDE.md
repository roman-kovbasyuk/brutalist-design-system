# Lingu Agents — Marketing Pipeline System

A closed-loop Claude Code system that turns a social account into researched, on-brand, animated
video creatives. Three stages, coordinated by one orchestrator:

1. **Research** — `marketing-analyst` agent scrapes and analyzes an account's Reels via Apify MCP,
   producing a self-contained analytics HTML report (metrics, storyboards, hook analysis,
   transcripts, structural formula).
2. **Design** — `design-strategist` agent turns that research into a branded creative concept and a
   full first-draft HyperFrames HTML/GSAP video composition.
3. **Animate** — the installed HyperFrames skill bundle refines timing/motion and renders the final
   video (`hyperframes lint|preview|render`).

## Default entry point

This project's default session agent is `orchestrator` (set via `.claude/settings.json`). Running
`claude` in this folder starts you directly in the orchestrator. Just describe the account/campaign
you want run through the pipeline (handle, how many reels, any known brand constraints).

To use a stage on its own, invoke it directly: `@marketing-analyst`, `@design-strategist`, or a
skill by name (e.g. `/reels-analytics-report handle 20`).

## Folder map

```
.claude/agents/       orchestrator, marketing-analyst, design-strategist
.claude/skills/        marketing-design, reels-analytics-report, hyperframes-* (installed bundle)
projects/<slug>/       one folder per account/campaign — see projects/README.md
  STATUS.md             pipeline progress tracker (source of truth for resuming)
  01-research/           marketing-analyst output
  02-design/              design-strategist output
  03-creatives/            final rendered video(s)
```

Each subagent starts with a fresh context window, so stages hand off through
`projects/<slug>/` files, not shared memory. Always read `STATUS.md` before resuming a project
that already has a folder.

## Prerequisites (see README.md for setup steps)

- `APIFY_TOKEN` set via `.claude/settings.local.json` (gitignored) or shell env — required for the
  `apify` MCP server in `.mcp.json`.
- `ffmpeg` and Node (`npx`) on PATH.

## Conventions

- Never commit real secrets. `.mcp.json` only ever references `${APIFY_TOKEN}`, never a literal token.
- Downloaded video/CDN URLs expire fast — always download media to disk before processing, never
  keep just a remote URL as the source of truth for a report.
- Design and campaign specifics (palette, tone, fonts) live in `.claude/skills/marketing-design/` —
  treat that skill as the template to customize per client, not this file.
- New client/account → copy `projects/_template/` to `projects/<slug>/`.
