# Task 6 Report — Review preparation, approval, and Delivery

## Delivered

- Added a local `reviewStore` with stable per-campaign keys, safe JSON reads, same-document events, cross-tab storage-event subscription, and cleanup.
- Replaced the temporary Stage 5 master with selected-banner thumbnails and a semantic review table. Submitted packages persist immutable banner/template/media/motion snapshots and expose the yellow in-review state, Figma link, local-simulation label, and notification copy.
- Added persisted designer review at both `/designer/:campaignId` and `/review/:campaignId`. Only this endpoint can mark a submitted package ready for approval; absent packages show an honest disabled empty state.
- Reworked Stage 6 around the persisted lifecycle and marketer-only confirmation as Maya Chen.
- Reworked Stage 7 to create four resize outputs per approved selected banner, provide local simulated asset/manifest downloads, and show a semantic production summary with reviewer, approver, formats, selected videos, total assets, and currency-safe production cost.
- Removed the legacy numbered-review UI.

## Test evidence

- RED: `npm test -- --run src/domain/reviewStore.test.js` initially failed because `reviewStore.js` did not exist.
- GREEN: `npm test -- --run src/App.test.jsx src/domain/reviewStore.test.js` passed with 29 tests after the review lifecycle implementation.
- Full suite: `npm test -- --run` passed with 55 tests.
- Build: `npm run build` completed successfully.

## Self-review

- Checked the working diff with `git diff --check`.
- Confirmed no legacy numbered review content remains in rendered source.
- Verified no external Figma, notification, rendering, image, or video service is invoked.

## Fix round 1 — review follow-up

- Hardened review persistence for unavailable browser storage and malformed persisted nested package fields. Workflow consumers now receive normalized banner IDs, selected-banner records, generated assets, and motion maps.
- Reset campaign-scoped workflow state on campaign URL changes, and return an invalidated Delivery view to the latest permitted review or approval stage.
- Preserved approved motion settings in all four Delivery resizes and included media, source asset, template, and motion metadata in simulated asset/manifest payloads.
- Updated approval copy to name the persisted designer, with the Jordan Lee default as a fallback.

### Fix-round evidence

- RED: `npm test -- --run src/domain/reviewStore.test.js` initially failed for an inaccessible `localStorage` getter and unnormalized malformed fields; `npm test -- --run src/App.test.jsx` initially failed because the approval copy was hard-coded and a campaign switch retained the previous AI-assets stage.
- GREEN: `npm test -- --run src/domain/reviewStore.test.js src/App.test.jsx` passed with 32 tests after the fixes. The focused download assertion required a test-double adjustment because this test environment's Blob does not expose `.text()`; the final test asserts the simulated JSON passed to the Blob constructor.
- Full suite: `npm test -- --run` passed with 58 tests.
- Build: `npm run build` completed successfully.

## Fix round 2 — persisted-package sanitization

- Reconstructed each persisted banner, template, visual, content block, motion preset, selected ID, and generated-asset record from safe primitive fields before UI consumption. Object-shaped values now become conservative strings/defaults or are dropped, preventing object-valued React children.
- Hydrated legacy top-level `motionByBannerId` entries into selected banners that lack their own motion snapshot, so Delivery previews and simulated downloads retain approved motion.
- Changed storage resolution to default only for `undefined`; explicit `null` storage remains unavailable rather than falling back to `window.localStorage`. Subscription options likewise avoid storage acquisition.

### Fix-round evidence

- RED: `npm test -- --run src/domain/reviewStore.test.js src/App.test.jsx` failed for unsafe banner/asset object fields and for missing legacy motion in the Delivery payload.
- GREEN: `npm test -- --run src/domain/reviewStore.test.js src/App.test.jsx` passed with 34 tests, covering object-valued `templateName` and `content.headline`, explicit null storage, and legacy motion hydration.
- Full suite: `npm test -- --run` passed with 60 tests.
- Build: `npm run build` completed successfully.
