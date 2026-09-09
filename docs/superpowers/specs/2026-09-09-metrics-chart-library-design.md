# Metrics chart library design

## Goal

Add a small internal SVG chart library that extends the Metrics catalog with reusable visual widgets while matching the existing Basics tokens. The first catalog pass demonstrates several pie-chart variants, a bar chart, a line chart, a horizontal token-burn heat map, and compact metric widgets. Once the specimens are stable, the same chart components can be composed into UI blocks.

## Scope and placement

The chart primitives live in `src/components/design-system/` and own rendering, labels, legends, and accessible summaries. The Metrics specimen supplies static demonstration data and remains a catalog consumer. A later UI-block entry will consume the same primitives without duplicating chart markup or styling.

The first pass is intentionally dependency-free. SVG is used for geometry, CSS variables provide color and spacing, and no chart state or data fetching is introduced.

## Components and behavior

- `PieChart`: accepts labeled values, supports filled, donut, and compact legend variants, and exposes a text summary through an accessible label/description.
- `BarChart`: renders a small comparison set with value labels and an optional baseline.
- `LineChart`: renders a trend with a visible data-point treatment and text summary.
- `TokenBurnHeatmap`: renders a horizontal sequence of usage cells, with intensity mapped to the accent scale and a legend.
- `MetricWidget`: renders a label, primary value, supporting detail, and optional trend direction.
- `ChartFrame`: shared title, legend, copy target, and responsive layout shell for catalog and UI-block consumers.

Charts are static in the catalog. Any interactive state is limited to keyboard-focusable legends or data points when that improves discoverability; hover alone must not be the only way to read a value.

## Visual rules

Use the existing ink, surface, canvas, accent, success, danger, secondary-text, border, radius, and spacing tokens. Charts use the same thin borders and white surfaces as Basics. Grid cells touch through shared borders, and chart content stays centered with predictable padding. Responsive layouts collapse to one column at the existing specimen container breakpoint.

## Accessibility and resilience

Each chart has a meaningful accessible name and a concise text summary. SVGs are decorative when the summary contains the data; otherwise data points and legends receive labels. Color is paired with labels or patterns so meaning does not depend on hue alone. Empty and zero-value data render without invalid geometry. Long labels wrap within their frame.

## Verification

Tests cover geometry-independent rendering contracts: chart names and summaries, legends, zero/empty data, and the token class names used by the shared styles. A browser check verifies the Metrics specimen at the Components route, the responsive one-column layout, and that the same primitives can render in the UI-block catalog before the migration is marked complete.
