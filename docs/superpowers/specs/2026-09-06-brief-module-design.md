# Brief module: analysis, refinement, and automatic copy drafts

Status: draft v2 for review. Captures Roman's Brief-state instructions and incorporates the later Visuals method-choice and immediate-generation clarification of 6 September 2026. This document does not claim application implementation.

Related documents: [six-module architecture](../plans/2026-09-06-campaign-module-architecture.md) and [structural implementation plan](../plans/2026-09-06-six-module-campaign-implementation.md).

The later [Visuals specification](2026-09-06-visuals-module-design.md) replaces this document's original automatic-visual-prompt handoff and mandatory prompt-review gate. The Brief interface/state requirements remain unchanged.

## Core decision

After successful brief analysis, the application automatically prepares the first five copy options. The user does not need to click another generation button to obtain those initial copy results.

Brief publishes the analyzed campaign information. Copy creates copy options. Once analyzed Brief and generated Copy are available, Visuals offers its two generation methods. Brief does not own either downstream generator.

Image generation is explicitly user-initiated. Choosing a Visuals method creates its prompts and initiates its static images immediately, with no mandatory prompt-review step or second confirmation. No image generation is included in automatic brief analysis or initial Copy generation.

The visible workflow remains Brief → Copy → Visuals → Banners → Review → Distribute. Copy consumes the analyzed brief; Visuals consumes both the analyzed brief and generated copy. Campaign-wide visuals do not require copy selection; copy-linked visuals use the selected copy set.

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
- On initial analysis failure, keep the input available and show a local error/retry action. Do not start downstream generation without successful analysis.

### 3. Results

Display the following in this order:

1. **Campaign name.** AI creates the initial name. Update the campaign header and the corresponding sidebar caption together with a subtle micro-animation. Preserve the existing click-to-rename interaction; no separate title field or success confirmation is needed. Respect reduced-motion preferences.
2. **Concise summary.** A short, readable explanation of the campaign.
3. **Campaign details grid.** Boxed details for audience, objective, channels, and formats. Do not fabricate facts absent from the input; make missing information apparent and editable.
4. **AI chat box.** A place to add context or request refinements to the analyzed brief.

Keep the user at the Brief result so they can inspect/refine it. Copy exposes its own automatic generation progress/results. Once Copy is available, Visuals exposes its method choice. Completing background work must not force a navigation jump.

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
| Brief + Copy | Visuals | Analyzed campaign context, generated copy, and selected copy IDs when applicable | Show the two generation methods; wait for the user to choose one |
| Visuals | Image generation inside Visuals | Prompts prepared for the user-selected method and its requested copy/campaign scope | None from Brief: the user's method click initiates prompt and image generation together |

Copy owns its generation instructions and output. Visuals owns its prompt-generation instructions and prompt output. Neither view reaches into Brief's local state or calls its sibling's internals.

Initial Copy generation is scheduled once from successful analysis. Visuals generation is scheduled only after the user's method choice. The coordinator can serialize requests when the existing generation lock, provider limits, or budget controls require it; immediate image initiation does not bypass those protections.

Campaign-wide visual generation uses the brief and all current generated copy without requiring a selected option. Copy-linked generation requires selected copy. If initial Copy generation fails, Visuals does not yet have its required input. Preserve existing assets through later failures; an unresolved job can still block unsafe new dispatch.

Banners still requires appropriate copy and visual selections, including eligible uploaded visuals. Automatically preparing copy or explicitly generating a visual batch does not automatically approve or distribute them.

## Image-generation boundary

- A Visuals method click explicitly authorizes prompt creation and its static-image batch. Prompts are displayed as part of the result cards, not a mandatory pre-generation review gate.
- **Generate All Static Visuals** is a separate user action for eligible existing prompt cards missing static images; it is not another required step after choosing an initial method.
- Analysis, chat refinement, initial copy generation, copy selection, navigation, page reload, and background completion without an originating visual-generation request must never independently start image generation.
- Every new image or regeneration requires an explicit user request, which can authorize a defined batch. Prevent repeated activation while that request is running.
- If an image request times out with an uncertain result, reconcile that request before allowing a fresh paid generation. Do not silently retry it as a new job.
- Existing authorization, budget checks, idempotency, and backend generation safeguards continue to apply to text and image operations alike. Automatic text generation is not described as free or unlimited.

## Draft preservation and scope

The automatic behavior specified here is preparation of the **first copy options**. Later replacement/regeneration behavior is governed by the Copy and Visuals specifications. This document does not authorize silently replacing user-edited text, selected options, prompts, or existing images after a brief refinement.

Preserve the architecture's stale-data protection: downstream results retain their source identity; changing that source makes outdated results apparent and prevents them from being treated as current. No automatic image regeneration follows a brief or prompt change.

Visual generation counts, method controls, prompt copying, image uploads, and bulk actions belong to the Visuals specification. No video generation, new brand editor, or distribution integration is added by this Brief specification.

All controls, layouts, progress feedback, and inline-edit patterns must use the application design system. Promote a missing reusable pattern into that system before adding a product-specific implementation. Banner brand styles are not the application design system.

## Implementation handoff: changes from the structural baseline

The structural plan preserved old functionality while separating modules. This is a new functional specification, with these explicit integration changes:

1. **Coordinator:** successful analysis schedules first Copy outputs and keeps Brief results accessible in place. It must not automatically choose a Visuals method or start its prompts/images.
2. **Visuals input contract:** pass the analyzed brief and generated copy. Support selected-copy and campaign-wide methods explicitly; a legacy single-copy directions request cannot represent all requested behavior. Coordinate contracts/services with the Visuals specification.
3. **Availability:** Visuals method choice becomes available after successful brief analysis and copy generation. Campaign-wide generation is available without selected copy; linked generation is disabled when none is selected. Later Banners prerequisites stay intact.
4. **Brief result model:** editable summary, audience, objective, channels, and formats must be persisted and become the information consumed by both downstream modules. They must not be cosmetic UI values disconnected from generation inputs.
5. **Initial generation identity:** record the analyzed source and Copy job/result so refreshes, remounts, and duplicate completion notifications do not generate another first set. Visuals separately tracks each user-triggered batch/item; do not repeat successful results or re-create the campaign on retry.
6. **Provider and server guards:** preserve review permissions and budget/unknown-job protections while changing direction-generation prerequisites. Do not release image generation from any existing server safety gate.

This requirements task changes documentation only. The integration owner should update the relevant implementation tasks/contracts together before wiring this behavior into the app; unrelated architecture and design-system work can continue.

## Acceptance checklist

- [ ] Text, files, or both can be submitted through the current Brief interface.
- [ ] Analyze brief shows local progress and prevents duplicate active submissions.
- [ ] Results appear as campaign name → concise summary → details grid → AI chat.
- [ ] The name updates consistently in the header/sidebar, with subtle reduced-motion-safe feedback.
- [ ] Summary and details can be edited inline and persist as actual generation inputs.
- [ ] Chat refinement shows progress and updates the brief without losing newer direct edits.
- [ ] One successful initial analysis automatically prepares five copy options without another user action.
- [ ] Visuals receives the analyzed brief and generated copy, then waits for the user's choice of generation method.
- [ ] Reopening or refreshing the campaign does not duplicate its initial generation jobs.
- [ ] An automatic-generation test verifies that the image-generation endpoint/provider was called **zero times**.
- [ ] An explicit Visuals method click initiates its prompts and image batch without a mandatory second review/confirmation step.
- [ ] Failed/uncertain generation preserves the brief and existing successful results, without unsafe automatic paid retries.
- [ ] Changes to the brief cannot silently overwrite downstream edits or regenerate images.
- [ ] Banners, Review, and Distribute retain their existing selection, version, authorization, and approval requirements.
