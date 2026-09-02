# Task 5 — Banner preview, filters, selection, and motion

## Delivered

- Replaced the legacy Stage 4 template picker with **Banner preview**.
- Derives candidates with `createBannerCandidates` for the selected static visual and its linked video. The default static Vertical/SMM Static filters show 20 template compositions.
- Added exact Format and Platform dropdowns, a conditional Static/Video segmented control, a persistent multi-select control, filtered empty state, and selected-count feedback.
- Added a comparison gallery with a detailed preview containing template, dimensions, format, platform, media type, and source visual.
- Added independent Text, Image, and CTA motion presets per banner. Preset changes and Replay increment a versioned animation key once; no animation loops by default.
- Updated `BannerPreview` with transform-safe `.motion-media`, `.motion-copy`, and `.motion-cta` wrappers.
- A template chosen in the library now returns to and focuses its candidate in Stage 4 rather than skipping preview.
- Stage 5 requires at least one selected banner, while retaining compatibility through the active or first selected candidate.

## Test-first evidence

- RED: `npm run test:run -- src/components/BannerWorkspace.test.jsx src/components/BannerPreview.test.jsx src/App.test.jsx` failed before implementation because `BannerWorkspace` and motion-wrapper behavior did not exist, and Stage 4 was still the template picker.
- GREEN focused: the same command passed with 26 tests.
- Full verification: `npm run test:run && npm run build` passed: 41 tests across 4 files and a successful Vite production build.

## Scope

Task 6 review-packet persistence was intentionally not added. The existing Stage 5 integration view remains temporary pending that task.

## Fix round 1 — review regressions

- Normalized a stale Video filter to the visible static Vertical/SMM Static combination when the selected static no longer has a linked video.
- Closed Stage 5 when the final selection is removed and when a library template request clears selections; rail navigation now also guards the no-selection case.
- Limited downstream compatibility to an active banner only when it is selected, otherwise using the first selected banner.
- Added a pending library-template synchronization path that chooses a matching candidate and updates format, platform, and media state even from an empty filter tuple.
- Restored type-led copy distribution on the inner motion wrapper and corrected the disabled generated-video accessible label.
- Changed both filter’s all-option label to `All`.

### Fix-round test evidence

- RED: focused BannerWorkspace, BannerPreview, and App tests produced eight expected failures: stale Video Reels filtering, Stage 5 rail access after clear, compatibility choosing the unselected preview, library focus under empty filters, missing type-led distribution hook, non-exact `All` labels, and the stale generated-video accessible label.
- GREEN focused: `npm run test:run -- src/components/BannerWorkspace.test.jsx src/components/BannerPreview.test.jsx src/App.test.jsx` passed with 33 tests.
- Final verification: `npm run test:run && npm run build` passed with 48 tests across 4 files and a successful Vite production build.
