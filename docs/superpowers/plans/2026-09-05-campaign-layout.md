# Campaign layout implementation plan

**Goal:** Apply the approved campaign layout without extending upload or video functionality.

**Architecture:** Adapt the existing StepRail for the eight-step workflow. Add a read-only campaign overview using persisted brief and analysis data, and restyle visual directions as full-width media/text rows. Keep existing generation, selection, permissions, and navigation behavior.

**Tech stack:** React, existing design-system styles, Vitest and Testing Library.

**Approved scope:** Right-side sticky timeline, large campaign title and factual bento overview, stacked direction cards with the existing image-generation action on the placeholder. Narrow screens collapse the timeline and stack media above text. Upload/video controls and structured AI extraction are deferred, not mocked.

## Implementation

- [ ] Extend `src/components/StepRail.jsx` with configurable items, hidden steps, pending state and scroll behavior; retain legacy defaults. Test eight steps, locked/current states and navigation.
- [ ] Add `src/studio/CampaignOverview.jsx` for known audience/objective/offer, unspecified duration/formats, and saved analysis summary (fallback explicitly labelled brief). Test unknown values and legacy data.
- [ ] Integrate the rail and overview in `src/studio/StudioApp.jsx`; add responsive styles in `src/studio/campaign-layout.css` without changing the sidebar or stage order.
- [ ] Update `src/studio/VisualStage.jsx` to use full-width rows and move the existing generation action onto the placeholder. Test generation, selected image, pending and read-only behavior.
- [ ] Run focused component tests, production build, and desktop/mobile browser checks; review the diff for out-of-scope behavior changes.
