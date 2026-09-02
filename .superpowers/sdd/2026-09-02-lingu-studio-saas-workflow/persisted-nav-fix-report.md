# Persisted-only workflow navigation fix

## Scope

- Added a regression test covering a persisted `in-review` package loaded directly at `/campaign/campaign-first-week`.
- Guarded StepRail navigation to stages 1–4 when a non-draft persisted review package has no hydrated local strategy or generated assets.
- Routed both Stage 5 “Back to banner preview” controls through the guarded navigation callback, keeping persisted Stage 5 visible instead of exposing an empty preview.
- Preserved navigation and rendering for persisted review stages 5–7, including approved delivery.

## TDD

- RED: the new regression test failed because Stage 5 Back navigated to an empty Banner preview.
- GREEN: the persisted-only navigation guard made the focused test pass.

## Verification

- `npm test -- --run src/App.test.jsx -t "keeps persisted-only review navigation out of empty earlier stages"` — passed.
- `npm test -- --run src/App.test.jsx` — 33 tests passed.
- `npm test -- --run` — 71 tests passed across 6 test files.
- `npm run build` — Vite production build succeeded.
- `git diff --check` — no whitespace errors.
