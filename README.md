# Lingu Agents — Marketing Pipeline System

Turn a social account into researched, on-brand, animated video creatives — end to end, inside
Claude Code. See [CLAUDE.md](CLAUDE.md) for how the agents themselves are instructed; this file is
the human setup guide.

For the full documentation set (architecture, running the pipeline, agents/skills reference,
project conventions, troubleshooting), see **[docs/index.md](docs/index.md)**.

## What's in here

- **`orchestrator`** agent — default entry point, runs the full pipeline.
- **`marketing-analyst`** agent + **`reels-analytics-report`** skill — Apify-powered Reels research
  and a self-contained analytics HTML report.
- **`design-strategist`** agent + **`marketing-design`** skill — brand-driven creative concepts and
  a first-draft [HyperFrames](https://github.com/heygen-com/hyperframes) video composition.
- HyperFrames skill bundle — refines and renders the final video.
- **`projects/`** — one folder per client/account, copied from `projects/_template/`.

## Prerequisites

1. **Node.js** (for `npx`) — check with `node -v`.
2. **ffmpeg** on PATH — check with `ffmpeg -version`. Used to extract Reel frames for the storyboard.
   Install via your platform's package manager (e.g. `winget install ffmpeg`, `brew install ffmpeg`).
3. **Python 3** on PATH — check with `python3 --version` (or `python --version` on Windows). Used by
   the report-building scripts (standard library only, no pip installs required).
4. **An Apify account and API token** — sign up at [apify.com](https://apify.com), then copy your
   token from Settings → Integrations.

## One-time setup

1. **Apify token.** `.claude/settings.local.json` is gitignored and machine-local — Claude Code may
   already have created one here (it stores your per-session tool approvals). **Don't overwrite it**;
   open it and merge in an `env` block, using `.claude/settings.local.json.example` as a reference
   for the shape:
   ```json
   {
     "permissions": { "...": "...(leave whatever is already here alone)..." },
     "env": { "APIFY_TOKEN": "your-real-token-here" }
   }
   ```
   If `.claude/settings.local.json` doesn't exist yet, you can just copy the `.example` file to that
   path instead. Alternatively, skip this file entirely and export `APIFY_TOKEN` in your shell before
   launching Claude Code.

2. **Verify the Apify connection.** Start Claude Code in this folder and run `/mcp` — you should see
   an `apify` server connected. If it's not connecting, confirm `APIFY_TOKEN` is actually set in the
   session's environment.

3. **HyperFrames toolchain.** Already installed into `.claude/skills/` via
   `npx skills add heygen-com/hyperframes --full-depth --yes`. Sanity-check it works:
   ```
   npx hyperframes --help
   ```

## Running your first pipeline

Just launch Claude Code in this folder (the orchestrator is the default agent) and describe the
account:

```
Run the full pipeline for @someaccount, last 20 reels.
```

The orchestrator creates `projects/someaccount/`, runs research → design → animate, and reports
back the path to the final analytics report and rendered video(s).

**Recommended first run:** ask for a small count (2–3 reels) to confirm the whole chain works
before spending Apify credits on a full 20-reel run.

## Customizing per client

- Fill in `.claude/skills/marketing-design/assets/brand-brief.template.md` and
  `brand-tokens.template.css` per client, or keep multiple copies and point `design-strategist` at
  the right one for a given project.
- Copy `projects/_template/` to `projects/<new-client-slug>/` to start a new account.
- If you have a preferred Apify actor for Instagram scraping or transcription, pin its ID in
  `.claude/skills/reels-analytics-report/references/01-data-collection.md` and
  `references/04-transcription-sync.md` — otherwise the skill discovers one dynamically each run.

## Troubleshooting

- **`/mcp` doesn't show `apify`** — `APIFY_TOKEN` isn't set in the environment Claude Code sees.
- **Frame extraction fails** — `ffmpeg` isn't on PATH, or the downloaded video file is corrupt/empty.
- **`hyperframes lint` fails on a design-strategist draft** — re-run `@design-strategist` and ask it
  to fix the specific lint errors; it's expected to self-check before handing off.
