# Brief module: analysis, refinement, and automatic first drafts

Status: draft v1 for review. Captures Roman's Brief-state instructions and the clarified module handoff on 6 September 2026. This document does not claim application implementation.

Related documents: [six-module architecture](../plans/2026-09-06-campaign-module-architecture.md) and [structural implementation plan](../plans/2026-09-06-six-module-campaign-implementation.md).

## Core decision

After successful brief analysis, the application automatically prepares the first copy options and the first visual prompts. The user does not need to click another generation button or select copy to obtain those initial results.

Brief publishes the analyzed campaign information. Copy creates copy options. Visuals creates and displays visual-generation prompts. Brief does not own either downstream generator.

Image generation is a separate, explicitly user-initiated action after reviewing the visual prompts. No image generation is included in the automatic first-draft sequence because it is budget-heavy.

The visible workflow remains Brief → Copy → Visuals → Banners → Review → Distribute. Its first data handoffs branch from Brief: Copy and Visuals both consume the analyzed brief independently.

## Brief states

### 1. Default

- Keep the existing input interface and application background/layout.
- The user can paste/type campaign text, attach supported files, or combine both.
- Keep the existing attachment validation and input limits; do not introduce extra campaign fields before analysis.
- The primary action is **Analyze brief**.

### 2. Analysis in progress

- Submit the brief to AI when the user activates Analyze brief.
- Show a spinner and status messages describing the work actually underway. Do not invent percentages or provider progress.
- Preserve the submitted text and attachments while processing, and prevent duplicate submission of the same active analysis.
- The processing state belongs to Brief; it must not replace the entire campaign page with a loading screen.
- On initial analysis failure, keep the input available and show a local error/retry action. Do not start either downstream generator without successful analysis.

### 3. Results

Display the following in this order:

1. **Campaign name.** AI creates the initial name. Update the campaign header and the corresponding sidebar caption together with a subtle micro-animation. Preserve the existing click-to-rename interaction; no separate title field or success confirmation is needed. Respect reduced-motion preferences.
2. **Concise summary.** A short, readable explanation of the campaign.
3. **Campaign details grid.** Boxed details for audience, objective, channels, and formats. Do not fabricate facts absent from the input; make missing information apparent and editable.
4. **AI chat box.** A place to add context or request refinements to the analyzed brief.

Keep the user at the Brief result so they can inspect/refine it. Copy and Visuals expose their own loading/results as their first drafts are prepared; completing background work must not force a navigation jump.

### 4. Inline editing and AI refinement

- Allow direct inline editing of the summary and campaign-detail values, without a separate full-page form.
- Preserve direct click-to-rename for the campaign name and synchronize the saved name with the sidebar.
- The user can submit additional instructions through the AI chat box.
- Chat submission shows an analysis/refinement progress state in Brief, then updates the summary and structured details from the successful result.
- Keep the last successful result and the user's submitted refinement available if refinement fails.
- Inline edits and chat refinement update the same saved brief, not separate competing versions of the campaign facts. A late AI response must not silently overwrite newer user edits.

## Module handoff

| Producer | Consumer | Information transferred | Automatic first action |
| --- | --- | --- | --- |
| Brief | Copy | Saved brief, concise summary, campaign details, and identity of the analyzed source | Generate the first five copy options, using the previously specified headline, short text, CTA, and optional tag structure |
| Brief | Visuals | The same analyzed source and campaign context | Generate and display the initial visual prompts; do not generate images |
| Visuals | Image generation inside Visuals | The specific prompt the user has reviewed | None: wait for the user's explicit Generate image action |

Copy owns its generation instructions and output. Visuals owns its prompt-generation instructions and prompt output. Neither view reaches into Brief's local state or calls its sibling's internals.

Both initial text-generation tasks should be scheduled from one successful analyzed source. They are independent logical branches, not a requirement to run two unsafe writes concurrently. The coordinator can serialize requests when the existing generation lock, provider limits, or budget controls require it; no additional user clicks should be introduced.

Visual prompts must not depend on a user-selected copy option. A failure in Copy must not discard already created visual prompts or require a copy selection before prompts can be prepared. An unresolved job can still temporarily block dispatch under the existing safety rules; do not bypass that protection.

Banners still requires its selected copy and selected generated visual. Automatically preparing first drafts does not automatically select, approve, or distribute them.

## Image-generation boundary

- Display generated visual prompts before offering generation of their images.
- The user explicitly activates **Generate image** for the intended prompt. Do not add a second mandatory approval dialog solely for this rule; the explicit generation action is the boundary.
- Analysis, chat refinement, initial copy generation, initial prompt generation, copy selection, navigation, page reload, and polling completion must never automatically call an image-generation operation.
- Every new image or regeneration requires an explicit user request. Prevent repeated activation while that request is running.
- If an image request times out with an uncertain result, reconcile that request before allowing a fresh paid generation. Do not silently retry it as a new job.
- Existing authorization, budget checks, idempotency, and backend generation safeguards continue to apply to text and image operations alike. Automatic text generation is not described as free or unlimited.

## Draft preservation and scope

The automatic behavior specified here is preparation of the **first** copy options and visual prompts. Later replacement/regeneration behavior will be specified with the Copy and Visuals modules. This document does not authorize silently replacing user-edited text, selected options, reviewed prompts, or existing images after a brief refinement.

Preserve the architecture's stale-data protection: downstream results retain their source identity; changing that source makes outdated results apparent and prevents them from being treated as current. No automatic image regeneration follows a brief or prompt change.

The visual-prompt count, prompt editing controls, and batch image-generation UX belong to the Visuals specification. Keep their existing configured scope until those requirements are supplied. No video generation, upload feature, new brand editor, or distribution integration is added by this Brief specification.

All controls, layouts, progress feedback, and inline-edit patterns must use the application design system. Promote a missing reusable pattern into that system before adding a product-specific implementation. Banner brand styles are not the application design system.

## Implementation handoff: changes from the structural baseline

The structural plan preserved old functionality while separating modules. This is a new functional specification, with these explicit integration changes:

1. **Coordinator:** successful analysis schedules first Copy and Visuals outputs. The inspected coordinator currently sequences analysis → Copy and navigates to Copy. It must instead keep Brief results accessible in place and track the two downstream operations independently.
2. **Visuals input contract:** initial prompt generation must accept the analyzed brief without a selected copy. The inspected `moduleContracts.js` and generation service still model directions using selected copy. This requires a coordinated contract/service change, not merely clicking the existing direction-generation button automatically.
3. **Availability:** Visuals prompt review becomes available after successful brief analysis, even before copy selection. Later Banners prerequisites stay intact.
4. **Brief result model:** editable summary, audience, objective, channels, and formats must be persisted and become the information consumed by both branches. They must not be cosmetic UI values disconnected from generation inputs.
5. **Initial generation identity:** record the analyzed source and each branch's job/result so refreshes, remounts, and duplicate completion notifications do not generate another first set. Retry/reconcile the affected branch without repeating a successful sibling job or re-creating the campaign.
6. **Provider and server guards:** preserve review permissions and budget/unknown-job protections while changing direction-generation prerequisites. Do not release image generation from any existing server safety gate.

This requirements task changes documentation only. The integration owner should update the relevant implementation tasks/contracts together before wiring this behavior into the app; unrelated architecture and design-system work can continue.

## Acceptance checklist

- [ ] Text, files, or both can be submitted through the current Brief interface.
- [ ] Analyze brief shows local progress and prevents duplicate active submissions.
- [ ] Results appear as campaign name → concise summary → details grid → AI chat.
- [ ] The name updates consistently in the header/sidebar, with subtle reduced-motion-safe feedback.
- [ ] Summary and details can be edited inline and persist as actual generation inputs.
- [ ] Chat refinement shows progress and updates the brief without losing newer direct edits.
- [ ] One successful initial analysis automatically prepares five copy options and visual prompts, with no extra generation click or copy-selection prerequisite.
- [ ] Both generators consume the same analyzed source; their loading, failure, and retry states remain independently identifiable.
- [ ] Reopening or refreshing the campaign does not duplicate its initial generation jobs.
- [ ] An automatic-generation test verifies that the image-generation endpoint/provider was called **zero times**.
- [ ] Images are generated only after an explicit user action for the reviewed prompt.
- [ ] A failed/uncertain branch preserves the brief and any successful sibling result, without unsafe automatic paid retries.
- [ ] Changes to the brief cannot silently overwrite downstream edits or regenerate images.
- [ ] Banners, Review, and Distribute retain their existing selection, version, authorization, and approval requirements.
