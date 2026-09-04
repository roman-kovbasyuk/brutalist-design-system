# Banner Studio Frontend-First MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, reviewable MVP workflow frontend against a persistent mock gateway before connecting the real API, PostgreSQL, authentication, or Gemini.

**Architecture:** A new `/mvp` frontend is isolated under `src/mvp/`. Screens consume a `CampaignGateway` interface and pure workflow rules rather than importing fixtures or browser storage directly. The first implementation is a local persistent gateway; the later HTTP gateway will implement the same interface, allowing backend integration without rewriting the workflow UI.

**Tech Stack:** React 19, Vite 8, Vitest, Testing Library, Zod, existing design tokens, incremental shadcn/ui-compatible primitives.

**Spec:** `docs/superpowers/specs/2026-09-04-banner-studio-lean-mvp-design.md`

## Global Constraints

- Keep the existing demo routes operational while `/mvp` is under review.
- Do not modify the current uncommitted navigation and template-screen changes except where the user explicitly requests it.
- All workflow transitions go through pure rules; React components never set a campaign status directly.
- The mock gateway persists to `localStorage`, but its public interface is asynchronous to match the future HTTP gateway.
- Every mutation receives an idempotency key.
- PNG is the only delivery format represented in the MVP frontend.
- Figma is a manual review handoff; the frontend stores a URL and does not call the Figma API.
- Use test-first development for every behavior change.

---

## Review boundaries

| Review | Tasks | What the user can evaluate |
| --- | --- | --- |
| A. Workflow model | 1–2 | Statuses, allowed actions, stale/version rules, persistence contract |
| B. Campaign creation | 3–4 | New shell, campaign list, brief and copy decisions |
| C. Creative selection | 5 | Visual directions, templates, validation, review-version creation |
| D. Human gates | 6 | Designer changes/ready, marketer approval/rejection, delivery guard |
| E. Frontend readiness | 7 | All canonical states, mock/live labels, responsive and keyboard behavior |

The backend implementation receives its own plan after Review E. It must implement the same gateway and contract tests.

---

### Task 1: Canonical workflow contracts and transition rules

**Files:**
- Create: `src/mvp/contracts.js`
- Create: `src/mvp/contracts.test.js`
- Create: `src/mvp/workflowRules.js`
- Create: `src/mvp/workflowRules.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `campaignSchema`, `campaignVersionSchema`, `reviewEventSchema`, `canonicalStatuses`.
- Produces: `getAvailableActions(campaign, actor)`, `transitionCampaign(campaign, action, actor, input)`, `createCampaignVersion(campaign, actor, now)`.
- Consumes: no UI or storage modules.

- [x] **Step 1: Install Zod**

Run: `npm install zod`

- [x] **Step 2: Write failing schema tests**

```js
test('accepts the minimum draft campaign', () => {
  expect(campaignSchema.parse(createDraftCampaign())).toMatchObject({ status: 'draft', versions: [] })
})

test('rejects an unknown campaign status', () => {
  expect(() => campaignSchema.parse({ ...createDraftCampaign(), status: 'waiting' })).toThrow()
})
```

- [x] **Step 3: Run the schema tests and confirm RED**

Run: `npm test -- --run src/mvp/contracts.test.js`

Expected: FAIL because `contracts.js` does not exist.

- [x] **Step 4: Implement the minimum schemas**

Define the exact enum:

```js
export const canonicalStatuses = [
  'draft',
  'copy_ready',
  'direction_selected',
  'composed',
  'in_review',
  'changes_requested',
  'ready',
  'approved',
  'delivered',
]
```

The campaign schema includes `id`, `name`, `status`, `brief`, `copySets`, `selectedCopyId`, `directions`, `selectedDirectionId`, `composition`, `versions`, `reviewEvents`, `delivery`, `providerMode`, `updatedAt`.

- [x] **Step 5: Run schema tests and confirm GREEN**

Run: `npm test -- --run src/mvp/contracts.test.js`

- [x] **Step 6: Write failing transition tests**

Cover:

```js
test('offers only valid actions for a draft marketer', () => {
  expect(getAvailableActions(draft, marketer)).toEqual(['save_brief', 'generate_copy'])
})

test('prevents the designer from approving a ready version', () => {
  expect(() => transitionCampaign(ready, 'approve', designer, {})).toThrow('forbidden')
})

test('prevents the ready actor from approving their own version', () => {
  expect(() => transitionCampaign(ready, 'approve', readyDesignerAsMarketer, {})).toThrow('self_approval_forbidden')
})
```

- [x] **Step 7: Run transition tests and confirm RED**

Run: `npm test -- --run src/mvp/workflowRules.test.js`

- [x] **Step 8: Implement the transition table**

Actions are `save_brief`, `generate_copy`, `select_copy`, `generate_directions`, `select_direction`, `save_composition`, `send_for_review`, `request_changes`, `mark_ready`, `reject`, `reopen`, `approve`, `deliver`.

The implementation returns a new parsed campaign object and never mutates its input.

- [x] **Step 9: Run Task 1 tests and commit**

Run: `npm test -- --run src/mvp/contracts.test.js src/mvp/workflowRules.test.js`

```bash
git add package.json package-lock.json src/mvp/contracts.js src/mvp/contracts.test.js src/mvp/workflowRules.js src/mvp/workflowRules.test.js
git commit -m "feat: add MVP workflow contracts"
```

---

### Task 2: Persistent mock gateway

**Files:**
- Create: `src/mvp/gateway.js`
- Create: `src/mvp/mockCampaignGateway.js`
- Create: `src/mvp/mockCampaignGateway.test.js`
- Create: `src/mvp/fixtures.js`

**Interfaces:**
- Consumes: `campaignSchema`, `transitionCampaign` from Task 1.
- Produces: `createMockCampaignGateway({ storage, now, latency })`.
- Gateway methods: `listCampaigns()`, `getCampaign(id)`, `createCampaign(input, meta)`, `performAction(id, action, input, meta)`, `reset()`.
- `meta` is `{ actor, idempotencyKey }`.

- [x] **Step 1: Write failing persistence and idempotency tests**

```js
test('persists a created campaign across gateway instances', async () => {
  const first = createMockCampaignGateway({ storage })
  const created = await first.createCampaign({ name: 'Autumn launch' }, meta)
  const second = createMockCampaignGateway({ storage })
  expect(await second.getCampaign(created.id)).toEqual(created)
})

test('returns the first result for a repeated idempotency key', async () => {
  const first = await gateway.performAction(id, 'generate_copy', {}, meta)
  const repeated = await gateway.performAction(id, 'generate_copy', {}, meta)
  expect(repeated).toEqual(first)
})
```

- [x] **Step 2: Run and confirm RED**

Run: `npm test -- --run src/mvp/mockCampaignGateway.test.js`

- [x] **Step 3: Implement the asynchronous gateway**

Storage key: `banner-studio:mvp:v1`. Store `{ campaigns, idempotencyResults }`. Validate every read and write through `campaignSchema`.

- [x] **Step 4: Run and confirm GREEN**

Run: `npm test -- --run src/mvp/mockCampaignGateway.test.js`

- [x] **Step 5: Commit**

```bash
git add src/mvp/gateway.js src/mvp/fixtures.js src/mvp/mockCampaignGateway.js src/mvp/mockCampaignGateway.test.js
git commit -m "feat: add persistent mock campaign gateway"
```

---

### Task 3: New MVP workspace and review route

**Files:**
- Create: `src/mvp/MvpApp.jsx`
- Create: `src/mvp/MvpApp.test.jsx`
- Create: `src/mvp/MvpShell.jsx`
- Create: `src/mvp/MvpShell.test.jsx`
- Create: `src/mvp/mvp.css`
- Modify: `src/App.jsx`
- Modify: `src/main.jsx`

**Interfaces:**
- Consumes: a `gateway` prop implementing Task 2.
- Produces: `/mvp` and `/mvp/campaign/:id` routes.
- `MvpApp` owns loading/error state and selected campaign ID; stage components receive a campaign and action callbacks.

- [ ] **Step 1: Write failing shell tests**

Assert that `/mvp` shows `Banner Studio MVP`, provider badge `Mock provider`, campaign list, phase progress, and a `Create campaign` action.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- --run src/mvp/MvpApp.test.jsx src/mvp/MvpShell.test.jsx`

- [ ] **Step 3: Implement the minimal shell and isolated route**

The shell has three areas at desktop width: campaign rail, main stage, and current-version summary. At mobile width they become one column, with the phase rail above the stage.

- [ ] **Step 4: Run and confirm GREEN**

Run: `npm test -- --run src/mvp/MvpApp.test.jsx src/mvp/MvpShell.test.jsx`

- [ ] **Step 5: Build and commit**

Run: `npm run build`

```bash
git add src/App.jsx src/main.jsx src/mvp/MvpApp.jsx src/mvp/MvpApp.test.jsx src/mvp/MvpShell.jsx src/mvp/MvpShell.test.jsx src/mvp/mvp.css
git commit -m "feat: add reviewable MVP workspace"
```

---

### Task 4: Brief and copy stages

**Files:**
- Create: `src/mvp/stages/BriefStage.jsx`
- Create: `src/mvp/stages/BriefStage.test.jsx`
- Create: `src/mvp/stages/CopyStage.jsx`
- Create: `src/mvp/stages/CopyStage.test.jsx`
- Modify: `src/mvp/MvpApp.jsx`

**Interfaces:**
- Brief emits `save_brief` with `{ brief }`.
- Copy emits `generate_copy` and `select_copy`.
- Both consume `pendingAction` and render disabled/loading/error states.

- [ ] **Step 1: Write failing brief tests**

Test required fields, saved persistence, and downstream stale warning after an approved selection changes.

- [ ] **Step 2: Implement BriefStage and verify GREEN**

Run: `npm test -- --run src/mvp/stages/BriefStage.test.jsx`

- [ ] **Step 3: Write failing copy tests**

Test three mock candidates, editable selected copy, generation cap label, and selection advancing to `copy_ready`.

- [ ] **Step 4: Implement CopyStage and verify GREEN**

Run: `npm test -- --run src/mvp/stages/CopyStage.test.jsx`

- [ ] **Step 5: Commit**

```bash
git add src/mvp/MvpApp.jsx src/mvp/stages/BriefStage.jsx src/mvp/stages/BriefStage.test.jsx src/mvp/stages/CopyStage.jsx src/mvp/stages/CopyStage.test.jsx
git commit -m "feat: add brief and copy decision stages"
```

---

### Task 5: Direction, template, and review-version stages

**Files:**
- Create: `src/mvp/stages/DirectionStage.jsx`
- Create: `src/mvp/stages/DirectionStage.test.jsx`
- Create: `src/mvp/stages/CompositionStage.jsx`
- Create: `src/mvp/stages/CompositionStage.test.jsx`
- Create: `src/mvp/stages/SendForReviewStage.jsx`
- Create: `src/mvp/stages/SendForReviewStage.test.jsx`
- Modify: `src/mvp/MvpApp.jsx`

**Interfaces:**
- Direction emits `generate_directions`, `select_direction`.
- Composition emits `save_composition` with `{ templateId, templateVersion, slots, ratios, validation }`.
- Review emits `send_for_review` and receives immutable version N.

- [ ] **Step 1: Test and implement DirectionStage**

It displays five image directions, blocked/failed states, selected state, and requires one usable selection.

- [ ] **Step 2: Test and implement CompositionStage**

It displays the existing banner preview, four ratios, copy-limit validation, and template version.

- [ ] **Step 3: Test and implement SendForReviewStage**

It summarizes version content, blocks on validation/safety errors, and shows the created version number and hash.

- [ ] **Step 4: Run the stage suite and commit**

Run: `npm test -- --run src/mvp/stages/DirectionStage.test.jsx src/mvp/stages/CompositionStage.test.jsx src/mvp/stages/SendForReviewStage.test.jsx`

```bash
git add src/mvp/MvpApp.jsx src/mvp/stages
git commit -m "feat: add creative selection and review version"
```

---

### Task 6: Human review, approval, and delivery stages

**Files:**
- Create: `src/mvp/stages/DesignerReviewStage.jsx`
- Create: `src/mvp/stages/DesignerReviewStage.test.jsx`
- Create: `src/mvp/stages/ApprovalStage.jsx`
- Create: `src/mvp/stages/ApprovalStage.test.jsx`
- Create: `src/mvp/stages/DeliveryStage.jsx`
- Create: `src/mvp/stages/DeliveryStage.test.jsx`
- Modify: `src/mvp/MvpApp.jsx`

**Interfaces:**
- Designer emits `request_changes` or `mark_ready` with Figma URL and checklist confirmation.
- Marketer emits `reject` or `approve`.
- Delivery emits `deliver` and displays PNG file names plus `manifest.json`.

- [ ] **Step 1: Test and implement the designer gate**

Require an HTTPS Figma URL and confirmed review checklist. Request changes requires a comment.

- [ ] **Step 2: Test and implement the marketer gate**

Show exact version/hash, prevent self-approval, and require a comment on rejection.

- [ ] **Step 3: Test and implement delivery**

Delivery remains disabled until approved and lists only PNG outputs from the approved version.

- [ ] **Step 4: Run the gate suite and commit**

Run: `npm test -- --run src/mvp/stages/DesignerReviewStage.test.jsx src/mvp/stages/ApprovalStage.test.jsx src/mvp/stages/DeliveryStage.test.jsx`

```bash
git add src/mvp/MvpApp.jsx src/mvp/stages
git commit -m "feat: add human review and delivery gates"
```

---

### Task 7: Canonical states, identity switcher, and frontend review build

**Files:**
- Create: `src/mvp/components/StatePanel.jsx`
- Create: `src/mvp/components/StatePanel.test.jsx`
- Create: `src/mvp/components/ActorSwitcher.jsx`
- Create: `src/mvp/components/ActorSwitcher.test.jsx`
- Create: `src/mvp/components/ProviderBadge.jsx`
- Create: `src/mvp/components/ProviderBadge.test.jsx`
- Modify: `src/mvp/MvpApp.jsx`
- Modify: `src/mvp/mvp.css`
- Modify: `docs-site/roadmap.md`

**Interfaces:**
- Actor switcher selects one fixture identity without changing campaign data.
- State panel maps gateway errors to `loading`, `empty`, `error`, `retry`, `blocked`, `rejected`, `stale`, `over_budget`, `provider_unavailable`, `success`.
- Provider badge always displays `Mock provider` in this plan.

- [ ] **Step 1: Test and implement identity switching**

Verify actions appear/disappear for Marketer, Designer, and Admin through `getAvailableActions`.

- [ ] **Step 2: Test and implement canonical state presentation**

Use human-readable messages and a retry callback only for retryable states.

- [ ] **Step 3: Verify responsive and keyboard behavior**

Run component tests, then inspect `/mvp` at 390, 768, and 1440 CSS pixels. Tab through campaign selection, stage actions, and review controls.

- [ ] **Step 4: Run the complete frontend-first verification**

Run:

```bash
npm test -- --run src/mvp
npm run build
```

- [ ] **Step 5: Update roadmap and commit**

Mark only completed frontend-first review checkpoints. Do not mark backend, auth, Gemini, or cloud tasks complete.

```bash
git add src/mvp docs-site/roadmap.md
git commit -m "feat: complete frontend-first MVP review build"
```

---

## Backend follow-on plans

After Review E, write one implementation plan per backend module from the approved spec:

1. API and PostgreSQL persistence implementing `CampaignGateway`.
2. Firebase authentication, invitations, roles, and audit events.
3. Vertex AI Gemini adapter, safety mapping, limits, and cost records.
4. Asset storage, in-process PNG rendering, immutable versions, and ZIP exports.
5. Staging/production deployment, secrets, alerts, backups, and rollback.

Each plan begins only after the frontend behavior it must support has been accepted.
