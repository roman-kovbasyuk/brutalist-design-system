# MVP launch roadmap

This roadmap is the step-by-step path from the current demo to a launchable MVP. Complete each phase in order. A phase is complete only when its exit check passes.

The checkboxes are personal. Click them as you work; your progress is saved in this browser and is not shared with the team.

## At a glance

```mermaid
flowchart LR
  A[1. Scope] --> B[2. Contracts]
  B --> C[3. Demo slice]
  C --> D[4. Review gate]
  D --> E[5. QA]
  E --> F[6. Pilot]
  F --> G[7. Launch decision]
  G --> H[8. Release]
```

## Phase 1 — Lock the scope

**Owner:** Whole team  
**Goal:** Agree on the one workflow the MVP must prove.

### Checklist

- [ ] **Owner: Whole team** — Choose one campaign type and one delivery format for the pilot.
- [ ] **Owner: Ira** — Write the happy path: brief → copy → image ideas → templates → review → approval → delivery.
- [ ] **Owner: Roman** — List what is explicitly out of scope: real provider jobs, billing, multi-team accounts, and non-essential integrations.
- [ ] **Owner: Whole team** — Record the decision in the team log.

**Exit check:** Everyone can describe the same workflow and the same V1 limits.

## Phase 2 — Agree on the contracts

**Owners:** Ira, Vlad, Roman  
**Goal:** Define what each step needs and returns before implementation changes.

### Checklist

- [ ] **Owner: Ira** — Document screen states: loading, empty, error, retry, blocked, and success.
- [ ] **Owner: Vlad** — Document template slots, safe areas, sizes, ratios, and content limits.
- [ ] **Owner: Roman** — Document campaign, copy, image, template, review, and delivery data formats.
- [ ] **Owner: Whole team** — Agree on status names and who may change each status.
- [ ] **Owner: Roman** — Add one example payload for the pilot campaign.

**Exit check:** A designer can review the examples, and an engineer can validate the data without guessing.

## Phase 3 — Build the repeatable demo slice

**Owner:** Roman  
**Goal:** Make the full happy path work with local sample data.

### Checklist

- [ ] **Owner: Roman** — Connect the screens to the agreed status flow.
- [ ] **Owner: Roman** — Add predictable demo actions for copy, image ideas, and banner compositions.
- [ ] **Owner: Roman** — Keep every result tied to a campaign and a version.
- [ ] **Owner: Ira** — Review clear progress, errors, retry actions, and blocked states.
- [ ] **Owner: Roman** — Add tests for the main status changes and the public documentation route.

**Exit check:** Repeating the same demo action produces the same result and status.

## Phase 4 — Add the human review gate

**Owners:** Vlad, Roman  
**Goal:** Make designer and marketer approval explicit.

### Checklist

- [ ] **Owner: Roman** — Create a locked review package from the current composition.
- [ ] **Owner: Roman** — Send the package to the Figma review flow.
- [ ] **Owner: Vlad** — Mark reviewed frames `Ready for Development`.
- [ ] **Owner: Roman** — Record the approved version; do not silently replace it after approval.
- [ ] **Owner: Roman** — Allow delivery only from that exact approved version.

**Exit check:** A changed composition creates a new version and requires another review.

## Phase 5 — Run product and quality checks

**Owners:** Ira, Roman  
**Goal:** Remove blockers before anyone outside the team sees the MVP.

### Checklist

- [ ] **Owner: Ira** — Check the main screens on desktop and mobile sizes.
- [ ] **Owner: Ira** — Check keyboard navigation, focus, labels, and readable error messages.
- [ ] **Owner: Roman** — Test empty, error, retry, blocked, and stale states.
- [ ] **Owner: Roman** — Test unsafe AI output handling and rejection messages.
- [ ] **Owner: Roman** — Test PNG / MP4 / ZIP export from an approved version.
- [ ] **Owner: Whole team** — Fix all launch-blocking issues and record known limitations.

**Exit check:** No launch-blocking issue remains in the happy path or its recovery states.

## Phase 6 — Run a pilot

**Owners:** Ira, Vlad  
**Helpers:** Roman, marketer  
**Goal:** Prove that the workflow works with realistic content.

### Checklist

- [ ] **Owner: Ira** — Select three to five representative campaigns.
- [ ] **Owner: Roman** — Run each campaign from brief to delivery without changing the data by hand.
- [ ] **Owner: Vlad** — Complete the Figma review; **Owner: Marketer** — approve the exact version.
- [ ] **Owner: Ira** — Record time spent, blocked steps, unclear labels, and missing information.
- [ ] **Owner: Whole team** — Turn repeated problems into tasks; do not hide them in the demo.

**Exit check:** The pilot dataset completes the happy path and the team has a written list of remaining limits.

## Phase 7 — Make the launch decision

**Owner:** Whole team  
**Goal:** Decide whether the MVP is safe to show or needs another cycle.

### Checklist

- [ ] **Owner: Whole team** — Review the pilot results and all open launch gates.
- [ ] **Owner: Roman** — Confirm that the demo does not claim unavailable integrations.
- [ ] **Owner: Ira** — Confirm that designer review cannot be bypassed; **Owner: Marketer** — confirm approval is required.
- [ ] **Owner: Whole team** — Choose one decision: `Go`, `Go with known limits`, or `No-go`.
- [ ] **Owner: Whole team** — Record the decision, owner, and next review date.

**Exit check:** The decision is written down and every open issue has an owner.

## Phase 8 — Release and observe

**Owner:** Roman  
**Helpers:** Whole team  
**Goal:** Publish one traceable build and watch the first uses.

### Checklist

- [ ] **Owner: Roman** — Run the production build and route checks.
- [ ] **Owner: Roman** — Deploy the tagged build to Cloud Run.
- [ ] **Owner: Ira** — Open the public app and documentation on desktop and mobile.
- [ ] **Owner: Whole team** — Run one final campaign through the public build.
- [ ] **Owner: Ira** — Share the known-limitations list with the pilot users.
- [ ] **Owner: Whole team** — Collect feedback in the decision log and schedule the next review.

**Exit check:** The public build works, the docs match the product, and the first pilot run is traceable.

## Launch checklist

- [ ] Scope and V1 limits are written down.
- [ ] Screen, template, and data contracts are agreed.
- [ ] Happy path works with repeatable sample data.
- [ ] Designer review and marketer approval are required.
- [ ] Recovery states and safety checks are tested.
- [ ] Responsive and accessibility checks are complete.
- [ ] Pilot campaigns finish without manual data replacement.
- [ ] Known limitations have owners.
- [ ] Go/no-go decision is recorded.
- [ ] Public build and documentation are verified.
