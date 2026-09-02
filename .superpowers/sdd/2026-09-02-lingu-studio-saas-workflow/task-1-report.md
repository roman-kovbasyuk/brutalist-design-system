# Task 1 — Campaign production domain report

## Scope delivered

- Added pure deterministic campaign-production helpers in `src/domain/campaign.js`.
- Added stable local dashboard fixtures in `src/data/campaigns.js`.
- Extended `src/domain/campaign.test.js` without altering existing coverage.
- Did not change UI, CSS, or make external calls.

## Contract

- `generatePromptIdeas(strategy)` creates five stable prompt records from the existing visual seeds, including highlight fields and a `$0.12` static estimate.
- `createStaticAsset(prompt)` and `createVideoAsset(staticAsset)` preserve source relationships and derive stable IDs. Static generation costs `$0.12`; video generation costs `$1.80`.
- `estimateVideoBatch(assets)` counts unique static asset IDs and returns a deterministic count, unit cost, and total cost.
- `createBannerCandidates(input)` derives candidates from templates and generated assets, de-duplicates repeated templates/assets, and filters by format, platform, and media type.
- `campaignHistory`, `productionTotals`, and `dashboardMetrics` provide four fixed campaign rows and calculated totals for the Dashboard.

## Design ruling

The task/spec names the dashboard fixtures but does not prescribe their export names or exact fixture values. I used `campaignHistory`, `productionTotals`, and `dashboardMetrics`; fixture costs use the required fixed unit prices, and the ratio is rendered as a stable one-decimal string (`2.9:1`). This keeps Dashboard consumers simple without adding UI-specific behavior to the domain module.

## TDD evidence

- RED: `npm run test:run -- src/domain/campaign.test.js` initially failed because the requested `src/data/campaigns.js` fixture module did not exist.
- RED: the duplicate-template candidate assertion failed with eight candidates where four unique candidates were required.
- GREEN: `npm run test:run -- src/domain/campaign.test.js` passed: 1 file, 14 tests.
- Full verification: `npm run test:run` passed: 3 files, 23 tests.
- Hygiene: `git diff --check` passed.

## Self-review

Reviewed the full diff against the Task 1 brief and authoritative spec. The candidate IDs include template, source asset, and format; generated assets retain both their direct and upstream source IDs; and both input assets and templates are de-duplicated. A fixture-total export mutation found during review was refactored into an immutable object before final verification.

## Concerns

None. The named fixture export contract is a documented reasonable ruling for the otherwise unspecified Dashboard consumer interface.
