# Setup & Prerequisites

## What you need installed

| Requirement | Check with | Notes |
|---|---|---|
| Node.js (Node 22+ for HyperFrames) | `node -v` | Needed for `npx`, the HyperFrames CLI (Stage 5, video only), and the Playwright CLI (Stage 2, both pipelines) |
| ffmpeg on PATH | `ffmpeg -version` | Reel frame extraction, final video rendering (video pipeline), and `ffprobe`-based image/frame dimension checks (both pipelines) |
| Python 3 | `python3 --version` (or `python --version` on Windows) | Used by every pipeline's report-building and check scripts — standard library only, no `pip install` needed |
| An Apify account + API token | [apify.com](https://apify.com) → Settings → Integrations | Powers Stage 1 research in either pipeline (variant A). **Not needed** for the static pipeline's brief-driven variant B |
| A Figma account + personal access token | figma.com → Settings → Security → Personal access tokens | Powers Stage 3's read-back and everything after it (Stage 4, Stage 5). **Read-only scopes only** — this integration never writes to Figma; the human does the actual import by hand |
| Playwright's Chromium build | `npx --yes playwright install chromium` (one-time) | Powers Stage 2's draft rendering in **both** pipelines (a static storyboard frame and a static ad banner render exactly the same way) |
| GitHub CLI (`gh`) — optional, for repo/team workflows | `gh --version` | Not required to *run* either pipeline, only for repo administration |

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
> if you ever see a literal token string staged in a diff, stop and remove it before committing. The
> same discipline applies to `FIGMA_TOKEN` below — check `.claude/settings.local.json` periodically
> for tokens that ended up pasted in plaintext inside old permission-allowlist entries (e.g. from a
> `curl -H 'X-Figma-Token: ...'` command you approved once) and rotate/scrub them if you find any;
> that file is gitignored so it's not a repo leak, but it's still a live secret sitting on disk.

### 2. Figma token — read-only scopes only

Generate a personal access token at figma.com → Settings → Security → Personal access tokens, with
**File content: Read-only** + **File metadata: Read-only** (add **Library content: Read-only** if
you'll use brand-token import on a non-Enterprise plan). This integration is read-only by design —
it can never create or edit Figma file content, so there's no reason to grant write scopes even if
offered. Set it the same way as `APIFY_TOKEN`: `.claude/settings.local.json`'s `env` block, or export
`FIGMA_TOKEN` in your shell. See `.claude/skills/figma/SKILL.md`'s auth section for the full detail.

### 3. Verify the Apify MCP connection

Start Claude Code in the repo root and run `/mcp` — you should see an `apify` server connected. If
it's not connecting, confirm `APIFY_TOKEN` is actually set in the session's environment.

### 4. HyperFrames toolchain (Stage 5 only — `video-animator`)

Already vendored into `.claude/skills/` (installed via `npx skills add heygen-com/hyperframes
--full-depth --yes`, tracked in `skills-lock.json`, includes the `figma` skill). Sanity-check it
works:

```
npx hyperframes --help
```

No other agent in this system runs HyperFrames commands — only `video-animator`, at the very last
video step.

### 5. Playwright's Chromium build (Stage 2 — both pipelines)

Not vendored — `npx` fetches the Playwright CLI itself on first use, but its browser binary needs a
one-time local install:

```
npx --yes playwright install chromium
```

Sanity-check it works by rendering any local HTML file:

```
npx --yes playwright screenshot --viewport-size=400,300 "file:///<absolute-path>/some.html" test.png
```

On Windows, the `file://` URL needs a native Windows-style path (forward slashes, drive letter) —
see the Windows note in `.claude/skills/static-banner-design/SKILL.md` if you hit
`net::ERR_FILE_NOT_FOUND`.

## Cloning this repo for the first time (new teammate)

```
git clone https://github.com/vladbaranov-ship-it/lingu-agents.git
cd lingu-agents
```

Then follow the one-time setup above — `APIFY_TOKEN` (skip if you'll only ever use the static
pipeline's brief-driven variant B), `FIGMA_TOKEN`, and the two toolchain installs are the only
things you need to add locally; everything else (agents, skills, project folders) comes with the
clone.

## Recommended first run

Ask for a small reel/post count (2–3) on a throwaway/test handle, work through Stage 0's brief, let
Stage 1-2 run, and actually complete the Stage 3 Figma round-trip once end-to-end before running a
full batch or committing to the video pipeline's Stage 5 render — confirming the human-checkpoint
loop works is more valuable on a small test than discovering a Figma-import snag on a real client's
20-reel run.
