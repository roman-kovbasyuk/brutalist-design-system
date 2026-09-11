# Validation

The current validation boundary is the standalone design-system workbench and the built library package. Historical campaign integration checks in older plans do not establish current product behavior.

## Required checks

- `npm run typecheck` and `npm run test:run`: source and component contracts.
- `npm run build:library`, `npm run verify:package`, and `npm run test:scripts`: exported artifact, declarations, CSS and verifier tests.
- `npm run verify:consumer`: actual npm tarball installation in a fresh temporary consumer, followed by typecheck, rendered tab/panel ID and disabled-state assertions, and build. Requires registry access.
- `npm run build`: production workbench bundle.
- Browser inspection of the workbench route and representative component interactions.
- `git diff --check`: patch hygiene.

CI runs the library/workbench checks, including the packed-consumer installation. Task Observatory has a separate harness (`npm --prefix observatory run harness`); it does not establish library correctness.

## Cleanup regression coverage

Compatibility tests ensure old AppButton, TextAction, SelectionTile, InlineText and ActionCard entry points share public implementations. FactGrid adapts the old item shape. Tests cover disabled anchor activation, failed inline saves retaining their captured source and draft, cancellation loading the latest value, and exiting-card inert semantics.

Tabs tests cover different labels/values, duplicate visible labels, disabled keyboard navigation, panel visibility and association, distinct supplied group prefixes, exact legacy label callbacks, slug collisions in selection, and historical punctuation IDs. Legacy DOM slug collisions remain a caller constraint; the public API separates values from labels.

Ten gallery integration tests cover overlays and focus return, checkbox/combobox/tile changes, real tab panels, isolated drafts and navigation reset, local file selection/removal, item filtering and preserved selection, and explicit AI preview-only outcomes. Dormant details/export/state tests were removed only with their exclusively tested implementations.

## Verified quality pass — 11 September 2026

- Source: 189 tests in 39 files pass; typecheck passes. New interaction and tab regressions were observed failing before fixes.
- Artifact: library build, package verification, four script tests, and a fresh tarball install/typecheck/runtime assertion/build all pass. Consumer verification uses no source aliases or copied host modules.
- Application: production build passes. The reference catalog still emits Vite's large-chunk warning (852.14 kB minified, 230.52 kB gzip); bundle splitting is not claimed complete.
- Repository: 408 relative imports across 177 source modules resolve (including Vite `?raw` imports). All 70 relative Markdown links across 38 project Markdown files resolve. `git diff --check` passes. Remaining non-runtime source consists of deliberate compatibility exports, reference examples and test tooling, not the removed editor/export layers.
- Independent review: exact legacy tab selection and punctuation-ID regressions were found, reproduced, fixed and re-reviewed. No unresolved findings remained in the reviewed change set.
- Observatory: after installing its two declared dependencies, 50 tests and all six integration checks pass with local-server permission. Restricted-sandbox attempts failed; those failed attempts are not counted as passes. No Observatory source changes were needed.

Browser checks covered the live workbench and an isolated production preview of the same build. Desktop width was 1280 px; narrow checks used 390 × 844 and 320 × 800. The workbench sidebar previously covered its content (main x=74, sidebar right≈251); after correction both boundaries meet at x=244 on desktop, and the sidebar enters normal flow below the existing 900 px breakpoint. Reference catalog and sampled workbench pages had no horizontal document overflow at the inspected widths. The 320 px dialog occupied x=16…304.

Observed interactions: dialog/popover opening, Escape dismissal and trigger focus return; tab arrow navigation and matching visible panel; checkbox changes; searched combobox selection; AI prompt editing, explicit preview-only feedback, absence of draft text from URLs, and reset after family navigation. Reference disabled controls were rendered disabled. The production preview reported no browser warning/error logs during these checks. Responsive screenshots were inspected, not inferred from JSDOM.

The original dev server later reported a filesystem permission error. Its exact project-local Vite process was restarted, and the original `/design-system` URL loaded successfully again. Temporary production-preview resources were used only for verification.

## Limits

JSDOM and sampled browser checks are not a full accessibility audit. Assistive technology, forced colors, all viewport/state combinations and external consumer applications need separate validation. No real provider requests, campaign approvals, deliveries or Figma changes are tested by this repository cleanup.

Observatory's harness explicitly reports that free-text fields do not guarantee secret exclusion and that CLI arguments may remain in shell history. Use sanitized task summaries. Passing its functional checks does not waive those limitations.

Relevant historical design-system plans are retained under `docs/superpowers/`. Source files, the public package entry and current tests are authoritative when historical migration notes refer to removed product paths. The final task report records the actual checks and any remaining failures.
