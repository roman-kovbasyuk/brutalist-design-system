# Phase A — Data Collection

## Verified actors (pinned from a live discovery pass — re-verify if either stops working)

Unlike `reels-analytics-report`'s data-collection doc, this one starts pinned: a discovery pass
against the Apify MCP confirmed both actors below are official, high-usage, high-success-rate, and
return exactly the fields this skill needs. Re-run discovery (`search-actors` /
`fetch-actor-details`) only if one of these starts failing or gets deprecated.

### 1. Organic static posts — `apify/instagram-post-scraper`

Official Apify actor, 99.7% recent-run success rate. Input takes an array of usernames/profile
URLs/post URLs, a `resultsLimit`, an `onlyPostsNewerThan` date filter, and a `dataDetailLevel`
(`basic` vs `detailed`) — use `detailed` so sponsor/paid-partnership flags come through.

Fields to capture per post:

| Field | Source | Notes |
|---|---|---|
| `id` | any stable slug, e.g. `static_01` in feed order | |
| `url` | post URL | |
| `type` | `productType`/`type` field | Keep only `Image` and `Sidecar` (carousel) results — skip `Video`/`Reel` items, those belong to `reels-analytics-report` |
| `caption` | full caption text | |
| `publishedAt` | **ISO date `YYYY-MM-DD`** | matches the video report's sort-by-date format |
| `metrics.likes` | `likesCount` | |
| `metrics.comments` | `commentsCount` | |
| `hero.sourceUrl` | `displayUrl` | the single-image or carousel-cover URL — pass to Phase B |
| `additionalSourceUrls` | `images[]` / `childPosts[].displayUrl` | every extra carousel card, if `type` is `Sidecar` |
| `isSponsored` | `sponsors`/`paidPartnership` field, if present | flag boosted/paid organic posts distinctly from pure organic |

### 2. Paid ad banners (optional) — `apify/facebook-ads-scraper`

Official Apify "Facebook Ads Library Scraper", 98.7% recent-run success rate. Input takes
`startUrls` (a Facebook Page URL, or a Meta Ad Library search/filter URL for the account), a
`resultsLimit`, date-range filters, and an `isDetailsPerAd` flag — turn that on for
reach/spend/EU-audience detail when it's available.

Only invoke this actor when the request or the account's own presence calls for it (e.g. the user
asked specifically about ad creative, or the account is clearly running paid campaigns) — don't run
it reflexively for every static-report request, since Ad Library coverage/detail varies a lot by
region and account.

Fields to capture per ad:

| Field | Source | Notes |
|---|---|---|
| `id` | any stable slug, e.g. `static_ad_01` | |
| `url` | ad's Ad Library URL | |
| `type` | `Image` (single) or `Card` (carousel), from `snapshot.images[]`/`snapshot.cards[]` | |
| `caption` | `snapshot.body.text` | |
| `publishedAt` | `startDate` | |
| `metrics.reachEstimate` | `reachEstimate`, if `isDetailsPerAd` was on | often EU-only — see caveat below |
| `metrics.spend` | `spend`, if `isDetailsPerAd` was on | often EU-only — see caveat below |
| `metrics.isActive` | `isActive` | |
| `hero.sourceUrl` | `snapshot.images[0].originalImageUrl` (or `resizedImageUrl` as fallback) | |
| `additionalSourceUrls` | remaining `snapshot.images[]`/`snapshot.cards[]` entries | |
| `ctaText` | `snapshot.ctaText` | |

**Data-quality caveat to carry into the report:** Meta generally only exposes real spend/reach
numbers for EU-regulated ads; non-EU ad performance metrics are usually `null`. Say so explicitly in
the report rather than treating a missing number as zero.

## Engagement rate (organic posts only — ads don't have a comparable public metric)

```
engagementRate = likes + comments  # Instagram post scraper does not expose a reliable per-post
                                     # reach/impressions denominator the way Reels views do, so this
                                     # skill reports raw engagement count rather than a rate. If your
                                     # actor output does expose reach/impressions, divide by it and
                                     # store the result as metrics.engagementRate instead.
```

If you do have a real denominator, store the ratio as a plain fraction (e.g. `0.0368`), matching the
video report's convention — the HTML report formats it as a percentage for display either way.
