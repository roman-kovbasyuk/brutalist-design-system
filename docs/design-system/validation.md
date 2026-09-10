# Validation

The current validation boundary is the standalone design-system workbench and the built library package. Historical campaign integration checks in older plans do not establish current product behavior.

## Required checks

- `npm run typecheck` and `npm run test:run`: source and component contracts.
- `npm run build:library`, `npm run verify:package`, and `npm run test:scripts`: exported artifact, declarations, CSS and verifier tests.
- `npm run verify:consumer`: actual npm tarball installation in a fresh temporary consumer, followed by typecheck and build. Requires registry access.
- `npm run build`: production workbench bundle.
- Browser inspection of the workbench route and representative component interactions.
- `git diff --check`: patch hygiene.

CI runs the library/workbench checks, including the packed-consumer installation. Task Observatory has a separate harness (`npm --prefix observatory run harness`); it does not establish library correctness.

## Cleanup regression coverage

Compatibility tests ensure old AppButton, TextAction, SelectionTile, InlineText and ActionCard entry points share public implementations. FactGrid adapts the old item shape. Tests cover disabled anchor activation, failed inline saves retaining their captured source and draft, cancellation loading the latest value, and exiting-card inert semantics.

## Limits

JSDOM and sampled browser checks are not a full accessibility audit. Assistive technology, forced colors, all viewport/state combinations and external consumer applications need separate validation. No real provider requests, campaign approvals, deliveries or Figma changes are tested by this repository cleanup.

Relevant historical design-system plans are retained under `docs/superpowers/`. Source files, the public package entry and current tests are authoritative when historical migration notes refer to removed product paths. The final task report records the actual checks and any remaining failures.
