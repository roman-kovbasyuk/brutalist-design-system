# Lingu Studio V1

The active product prototype is now a local-first React application. It demonstrates the complete
client workflow: free-form brief → generated copy and media prompts → five visual directions → one
of twenty template compositions → explicit Figma designer review → four delivery resizes.

```bash
npm install
npm run dev
```

The V1 has no runtime dependency on Claude Code, Apify, HyperFrames, Figma APIs, or any cloud
provider. Generation and review are deterministic local simulations with explicit labels. See
[README-MVP.md](README-MVP.md) for scope and architecture, and
[the V1 specification](docs/superpowers/specs/2026-09-01-lingu-studio-v1-design.md) for the full PRD.

The original Claude-oriented marketing pipeline remains below as legacy/reference material. The
new web application does not import from or execute anything under `.claude/`.

---

# Legacy: Lingu Agents — Marketing Pipeline System

Turn a social account into researched, on-brand marketing creative — end to end, inside Claude Code
— with a real **human review checkpoint in Figma** built into both pipelines. HyperFrames (motion)
only ever runs at the very last video step. See [CLAUDE.md](CLAUDE.md) for how the agents themselves
are instructed; this file is the human setup guide.

For the full documentation set (architecture, running the pipeline, agents/skills reference, project
conventions, troubleshooting), see **[docs/index.md](docs/index.md)**.

## The six stages

```
0 Brief            standardized campaign request — human-approved before anything runs
1 Research           marketing-analyst / static-creative-analyst (+ competitors, if listed)
2 Design                design-strategist / static-banner-designer — STATIC output only
3 Human Figma review      you import the draft into Figma, edit, share the link back
4 Resize / variant           creative-resizer — optional
5 Animate (video only)          video-animator — the ONLY stage that touches HyperFrames
```

## What's in here

- **`orchestrator`** agent — default entry point, walks you through Stage 0, runs either pipeline
  (or both), and genuinely pauses at Stage 3.
- Video pipeline:
  - **`marketing-analyst`** agent + **`reels-analytics-report`** skill — Apify-powered Reels
    research and a self-contained analytics HTML report.
  - **`design-strategist`** agent + **`static-storyboard-design`** skill — a branded **static
    storyboard** (one frame per structural block, director notes, no HyperFrames), handed off for
    Figma review.
  - **`video-animator`** agent — the only agent with
    [HyperFrames](https://github.com/heygen-com/hyperframes) access; turns your Figma-approved
    storyboard into the final rendered video.
- Static-banner pipeline:
  - **`static-creative-analyst`** agent + **`static-creatives-report`** skill — Apify-powered static
    post/ad-banner research (variant A).
  - **`static-banner-designer`** agent + **`static-banner-design`** skill — draft banners rendered
    to flat PNG/JPEG via Playwright, from research or a filled-in marketing brief (variant B). No
    HyperFrames involved.
- Shared:
  - **`creative-resizer`** agent — optional Stage 4, expands an already-approved design into more
    sizes/"variable" variants without changing the original.
  - **`figma`** skill (vendored, **read-only by design**) — the only way this system ever touches
    Figma; it can pull an approved design back out, it can never push one in.
  - **`projects/`** — one folder per client/account, copied from `projects/_template/`.

## Prerequisites

1. **Node.js** (for `npx`) — check with `node -v`.
2. **ffmpeg** on PATH — check with `ffmpeg -version`. Used for Reel frame extraction and final video
   rendering (video pipeline, Stage 5), and for `ffprobe`-based dimension checks (both pipelines,
   Stage 2). Install via your platform's package manager (e.g. `winget install ffmpeg`,
   `brew install ffmpeg`).
3. **Python 3** on PATH — check with `python3 --version` (or `python --version` on Windows). Used by
   the report-building and check scripts (standard library only, no pip installs required).
4. **An Apify account and API token** — sign up at [apify.com](https://apify.com), Settings →
   Integrations. Needed for Stage 1 in either pipeline; not needed at all for the static pipeline's
   brief-driven variant B.
5. **A Figma account and personal access token** — figma.com → Settings → Security → Personal
   access tokens. **Read-only scopes only** (File content, File metadata) — this integration never
   writes to Figma. Needed for Stage 3's read-back onward (Stage 4, Stage 5).
6. **Playwright's Chromium build** — one-time: `npx --yes playwright install chromium`. Needed for
   Stage 2's draft rendering in **both** pipelines.

## One-time setup

1. **Apify + Figma tokens.** `.claude/settings.local.json` is gitignored and machine-local — Claude
   Code may already have created one here (it stores your per-session tool approvals). **Don't
   overwrite it**; open it and merge in an `env` block, using `.claude/settings.local.json.example`
   as a reference for the shape:
   ```json
   {
     "permissions": { "...": "...(leave whatever is already here alone)..." },
     "env": { "APIFY_TOKEN": "your-real-token-here", "FIGMA_TOKEN": "your-real-token-here" }
   }
   ```
   If `.claude/settings.local.json` doesn't exist yet, copy the `.example` file to that path
   instead. Alternatively, export both in your shell before launching Claude Code. **Never commit a
   real token** — and check your permission-allowlist entries occasionally for a token that ended up
   pasted in plaintext from an approved `curl` command; rotate it if you find one.

2. **Verify the Apify connection.** Run `/mcp` in a Claude Code session — you should see an `apify`
   server connected. If not, confirm `APIFY_TOKEN` is actually set in the session's environment.

3. **HyperFrames toolchain (Stage 5 only).** Already installed into `.claude/skills/` via
   `npx skills add heygen-com/hyperframes --full-depth --yes` (includes the `figma` skill).
   Sanity-check: `npx hyperframes --help`. Only `video-animator` ever runs these commands.

4. **Playwright's Chromium build (Stage 2, both pipelines).** `npx --yes playwright install
   chromium`.

## Running your first pipeline

Launch Claude Code in this folder (the orchestrator is the default agent) and describe the account —
it starts with Stage 0's brief, then runs Stage 1-2 automatically:

```
Run the video pipeline for @someaccount, last 20 reels.
```

```
Run the static-banner pipeline for @someaccount, last 15 posts.
```

```
Design static banners from this marketing brief — no research needed. [paste brief details]
```

The orchestrator infers which pipeline (and, for static, which variant) you mean, asking only if
genuinely ambiguous. At Stage 2's end it hands you `figma-handoff.md` and **stops** — nothing in
this system can push to Figma, so Stage 3 is on you: import the draft, edit it, send back the link.
Once you do, ask for Stage 4 (resize/variant) if you want it, and — video only — Stage 5 to animate.

**Recommended first run:** a small count (2–3 reels/posts) and a real Stage 3 round-trip, to confirm
the whole loop works before committing to a full batch or a final render.

## Customizing per client

- Fill in `.claude/skills/marketing-design/assets/campaign-request.template.md` (Stage 0) and
  `brand-brief.template.md` / `brand-tokens.template.css` per client — brand tokens apply identically
  to both pipelines.
- Copy `projects/_template/` to `projects/<new-client-slug>/` to start a new account.
- The static pipeline's brief-driven variant (B) has no separate template — it designs straight from
  the Stage 0 `campaign-request.md` you already filled in.
- Apify actors are pinned for the static pipeline already (`apify/instagram-post-scraper`,
  `apify/facebook-ads-scraper`, from a verified discovery pass); pin your own preferred actor for the
  video pipeline in `.claude/skills/reels-analytics-report/references/01-data-collection.md` if you
  have one, otherwise the skill discovers one dynamically each run.

## Troubleshooting

- **`/mcp` doesn't show `apify`** — `APIFY_TOKEN` isn't set. Not needed for the static pipeline's
  brief-driven variant B.
- **Stage 3 looks "stuck"** — that's correct; nothing can write to Figma automatically. Import the
  draft yourself, edit it, and send the link back.
- **Stage 4/5 fail with a Figma auth error** — check `FIGMA_TOKEN` has at least read-only File
  content + File metadata scopes.
- **Frame extraction fails** — `ffmpeg` isn't on PATH, or the downloaded video file is corrupt/empty.
- **`npx playwright screenshot` fails with `ERR_FILE_NOT_FOUND` on Windows** — the `file://` URL
  needs a native Windows path (`cygpath -w`, forward slashes), not a raw Git-Bash/MSYS path; see
  `.claude/skills/static-banner-design/SKILL.md` for the exact conversion.
- **`check_banner.py`/`check_frame.py` reports a dimension mismatch** — re-render with
  `--viewport-size` set to exactly the expected width/height.
- **`npx hyperframes` fails** — this should only ever be `video-animator`, at Stage 5; confirm
  Node 22+/ffmpeg are on PATH. A HyperFrames error anywhere earlier means the wrong agent ran.

See [docs/troubleshooting.md](docs/troubleshooting.md) for the full list.
