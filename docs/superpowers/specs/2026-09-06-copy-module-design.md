# Copy module: two states and one card layout

Status: draft v2 for review, recording Roman's Copy requirements of 6 September 2026 and the subsequent Visuals handoff clarification. Documentation only; these behaviors are not claimed as implemented. Copy's two-state UI requirements are unchanged by this handoff update.

Related specifications: [Brief and automatic copy drafts](2026-09-06-brief-module-design.md), [Visuals generation methods](2026-09-06-visuals-module-design.md), [six-module architecture](../plans/2026-09-06-campaign-module-architecture.md), and [structural implementation plan](../plans/2026-09-06-six-module-campaign-implementation.md).

This specification replaces the earlier five-state Copy interpretation and the table/cards/banners view-switching requirement. Copy has **exactly two primary presentation states**. Loading, errors, approval, deletion, preview, and appending are local feedback or interactions within these states, not additional primary states.

## 1. Default / empty state

- Match the reusable empty-state pattern used by the other campaign modules, except Brief.
- Show a small, centered illustration or icon.
- Show the guidance: **Add a brief to generate banner copy.**
- Do not require the user to click a generation button to obtain the first options.
- When the analyzed brief arrives, automatically request the initial five options. While no options exist, show generation progress in this same module area; do not retain misleading guidance that a brief is still missing.
- If initial generation fails, retain the analyzed source and show local failure/retry feedback. Do not reset Brief or another module.

## 2. Generated state

- After successful initial generation, display **five copy options as cards**.
- Use one simple card layout. Remove the existing Table, Cards, and Banners view tabs and the table presentation.
- Each card displays its headline, short text, CTA, and optional tag, following the previously specified copy structure.
- Keep the existing options visible while additional options are generated or an action is pending.
- Returning to the campaign or refreshing the page restores its saved cards and approval states; it does not start another initial generation.

### Card interactions

**Approve** and **Delete** appear on card hover.

- **Approve:** visually highlight that card as approved, with a subtle animation. Approval belongs to that option; appending options must preserve it. Copy approval is not final campaign/version approval in the Review module.
- **Delete:** hide the card from the list, with a subtle removal animation. Preserve the remaining cards, their order, and their approval states. Hidden options must remain hidden after refresh; this is not just a temporary CSS effect or authorization to erase generation/audit history.
- Make hover actions available on keyboard focus and provide discoverable controls on touch devices, where hover does not exist.
- Respect reduced-motion preferences and use application design-system interaction patterns. Approval/removal feedback must remain understandable without animation.

The earlier assistant assumption that only one card can be approved is not part of this specification. Keep approval state per card; do not silently remove another card's approval. How approved options are selected for banner composition belongs to the Banners handoff specification, not to a new implicit rule in Copy.

### Per-card preview

- Keep a small **Preview** icon on each card, separate from the hover-only Approve/Delete actions.
- Activating it shows that card's copy rendered on a banner; it does not switch the whole module to a different layout.
- Use the relevant existing template and available visual or a clearly identified placeholder. Opening a preview does not approve the option or change the selected campaign image.
- Preview must never trigger AI image generation. It is a rendering of existing content, not a paid media-generation action.
- Use an accessible, named control and the application design system's preview/display pattern; promote a missing reusable pattern into the design system before adding product-specific markup.

### Generate more options

- Place **Generate More Options** below the cards.
- Append the new cards beneath the existing cards. Do not replace the current list, reorder earlier options, or clear approvals.
- Prevent duplicate activation while the same request is pending. A failed request leaves all existing cards and approvals intact and offers a local retry.
- Allow up to **30 options**. Disable further generation when the limit is reached and make the limit understandable beside the control.
- Capacity interpretation for review: 30 means non-hidden cards in the current list, not a lifetime AI-request allowance. Hiding a card frees a list slot. Existing server-side generation/budget limits still apply independently.
- Batch-size interpretation for review: request five additional options, or the remaining capacity when fewer than five slots are available. Never exceed 30 merely because a request started before another append completed.

## Input, output, and ownership

**Input:** the saved, successfully analyzed Brief, including its summary, structured campaign details, and source identity. Copy must not require the user to repeat this information or explicitly request the initial set.

**Output:** generated copy options with stable IDs and source identity, per-option approval/hidden state, and the list's current generation feedback. These are module-owned results, not local page-level arrays that disappear on refresh.

**Automatic handoff:** successful Brief analysis schedules the first Copy options. The analyzed brief and generated copy make Visuals ready to offer its two generation methods; prompt/image generation starts when the user chooses a method, not automatically from Brief. Campaign-wide visuals use all current generated copy without requiring approval; copy-linked visuals use the selected/approved option set. Copy does not generate visual prompts or images.

**Manual operations:** approval, deletion, preview, and Generate More Options are user-triggered. Initial automatic generation must be tied to a durable job/result identity so mount effects, reloads, and duplicate analysis-completion notifications cannot produce extra initial batches.

The module owns its UI, commands, and local action feedback. The shared coordinator delivers analyzed input; the page owns layout/navigation. A Copy command or preview failure must not replace or reset the other campaign modules.

## Preservation and safeguards

- Save approval and hidden-state changes against stable option IDs, not array positions. Appending or hiding options must not move an action onto another card.
- Enforce append capacity and idempotency on the server as well as disabling the UI control. Replaying the same successful generation must not append the same cards twice.
- Preserve option provenance and prior generation history. Do not flatten existing batches by rewriting their immutable generation records merely to display one list.
- Keep pending/unknown-job, budget, authorization, revision, and stale-source protections. Automatic initial text generation is not unlimited generation.
- A changed Brief must not silently overwrite existing cards or approvals. Surface stale-source information; automatic replacement/regeneration after a later Brief refinement is outside this first-options specification.
- If hiding a card affects an existing downstream selection, use an explicit invalidation/handoff rule. Never silently choose a different copy option for a banner or alter an approved version snapshot.

## Implementation handoff

This is a new functional specification, not just a visual variation of the structural migration plan. The integration owner needs to reconcile these boundaries together:

1. Replace the old view-mode state and selector with a single card presentation. Keep banner preview as a per-card action, not a module-wide tab.
2. Separate per-option approval from any existing single-candidate selection used by banner composition. Do not assume a single selected-copy ID stores all approval states.
3. Preserve all earlier options and approvals when generating an additional batch. Initial generation, additional generation, and retry must have distinct, safe command identities.
4. Persist hidden cards and enforce the 30-card capacity under concurrent requests. This limit does not replace existing cost controls.
5. Accept the analyzed Brief as initial-generation input. Publish generated options and per-option approval/selection state to Visuals; do not trigger Visuals generation. Follow the later Visuals specification for selected-copy versus campaign-wide requests.
6. Use shared design-system cards, empty states, icon controls, preview presentation, and motion conventions. If a reusable element is missing, add it to the design system first.

This requirements task edits documentation only. Do not change shared application contracts, backend behavior, or another task's implementation plan from this specification-capture step.

## Acceptance checklist

- [ ] Copy exposes only Default/empty and Generated as primary presentation states.
- [ ] Empty Copy shows a small centered icon/illustration and the exact guidance text.
- [ ] Successful Brief analysis automatically prepares the first five options without another user action.
- [ ] Options appear as cards; no table or Table/Cards/Banners selector remains.
- [ ] Approve highlights its card; Delete hides its card; both have subtle, reduced-motion-safe feedback.
- [ ] Hover actions are also accessible with keyboard and touch input.
- [ ] Every card has a small Preview control that renders its copy on a banner without changing the main card layout.
- [ ] Preview calls no image-generation operation and does not approve or select content as a side effect.
- [ ] Generate More Options appears below the cards and appends new results beneath the existing ones.
- [ ] Earlier cards, their order, and approval states survive additional generation, failures, and refreshes.
- [ ] No append or replay causes the list to exceed 30 non-hidden cards; the control is disabled at capacity.
- [ ] Duplicate initial-generation notifications or retries do not create duplicate batches.
- [ ] Copy does not wait for or trigger image generation. Visuals requires generated copy; campaign-wide generation does not require approved/selected copy, while linked generation uses that selected set.
- [ ] Downstream selection conflicts and stale Brief revisions cannot silently change reviewed or approved assets.
