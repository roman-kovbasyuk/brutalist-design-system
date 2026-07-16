# Phase A — Data Collection

## Finding an actor

Use the Apify MCP's discovery tools rather than assuming an actor ID up front:

1. `search-actors` for something like "instagram reel scraper" or "instagram post scraper".
2. `fetch-actor-details` on the best-looking candidates to check its input schema (does it take a
   profile URL/handle + a result limit? does it return reel-level metrics?) and recent run success
   rate.
3. `call-actor` with the account handle and a result limit of `$count`, filtered/sorted to Reels
   specifically if the actor supports it.

**Pin a known-good actor once you've found one:** replace this section with the exact actor ID/name
so future runs skip the discovery step. Until then, re-discover each run.

## Fields to capture per reel

| Field | Notes |
|---|---|
| `id` | Any stable slug, e.g. `reel_01`, `reel_02` in feed order |
| `url` | Link to the post |
| `caption` | Full caption text |
| `publishedAt` | **ISO date `YYYY-MM-DD`** — the report's sort-by-date relies on this format |
| `durationSec` | Video duration in seconds |
| `metrics.views` | View/play count |
| `metrics.likes` | Like count |
| `metrics.comments` | Comment count |
| `metrics.shares` | Share count, if the actor exposes it — otherwise `null`, don't guess |
| `metrics.saves` | Save count, if exposed — otherwise `null` |
| `cover` | Cover/thumbnail image — prepare as a base64 data URI the same way as storyboard frames (Phase B) |

## Engagement rate

```
engagementRate = (likes + comments) / views
```

Compute once views/likes/comments are known and store as `metrics.engagementRate` — a plain
fraction (e.g. `0.0368`), not a percentage; the report formats it as a percentage for display.

If `views` is `0` or missing, set `engagementRate` to `null` rather than dividing by zero.
