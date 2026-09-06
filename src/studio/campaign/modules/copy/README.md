# Copy module

Two primary states: empty guidance and generated cards. Brief submission's coordinator prepares the first batch; mounting or refreshing Copy never dispatches generation.

Input: immutable `copies` batches, analyzed Brief, `selectedCopyId`, and optional existing `previewAssetId`/`previewTemplateId`. Each batch exposes `approvedCandidateIds`; the workspace service removes hidden candidates before projection. Current batches arrive oldest first.

Commands:

- `generate()` appends up to five visible cards, with the runtime's retry identity. The server reserves remaining capacity under campaign locking and counts pending/unknown job reservations; a successful replay never appends twice. Limit: 30 visible cards, independently of existing budget/request limits.
- `approve(candidateId)` adds approval without clearing earlier approvals. The first approval bridges to the existing Banners selection. Later approvals leave that selection and its composition unchanged.
- `remove(candidateId)` persists hidden state without erasing generation history. Deleting the selected copy clears downstream selection; another approved card's check icon explicitly restores it. No replacement is chosen silently.
- `select(candidateId)` remains for legacy chain consumers, not the cards' default approval action.

Preview lazily renders one card using existing content and image data. It never requests image generation or changes selection. View errors stay local. The shared card, empty-state, button, modal, and exit-presence components own interaction behavior and reduced-motion support.

Run in isolation: `npm test -- --run src/studio/campaign/modules/copy server/repositories/copyOptions.integration.test.js`. The PostgreSQL test uses its own temporary schema; it exercises persisted approvals, append order, cap, replay, reservations, deletion and explicit replacement selection.
