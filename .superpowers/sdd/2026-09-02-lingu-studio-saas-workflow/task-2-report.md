# Task 2 report: Dashboard and application routing

## Summary

Implemented the Dashboard as the default Lingu Studio route and replaced internal view-only navigation with lightweight pathname and browser-history routing. Templates and Design system remain available, and the existing workflow stays mounted while those reference destinations are visited so in-progress campaign work is retained.

## Delivered

- Added `DashboardScreen` with a compact metric strip using `dashboardMetrics` and a native campaign-history table using `campaignHistory`.
- The history table includes Date, Status, Campaign, Banners, Total generations, Static visuals, Videos, Production cost, and Action columns. Each row has an accessible Open action.
- Added pathname routing without a new dependency:
  - `/` → Dashboard
  - `/campaign/:id` → workflow
  - `/designer/:id` → designer review simulation
  - `/templates` → templates
  - `/system` → design system
- Added `popstate` handling and history updates for app navigation.
- Updated shell navigation to Dashboard, Campaign, Templates, and Design system; added the local demo user identity.
- Added `DesignerReviewScreen`, receiving campaign data, review status, and a mark-ready callback via props. It transitions the local in-memory review state to `ready-for-approval` and explicitly labels Figma/review behavior as simulated. Durable `localStorage` synchronization was intentionally left for Task 6.
- Added restrained, route-specific CSS classes for the dashboard, table, status badges, and review simulation without a global stylesheet rewrite.

## Test-first evidence

Added App tests before implementation for:

- Dashboard default and all four metric labels.
- Every required history-table column plus a representative campaign row.
- Opening a campaign from the table.
- Direct pathname routes and `popstate` navigation.
- Direct campaign/designer URLs and the designer ready-for-approval state change.

RED command:

```text
npm run test:run -- src/App.test.jsx
9 failed, 3 passed
```

The failures showed the expected missing Dashboard navigation/table/routes and old Process-first behavior.

GREEN command:

```text
npm run test:run -- src/App.test.jsx
12 passed
```

Full verification:

```text
npm run test:run
3 test files passed, 30 tests passed
```

`git diff --check` completed with no whitespace errors.

## Self-review

- Confirmed all requested routes are present and the route parser falls back safely to Dashboard for unsupported paths.
- Confirmed the history surface uses native table semantics, row headers, column headers, and explicit Open controls.
- Confirmed reference-screen visits retain the mounted workflow state, preserving existing behavior coverage.
- Confirmed the work avoids the campaign-domain generation logic and does not add a routing dependency or persistence ahead of Task 6.
- No material issues found in the final diff.
