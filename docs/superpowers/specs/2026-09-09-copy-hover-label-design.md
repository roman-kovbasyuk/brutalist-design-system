# Copy Hover Label

## Goal

Make copyable design-system samples communicate their copy action next to the pointer instead of using the existing circular icon control.

## Interaction

- Copyable samples remain a single accessible button and preserve keyboard activation.
- On pointer hover and movement inside the clickable sample, show a compact black label with white `Copy` text positioned just to the right of the pointer.
- The label follows pointer coordinates directly inside the clickable area; it has no spring, inertia, or physics animation and does not intercept pointer events.
- After a successful click, change the label to `Copied` and show a small check icon beside the text. Keep the confirmation visible briefly, then return to the idle hover label.
- Preserve the existing error status for clipboard failures and make it available to assistive technology.
- Remove the circular copy icon and its reveal/scale animation from all token copy targets, including inline targets.

## Architecture

Implement the behavior in the shared `TokenCopyTarget` component and its stylesheet. Track pointer coordinates relative to the button while hovered, reset hover state on leave, and render the label within the target. Keep the existing clipboard fallback and status semantics.

## Verification

Add component tests for pointer label visibility/position, successful `Copied` feedback with a check icon, and removal of the old icon markup. Run the focused design-system tests and the production build.
