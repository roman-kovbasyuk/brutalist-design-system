# Design System Home Screen

## Goal

Replace the root design-system overview with a useful home screen that summarizes the library, supports anchor search, and shows recent changes.

## Design

The root route (`/design-system` or `/`) keeps the existing sidebar and uses a new overview composition. Four summary cards show Basics assets, Components, UI blocks, and changes from last week. A full-width search field filters a catalog of named sections and components; selecting a result navigates to its existing route and hash anchor. A latest-updates feed follows, grouped by date, with subtle status colors for added, updated, and deleted entries and labels for section and module.

The overview uses existing design tokens and shared controls (`AppButton`, `FormField`-style field treatment, and current section/card primitives). It does not introduce a second navigation model or mutate existing section routes.

## Behavior

- Summary counts are derived from the current catalogs where possible.
- Search is keyboard accessible, supports text filtering, and closes after selection.
- Search results link to real anchors already present in the catalog.
- Empty search results are announced with a short message.
- Updates are static reference data for this screen and are grouped newest first.

## Verification

Add focused screen tests for the four cards, autocomplete filtering and anchor hrefs, update grouping/status labels, and the existing section navigation.
