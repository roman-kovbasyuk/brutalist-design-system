# Setup & Prerequisites

## What you need installed

| Requirement | Check with | Notes |
|---|---|---|
| Node.js (Node 22+ for HyperFrames) | `node -v` | Needed for `npx` and the HyperFrames CLI |
| ffmpeg on PATH | `ffmpeg -version` | Used to extract Reel frames for the storyboard, and for final rendering |
| Python 3 | `python3 --version` (or `python --version` on Windows) | Used by the report-building scripts — standard library only, no `pip install` needed |
| An Apify account + API token | [apify.com](https://apify.com) → Settings → Integrations | Powers all Reels scraping via the `apify` MCP server |
| GitHub CLI (`gh`) — optional, for repo/team workflows | `gh --version` | Not required to *run* the pipeline, only for repo administration |

## One-time setup

### 1. Apify token

`.claude/settings.local.json` is **gitignored and machine-local** — every teammate needs their own
copy with their own token. Claude Code may already have created a bare version of this file (it
also stores per-session tool approvals); **don't overwrite it** — merge in an `env` block using
`.claude/settings.local.json.example` as the reference shape:

```json
{
  "permissions": { "...": "...(leave whatever is already here alone)..." },
  "env": { "APIFY_TOKEN": "your-real-token-here" }
}
```

If the file doesn't exist yet, just copy the `.example` file to that path. Alternatively, skip the
file entirely and export `APIFY_TOKEN` in your shell before launching Claude Code.

> **Never commit a real token.** `.mcp.json` in this repo only ever references `${APIFY_TOKEN}` —
> if you ever see a literal token string staged in a diff, stop and remove it before committing.

### 2. Verify the Apify MCP connection

Start Claude Code in the repo root and run `/mcp` — you should see an `apify` server connected. If
it's not connecting, confirm `APIFY_TOKEN` is actually set in the session's environment.

### 3. HyperFrames toolchain

Already vendored into `.claude/skills/` (installed via `npx skills add heygen-com/hyperframes
--full-depth --yes`, tracked in `skills-lock.json`). Sanity-check it works:

```
npx hyperframes --help
```

## Cloning this repo for the first time (new teammate)

```
git clone https://github.com/vladbaranov-ship-it/lingu-agents.git
cd lingu-agents
```

Then follow the one-time setup above — your own `APIFY_TOKEN` is the only thing you need to add
locally; everything else (agents, skills, project folders) comes with the clone.

## Recommended first run

Ask for a small reel count (2–3) on a throwaway/test handle to confirm the whole chain works
end-to-end before spending Apify credits on a full run (the default is 20 reels if you don't
specify a count).
