# Troubleshooting

## `/mcp` doesn't show `apify`
`APIFY_TOKEN` isn't set in the environment Claude Code sees. Check `.claude/settings.local.json`'s
`env.APIFY_TOKEN`, or that it's exported in the shell you launched Claude Code from. Restart the
session after fixing either. Blocks Stage 1 in either pipeline (variant A); does **not** block the
static pipeline's brief-driven variant B.

## Stage 3 seems "stuck"
It's supposed to be, until you act. Nothing in this system can write to Figma — the `figma` skill is
read-only by design, confirmed against its own auth section (no REST or MCP path creates/edits file
content, even with a valid token). `STATUS.md` showing `waiting on human` at Stage 3 is correct
behavior, not a bug: import the draft into Figma, edit it, and give the orchestrator the file/section
link when you're ready. If the orchestrator ever *claims* it completed a Figma import on its own,
that's the actual bug — it structurally cannot have.

## Stage 4/5 fail with a Figma auth error
Check `FIGMA_TOKEN` is set (`.claude/settings.local.json`'s `env.FIGMA_TOKEN` or shell env) with at
least **File content: Read-only** + **File metadata: Read-only** scopes. A `403` names the exact
missing scope; a `401` means the token is expired/revoked — mint a new one. This only affects Stage
4 (`creative-resizer`) and Stage 5 (`video-animator`) — Stages 0-2 never touch Figma.

## Frame extraction fails (video Stage 1)
`ffmpeg` isn't on PATH, or the downloaded video is corrupt/empty — a likely transient Apify/CDN
issue. Re-run for the affected reel(s); CDN URLs expire fast, never treat a remote URL as the source
of truth, only the downloaded file.

## Image download/prep fails (static Stage 1)
Same shape as above — `ffmpeg` not on PATH, or a corrupt/expired image URL. Re-run for the affected
creative(s).

## `check_frame.py` / `check_banner.py` fails on a Stage 2 draft
Re-run the design agent (`@design-strategist` or `@static-banner-designer`) and ask it to fix the
specific failure — missing/too-small file (broken render) or a pixel-dimension mismatch (re-render
with a matching `--viewport-size`). Let the agent fix its own output rather than hand-patching the
image yourself, so its reasoning stays consistent with what it reports.

## `npx playwright screenshot` fails outright (Stage 2, either pipeline)
- Confirm Node is on PATH (`node -v`) and the one-time browser install completed
  (`npx --yes playwright install chromium`).
- On Windows: `net::ERR_FILE_NOT_FOUND` almost always means the `file://` URL was built from a raw
  Git-Bash/MSYS path instead of a native Windows path — see the Windows note in
  `.claude/skills/static-banner-design/SKILL.md` (`cygpath -w`, then swap backslashes for forward
  slashes).

## `video-animator` refuses to run / says the storyboard isn't confirmed
Working as intended — it checks `figma-handoff.md` for a real link and "returned for animation:
yes" before touching HyperFrames, specifically so nothing animates from an unreviewed draft. Confirm
Stage 3 is actually done (a human returned a real Figma link) before asking it to run again.

## `npx hyperframes` fails outright (Stage 5)
Confirm Node.js 22+ and `ffmpeg` are on PATH in the shell `video-animator` is using. This is the
*only* stage in the system that calls HyperFrames — if you see a `hyperframes` error anywhere else
(Stage 2, Stage 4), that's a sign the wrong agent/skill got invoked, not a HyperFrames setup issue.

## `creative-resizer` says it can't reflow, only crop/scale
It read the approved design via Figma's Phase-1 asset export (flat pixels) instead of Phase-3
component import (structured HTML) — the latter is what makes a real reflow possible. Check the
Figma link points at a proper node/section it can pull component data for, not just an exported
image.

## A subagent seems to have "forgotten" earlier context
Expected — every subagent invocation starts with a fresh context window. Nothing persists between
calls except what's written to `projects/<slug>/` (especially `STATUS.md`). If a stage seems
confused, check that the previous stage actually wrote its expected output files before handing off.

## The orchestrator picked the wrong pipeline (video vs. static)
Tell it explicitly which one you meant — it infers from wording and only asks when genuinely
ambiguous. No cross-contamination risk: the two pipelines write to disjoint folders, so a wrong
guess costs a re-ask, not corrupted state.

## Secrets and git hygiene
- Never commit a literal Apify or Figma token. `.mcp.json` should only ever reference
  `${APIFY_TOKEN}`.
- `.env`, `.claude/settings.local.json`, and `CLAUDE.local.md` are gitignored by design — if you
  ever see one of these staged in `git status`, stop and figure out why before committing.
- `.claude/settings.local.json`'s permission-allowlist entries can accumulate literal tokens if you
  ever approved a `curl`/command that had one inline (e.g. `-H 'X-Figma-Token: figd_...'`) — that
  file is gitignored so it's not a repo leak, but it's still a plaintext secret on disk. Worth a
  periodic look, and rotating the token if you find one.
- If you accidentally commit a secret, rotate it immediately (a `git revert` does not remove it
  from history) and let the team know.
