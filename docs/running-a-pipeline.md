# Running a Pipeline

## Starting a new client/campaign

Launch Claude Code in the repo root (the `orchestrator` agent is the default session agent — set
via `.claude/settings.json`) and just describe the request in plain language:

```
Run the full pipeline for @someaccount, last 20 reels.
```

The orchestrator will:

1. Compute the slug (`someaccount` → lowercased handle, `@` stripped, non-alphanumerics replaced
   with `-`) and check whether `projects/someaccount/` already exists.
2. If it's new, copy `projects/_template/` to `projects/someaccount/` and fill in `STATUS.md` with
   the handle, reel count, and today's date.
3. Run Stage 1 (Research) → Stage 2 (Design) → Stage 3 (Animate) in order, updating `STATUS.md`
   after each stage.
4. Report back concise progress after each stage — not raw tool output — and finish with the path
   to the analytics report and the rendered video(s).

If you don't give a reel count, the orchestrator defaults to 20 and tells you it did so, rather
than blocking on the question.

## Resuming a project

If `projects/<slug>/` already exists, the orchestrator reads `STATUS.md` first and resumes from the
next incomplete stage — it will **not** redo finished stages unless you explicitly ask for a
re-run. This is safe to do across separate Claude Code sessions, since `STATUS.md` (not
conversation memory) is the source of truth.

## Running a single stage standalone

Each stage can also be invoked directly, without going through the orchestrator:

```
@marketing-analyst    → research only
@design-strategist     → design only (needs an existing 01-research/ folder)
```

Or invoke the underlying skill directly by name, e.g.:

```
/reels-analytics-report handle 20
```

## Adding brand constraints

If you have known brand direction (palette, tone, an existing brand brief) for a client, either:

- Mention it directly in your request to the orchestrator (e.g. "brand voice is playful, primary
  color is #58CC02"), or
- Fill in `.claude/skills/marketing-design/assets/brand-brief.template.md` and
  `brand-tokens.template.css` and save a client-specific copy into that client's `02-design/`
  folder (don't edit the shared skill template directly — copy it per client).

If no brand direction is given, `design-strategist` uses the skill's placeholder defaults and flags
in its output that brand tokens still need to be filled in.

## What "done" looks like

A finished project has:

- `projects/<slug>/01-research/report.html` — the analytics report.
- `projects/<slug>/02-design/` — a HyperFrames composition that passed `hyperframes check`.
- `projects/<slug>/03-creatives/*.mp4` — the final rendered video(s).
- `projects/<slug>/STATUS.md` marked done, with all file paths recorded.
