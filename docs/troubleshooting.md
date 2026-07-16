# Troubleshooting

## `/mcp` doesn't show `apify`
`APIFY_TOKEN` isn't set in the environment Claude Code sees. Check:
- `.claude/settings.local.json` has an `env.APIFY_TOKEN` entry (see
  [Setup & Prerequisites](setup-and-prerequisites.md)), **or**
- `APIFY_TOKEN` is exported in the shell you launched Claude Code from.

Restart the Claude Code session after fixing either — MCP servers are configured at session start.

## Frame extraction fails (Stage 1)
- `ffmpeg` isn't on PATH — check with `ffmpeg -version`.
- The downloaded video file is corrupt or empty — likely a transient Apify/CDN issue. Re-run Stage
  1 for the affected reel(s); CDN URLs for scraped media expire fast, so never treat a remote URL
  as the source of truth, only the downloaded file.

## `hyperframes lint` / `hyperframes check` fails on a design-strategist draft
Re-run `@design-strategist` and ask it to fix the specific errors reported — it's expected to
self-check with `npx hyperframes check` before handing off, so a failing gate means the draft
shouldn't have been reported as done. Don't hand-patch the composition yourself first; let the
agent fix its own output so its reasoning stays consistent with the file.

## `npx hyperframes` fails outright (Stage 3)
Confirm Node.js 22+ and `ffmpeg` are actually on PATH in the shell the orchestrator is using —
`node -v` and `ffmpeg -version`. HyperFrames needs both to preview and render.

## A subagent seems to have "forgotten" earlier context
This is expected — every subagent invocation starts with a fresh context window. Nothing persists
between calls except what's written to `projects/<slug>/` (especially `STATUS.md`). If a stage
seems confused about prior decisions, check that the previous stage actually wrote its expected
output files before handing off.

## Secrets and git hygiene
- Never commit a literal Apify token. `.mcp.json` should only ever reference `${APIFY_TOKEN}`.
- `.env`, `.claude/settings.local.json`, and `CLAUDE.local.md` are gitignored by design — if you
  ever see one of these staged in a `git status`, stop and figure out why before committing.
- If you accidentally commit a secret, rotate the token immediately (a `git revert` does not remove
  it from history) and let the team know.
