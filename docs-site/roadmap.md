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

- [ ] Choose one campaign type and one delivery format for the pilot. <span class="owner-tag">Whole team</span>
- [ ] Write the happy path: brief → copy → image ideas → templates → review → approval → delivery. <span class="owner-tag">Ira</span>
- [ ] List what is explicitly out of scope: real provider jobs, billing, multi-team accounts, and non-essential integrations. <span class="owner-tag">Roman</span>
- [ ] Record the decision in the team log. <span class="owner-tag">Whole team</span>

**Exit check:** Everyone can describe the same workflow and the same V1 limits.

## Phase 2 — Agree on the contracts

**Owners:** Ira, Vlad, Roman  
**Goal:** Define what each step needs and returns before implementation changes.

### Checklist

- [ ] Document screen states: loading, empty, error, retry, blocked, and success. <span class="owner-tag">Ira</span>
- [ ] Document template slots, safe areas, sizes, ratios, and content limits. <span class="owner-tag">Vlad</span>
- [ ] Document campaign, copy, image, template, review, and delivery data formats. <span class="owner-tag">Roman</span>
- [ ] Agree on status names and who may change each status. <span class="owner-tag">Whole team</span>
- [ ] Add one example payload for the pilot campaign. <span class="owner-tag">Roman</span>

**Exit check:** A designer can review the examples, and an engineer can validate the data without guessing.

## Phase 3 — Build the repeatable demo slice

**Owner:** Roman  
**Goal:** Make the full happy path work with local sample data.

### Checklist

- [ ] Connect the screens to the agreed status flow. <span class="owner-tag">Roman</span>
- [ ] Add predictable demo actions for copy, image ideas, and banner compositions. <span class="owner-tag">Roman</span>
- [ ] Keep every result tied to a campaign and a version. <span class="owner-tag">Roman</span>
- [ ] Review clear progress, errors, retry actions, and blocked states. <span class="owner-tag">Ira</span>
- [ ] Add tests for the main status changes and the public documentation route. <span class="owner-tag">Roman</span>

**Exit check:** Repeating the same demo action produces the same result and status.

## Phase 4 — Add the human review gate

**Owners:** Vlad, Roman  
**Goal:** Make designer and marketer approval explicit.

### Checklist

- [ ] Create a locked review package from the current composition. <span class="owner-tag">Roman</span>
- [ ] Send the package to the Figma review flow. <span class="owner-tag">Roman</span>
- [ ] Mark reviewed frames `Ready for Development`. <span class="owner-tag">Vlad</span>
- [ ] Record the approved version; do not silently replace it after approval. <span class="owner-tag">Roman</span>
- [ ] Allow delivery only from that exact approved version. <span class="owner-tag">Roman</span>

**Exit check:** A changed composition creates a new version and requires another review.

## Phase 5 — Run product and quality checks

**Owners:** Ira, Roman  
**Goal:** Remove blockers before anyone outside the team sees the MVP.

### Checklist

- [ ] Check the main screens on desktop and mobile sizes. <span class="owner-tag">Ira</span>
- [ ] Check keyboard navigation, focus, labels, and readable error messages. <span class="owner-tag">Ira</span>
- [ ] Test empty, error, retry, blocked, and stale states. <span class="owner-tag">Roman</span>
- [ ] Test unsafe AI output handling and rejection messages. <span class="owner-tag">Roman</span>
- [ ] Test PNG / MP4 / ZIP export from an approved version. <span class="owner-tag">Roman</span>
- [ ] Fix all launch-blocking issues and record known limitations. <span class="owner-tag">Whole team</span>

**Exit check:** No launch-blocking issue remains in the happy path or its recovery states.

## Phase 6 — Run a pilot

**Owners:** Ira, Vlad  
**Helpers:** Roman, marketer  
**Goal:** Prove that the workflow works with realistic content.

### Checklist

- [ ] Select three to five representative campaigns. <span class="owner-tag">Ira</span>
- [ ] Run each campaign from brief to delivery without changing the data by hand. <span class="owner-tag">Roman</span>
- [ ] Complete the Figma review and approve the exact version. <span class="owner-tag">Vlad + Marketer</span>
- [ ] Record time spent, blocked steps, unclear labels, and missing information. <span class="owner-tag">Ira</span>
- [ ] Turn repeated problems into tasks; do not hide them in the demo. <span class="owner-tag">Whole team</span>

**Exit check:** The pilot dataset completes the happy path and the team has a written list of remaining limits.

## Phase 7 — Make the launch decision

**Owner:** Whole team  
**Goal:** Decide whether the MVP is safe to show or needs another cycle.

### Checklist

- [ ] Review the pilot results and all open launch gates. <span class="owner-tag">Whole team</span>
- [ ] Confirm that the demo does not claim unavailable integrations. <span class="owner-tag">Roman</span>
- [ ] Confirm that designer review cannot be bypassed and approval is required. <span class="owner-tag">Ira + Marketer</span>
- [ ] Choose one decision: `Go`, `Go with known limits`, or `No-go`. <span class="owner-tag">Whole team</span>
- [ ] Record the decision, owner, and next review date. <span class="owner-tag">Whole team</span>

**Exit check:** The decision is written down and every open issue has an owner.

## Phase 8 — Release and observe

**Owner:** Roman  
**Helpers:** Whole team  
**Goal:** Publish one traceable build and watch the first uses.

### Checklist

- [ ] Run the production build and route checks. <span class="owner-tag">Roman</span>
- [ ] Deploy the tagged build to Cloud Run. <span class="owner-tag">Roman</span>
- [ ] Open the public app and documentation on desktop and mobile. <span class="owner-tag">Ira</span>
- [ ] Run one final campaign through the public build. <span class="owner-tag">Whole team</span>
- [ ] Share the known-limitations list with the pilot users. <span class="owner-tag">Ira</span>
- [ ] Collect feedback in the decision log and schedule the next review. <span class="owner-tag">Whole team</span>

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
