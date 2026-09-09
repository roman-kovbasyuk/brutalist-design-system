# Copy Hover Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the circular token copy icon with a pointer-following `Copy` label and `Copied` check confirmation.

**Architecture:** Keep clipboard and accessibility behavior in `TokenCopyTarget`. Track pointer position relative to its button, render a non-interactive label inside the target, and style it without physics or reveal animation.

**Tech Stack:** React, CSS, Vitest, Testing Library, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-09-copy-hover-label-design.md`

## Global Constraints

- Copyable samples remain accessible buttons and preserve keyboard activation.
- The hover label follows pointer coordinates directly and uses `pointer-events: none`.
- Remove the circular icon and its scale/reveal animation.
- Preserve clipboard fallback, copied timeout, and assistive status messaging.

---

### Task 1: Add interaction coverage

**Files:**
- Modify: `src/screens/DesignSystemScreen.test.jsx`

**Interfaces:**
- Consumes: `TokenCopyTarget` rendered by the Basics screen.
- Produces: Regression coverage for pointer label, copied confirmation, and removed icon.

- [ ] **Step 1: Write the failing tests**

Add a test that fires `pointerMove` on the Body typography token copy button and expects a visible `Copy` label with pointer-relative `left` and `top` styles. Extend the existing copy test to assert `Copied` and a check icon, and assert `.v2-token-copy-target__icon` is absent.

- [ ] **Step 2: Run the focused tests**

Run: `npm run test:run -- src/screens/DesignSystemScreen.test.jsx`
Expected: FAIL because the component still renders the circular icon and has no pointer label.

### Task 2: Implement the shared pointer label

**Files:**
- Modify: `src/components/design-system/atoms/TokenCopyTarget.jsx`
- Modify: `src/components/design-system/atoms/token-copy-target.css`

**Interfaces:**
- Consumes: Existing `copyText`, state machine, and `AppButton` contract.
- Produces: A copy target that exposes a pointer-following `.v2-token-copy-target__feedback` label and check icon only after successful copy.

- [ ] **Step 1: Track pointer coordinates**

Use state for `{ x, y, active }`; on `pointermove`, calculate coordinates from `currentTarget.getBoundingClientRect()`, and on `pointerleave` clear `active`. Keep the label non-interactive.

- [ ] **Step 2: Render the new feedback**

Render `Copy` while pointer-hovered and idle, `Copied` plus `<Check />` after success, and the existing error message on failure. Remove the idle `<Copy />` icon and all icon reveal markup.

- [ ] **Step 3: Style direct positioning**

Make the feedback label a compact black-and-white badge positioned with `left` and `top` custom properties, `transform: translate(8px, -50%)`, and `pointer-events: none`. Remove circle, opacity, scale, and transition rules. Keep status text available to assistive technology.

- [ ] **Step 4: Run focused tests**

Run: `npm run test:run -- src/screens/DesignSystemScreen.test.jsx`
Expected: PASS.

### Task 3: Verify production output

**Files:**
- No source changes expected.

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: Vite completes successfully.

- [ ] **Step 2: Confirm the local page**

Open `http://127.0.0.1:5800/design-system?section=basics`, hover a copyable token, click it, and confirm the label changes from `Copy` to `Copied` with a check icon.

- [ ] **Step 3: Commit implementation**

Run: `git add src/components/design-system/atoms/TokenCopyTarget.jsx src/components/design-system/atoms/token-copy-target.css src/screens/DesignSystemScreen.test.jsx && git commit -m "feat: add pointer copy feedback label"`
