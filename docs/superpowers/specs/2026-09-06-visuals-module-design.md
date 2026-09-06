# Visuals module: two generation methods and linked assets

Status: implemented 6 September 2026, following Roman's Visuals states and immediate-generation clarification. See the [implementation and verification record](../plans/2026-09-06-visuals-implementation.md).

Related specifications: [Brief](2026-09-06-brief-module-design.md), [Copy](2026-09-06-copy-module-design.md), and [six-module architecture](../plans/2026-09-06-campaign-module-architecture.md).

## Latest decision and precedence

The user chooses a generation method, and that click initiates prompt creation and static-image generation immediately. There is **no mandatory prompt-review step or second confirmation** between that method choice and image generation.

This replaces the earlier proposal to generate first visual prompts automatically from Brief and wait for prompt review before images. Brief analysis still starts Copy automatically. Visuals waits for the analyzed brief and generated copy, then offers its two user-triggered methods.

Image generation remains explicitly initiated by the user: clicking a method button authorizes that image batch. Analysis, Copy completion, navigation, refresh, or opening a preview must never independently start image generation.

## 1. Empty state — waiting for input

- Show this state before brief analysis and copy generation have produced the required input.
- Use the shared module empty-state pattern: a small centered illustration or icon.
- Display the exact message: **Complete your brief and generate copy to create visuals.**
- Receive the saved analyzed brief and current generated copy from their module contracts. Do not require the user to re-enter either.

## 2. Ready state — choose a generation method

Once generated copy is available, replace the empty state with these two option cards:

| Option | Description | Primary button |
| --- | --- | --- |
| Visuals for selected copy | Generate one tailored visual for each selected copy option. Each visual is linked to its corresponding copy. | Generate visuals for selected copy |
| Campaign-wide visuals | Generate three visual options based on the brief and all generated copy. Each visual should work with every copy option. | Generate 3 campaign visuals |

- Show the current number of selected copy options.
- Disable **Generate visuals for selected copy** when that count is zero, with guidance to select copy.
- **Generate 3 campaign visuals** is available without any selected copy, provided the analyzed brief and generated copy are available.
- Use the Copy module's per-option approval/selection output as the selected-copy input. Do not silently use the legacy single selected-candidate field or add another mandatory selection step in Visuals. If the Copy UI calls this state Approved, make its relationship to the selected count clear.
- The method click creates the associated prompt ideas and immediately requests the images, subject to existing authorization, budget, and generation-job safeguards. There is no additional Generate image click required for this initial batch.

## 3. Generating state

- Show a spinner and a short progress message for the requested operation.
- Show the number of visuals requested: the selected-copy count for the linked method, or three for the campaign-wide method.
- Distinguish preparing prompts from generating images when those real operation states are available. Do not present fabricated percentages or provider progress.
- Materialize each result card as its prompt becomes available; its image column can independently show loading.
- Prevent duplicate requests for the same active batch. Respect the existing campaign generation lock; immediate initiation does not mean bypassing safe queuing or starting all provider requests simultaneously.
- Keep existing assets and successful cards visible and usable while new items are generated.

## 4. Results — visuals linked to copy

- Display one card for each copy option selected when the request was submitted.
- Clearly identify the linked copy on the card using its option label and recognizable copy text.
- Use stable copy IDs, not list indexes. A later change to selection or ordering must not attach a finished image to another copy option.
- Each desktop card has three columns in this order:

| Left | Middle | Right |
| --- | --- | --- |
| Generated visual idea / prompt | Generated static visual | Video area |

- The video area remains a placeholder until a video is available. This specification does not add automatic video generation.
- At narrow sizes, stack the same areas in the same order using the application's responsive layout patterns. Do not create horizontal page overflow to retain three columns.

## 5. Results — campaign-wide visuals

- Each campaign-wide generation request creates **three cards** with the same Prompt → Static visual → Video layout.
- Clearly label them **Campaign-wide**.
- Each campaign-wide image can be used with any copy option from the relevant campaign source; do not force a single-copy association onto these assets.
- Keep both method cards/actions accessible after results exist, so the user can add more assets.
- If both methods have been used, clearly distinguish campaign-wide cards from copy-linked cards. Do not overwrite one group's results when another method runs.
- Later requests add their results; three is the campaign-wide batch size, not an instruction to discard earlier assets to keep only three total cards.

## 6. Partial completion or failure

- Preserve every successfully generated visual if another item in the batch fails.
- Show loading/error feedback in the affected card; prompt-generation failure is distinct from static-image failure.
- Provide a retry action for the failed item. Retry only that item rather than re-running successful siblings.
- A transport timeout or unknown provider result must be reconciled before a new paid request is made. Do not label an uncertain job as a confirmed failure and charge again automatically.
- Keep the correct brief/copy source and copy association through retry and late completion. Do not silently publish a result against a newer source or different selection.

## Bulk generation control

- The two method buttons are the initial generation actions and include static-image generation.
- Show **Generate All Static Visuals** in the upper-right action area when cards have prompts but are missing static visuals.
- The bulk action targets eligible prompt cards without a static visual. It does not replace images already generated or uploaded, and it does not generate videos.
- Make the eligible count visible. Disable duplicate activation while those jobs run; do not resubmit cards with pending or unknown jobs.
- Bulk generation is an explicit user action for completing prompt-only cards, not another mandatory step after the initial method buttons.

## Small secondary links: upload and copy prompt

Use quiet, small, application-design-system controls beneath the relevant content rather than additional primary buttons.

### Upload visuals

- Offer a small **Upload visuals** action beneath the ready-state generation choices so the user can supply existing images without first paying for AI generation.
- Offer **Upload visual** beneath each static-image area, including empty and failed areas. This supplies an image for that specific card without regenerating its prompt or other assets.
- Uploading into a copy-linked card retains its copy association; uploading into a campaign-wide card retains its campaign-wide scope.
- For uploads started from the ready-state choices, inherit the chosen context: uploads under the selected-copy option require an explicit target copy; uploads under campaign-wide visuals are reusable across copy. Never guess copy mappings from file order.
- Validate image files through the server's asset policy and show progress/errors locally. Keep an existing image visible until its replacement upload succeeds; a failed upload must not remove it.
- Store a real asset reference and upload provenance so it survives refresh and can be used in Banners. Uploading must not invoke the AI image provider or count as an AI-generated image.
- Video upload/generation behavior is separate from this static-visual requirement; keep the right-hand placeholder unless an existing video is available.

### Copy prompts

- Place a small **Copy prompt** action beneath the prompt text in the left column of every card with a prompt.
- Copy the exact displayed prompt to the clipboard without altering it, selecting a copy option, or invoking generation.
- Give brief local success feedback; show a local error if clipboard access fails rather than falsely reporting success.
- A purely uploaded card may have no AI prompt. Do not fabricate one or run AI just to enable Copy prompt; show that no generated prompt is available and omit/disable the action appropriately.

The upload placement and ready-state upload entry are the proposed composition of the user's small-link request. They ensure uploading is a usable alternative to paid generation, not available only after generation has already occurred.

## Input, output, and module ownership

**Input:** saved analyzed brief, current generated/non-hidden copy options with stable IDs and source identity, the selected/approved copy set, and existing Visuals results. The campaign-wide method uses all current generated copy, not just selected copy; stale copy is not silently treated as current.

**Output:** visual cards with stable IDs, a generation batch identity, scope (`copy-linked` or `campaign-wide`), linked copy ID when applicable, analyzed source identity, prompt text when present, static asset reference/provenance, optional existing video reference, and per-item operation state.

Visuals owns method choice, prompts, generation/upload commands, card results, and local feedback. Brief and Copy provide data through explicit contracts. The page only composes the module and navigation.

When copy is hidden, deselected, or changed after generation, keep the asset's historical association; do not reassign it or delete it automatically. Surface source changes and let the relevant downstream rules decide eligibility. Approved version snapshots remain immutable.

The integration must support multiple selected copy options and campaign-wide assets. An implementation based only on the existing single `selectedCopyId`/`selectedDirectionId` cannot represent the complete behavior by itself.

## Implementation handoff

Implemented within the Visuals module and coordinated shared backend contracts. Adjacent page/module ownership remains unchanged.

1. Change the initial handoff to analyzed Brief → automatic Copy → Visuals ready state. Visuals reads both Brief and Copy, but campaign-wide generation does not require a copy approval.
2. Introduce distinct linked-copy and campaign-wide generation intents and persist their batch/card associations. Snapshot the requested copy set at activation.
3. Orchestrate prompt creation followed by static-image generation from the same user-triggered method action. Keep per-item success/failure and idempotency instead of treating the whole batch as a single replaceable image.
4. Add static-image uploads through authenticated, validated asset storage and return durable references usable by Banners. Keep uploads separate from paid provider jobs.
5. Expose prompt-only completion as Generate All Static Visuals, and preserve manual single-item retry. Neither auto-runs after refresh.
6. Use application design-system option cards, empty states, progress feedback, small action controls, and the responsive three-column layout. Add missing reusable patterns to the design system first.
7. Preserve budget, authorization, stale-input, revision, and unknown-job safeguards. Do not let the new batch orchestration bypass existing review/version protections.

## Acceptance checklist

- [x] Before analyzed brief/copy input exists, Visuals shows the centered empty-state icon and exact guidance message.
- [x] Ready Visuals offers the two named methods and shows the selected-copy count.
- [x] The linked-copy method is disabled at zero selected options; campaign-wide generation remains available with generated copy.
- [x] Clicking either method prepares prompts and initiates its images without a second review/confirmation click.
- [x] Linked generation creates one visual per selected copy; campaign-wide generation creates three per request.
- [x] Cards clearly identify their scope and linked copy, and use Prompt → Static visual → Video ordering.
- [x] Video areas remain placeholders until a video exists; no video generation starts automatically.
- [x] Existing and successful assets survive later batches, partial failures, and retries.
- [x] Generate All Static Visuals only fills eligible missing static images and never replaces existing ones or duplicates active jobs.
- [x] Small Upload visuals/Upload visual controls provide an alternative to AI generation; successful uploads persist with the correct scope.
- [x] Copy prompt copies exactly the displayed prompt and reports clipboard failures locally.
- [x] Uploading and copying prompts trigger no AI-image request.
- [x] Analyzing Brief, automatic Copy completion, opening the page, and refreshing trigger zero image-generation calls until the user chooses a generation action.
- [x] Per-item retries preserve successful siblings and reconcile uncertain provider outcomes before any fresh paid request.
- [x] The module uses shared application design-system controls and remains usable on narrow screens, keyboard, and touch.
