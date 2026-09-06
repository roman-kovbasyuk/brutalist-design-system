# Six-module campaign implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Follow the active environment's delegation rules; this plan does not itself authorize spawning agents.

**Goal:** Turn campaign creation into six independently developable, testable modules without changing the existing business workflow.

**Architecture:** Keep one application and the existing backend. Extract module-specific UI and commands behind narrow contracts; a small shared runtime handles server snapshots and safe writes, while a coordinator handles cross-module sequences. The campaign page only composes modules, navigation, and progress.

**Tech Stack:** Existing JavaScript/JSX, React 19, Vite, Zod, Vitest, Testing Library, Fastify, and PostgreSQL. Use installed dependencies; no microfrontend framework or new state-management package is required.

**Spec:** [Approved campaign module architecture](2026-09-06-campaign-module-architecture.md).

**Current status (7 September):** Live six-module page, DEV-only fixture playground, isolated real-API runner, persistent near-viewport activation and team module documentation are implemented. Final full suite after integration fixes: **136 files / 1,340 tests passed**. Physical-browser acceptance remains incomplete after browser controls stopped activating. The historical checklist below is the original execution record; current evidence and commit status are in the [integration handoff](2026-09-06-integration-handoff.md). No deployment, browser speed gain or real-provider end-to-end pass is claimed.

## Implementation checkpoint — 6 September 2026

- [x] Verified the existing linked worktree and recorded its concurrent changes. Fresh behavioral baseline: 90 tests passed; the two historical assertion failures below had already been corrected.
- [x] Added nine schema-validated workspace scenarios, including exact-version review history and delivery assets.
- [x] Implemented six semantic IDs, narrow projections, derived role/status guards, and explicit legacy URL mapping.
- [x] Implemented actor/campaign-scoped snapshots, structural sharing, independent subscriptions and dirty ownership, serialized commands, safe refresh ordering, shared job observation, and scoped blob reads.
- [x] Tested uncertain provider responses, original-key retries, 120-second observation timeout, terminal-job reconciliation, stale drafts, obsolete scopes, and Review-local history failures.
- [x] Extracted Copy into `CopyModule`, `CopyView`, and `copyCommands`; added its standalone harness and kept a thin live `CopyStage` adapter. Copy now uses the canonical `PillTabs`/`PillTabPanel` and `AppButton` components.
- [x] Implemented and tested Brief command adapters and the Brief → analysis → Copy coordinator ahead of the Brief UI extraction. Same-source retries resume the interrupted stage; submissions forward their draft's captured input key.
- [x] Independent read-only reviews identified recovery and coordinator defects; corresponding regression tests now pass.
- [x] Extract Brief, Visuals, Banners, Review, and Distribute views; add their isolated tests.
- [x] Connect the runtime/coordinator to the live six-module page, module frames, render boundaries, and semantic navigation.
- [ ] Add the development playground, isolated real-API workflow runner, and final browser/performance checks.
- [ ] Make self-contained checkpoint commits after coordinating the existing uncommitted design-system/backend changes. No broad staging or commits were performed.

See [module notes and developer entry points](../../../src/studio/campaign/README.md). Detailed task checkboxes below retain the original task acceptance scope, including unperformed commit/playground/real-API work. Page adaptation verification: 281 tests across 33 files passed; production and docs builds passed. The browser accessibility tree showed all six frames and timeline entries.

Implementation adjustments discovered in code:

- Shared artifact schemas import Node's synchronous integrity hasher. Browser projections reference their types through JSDoc rather than importing Node crypto; fixtures validate against the real schemas in tests. The browser validates workspace identity/envelope and projects atomically; the server remains responsible for artifact validation and authorization.
- Runtime command options also include `intent`, `idempotent`, and a command-owned `reconcile({source,current})` predicate. Only idempotent endpoints can replay an uncertain command. A newer revision alone never proves a timed-out write succeeded.
- Brief `submit(patch, {expectedInputKey})` forwards the originating draft key, and the coordinator retains its interrupted stage for an explicit same-input retry.
- An analyzed brief exposes Copy before its first copy result exists; the server still verifies analysis freshness when accepting generation.
- The live registry lazily imports each module, and animation export code loads on demand. The production build emits distinct module chunks. Shared banner/legacy code still exists; no overall bundle-size or measured runtime-performance improvement is claimed.

## Global constraints

- The approved campaign flow has exactly six modules, in this order: Brief → Copy → Visuals → Banners → Review → Distribute.
- Review contains review preparation, Figma review, and approval within one module. Distribute is the new name for Assets ready. Visuals replaces the AI assets step label.
- Each module owns its functionality, local state, and explicit input/output contract, and must support independent development and debugging. The page owns layout and navigation; workflow coordination connects module outputs to their dependents.
- Internal module changes should not require page changes when the module contract stays compatible. Contract changes must be checked against dependent modules and chain tests.
- Step-specific functional changes will be defined by the user later. This structural decision does not authorize inventing functionality or changing review permissions, approval requirements, or delivery behavior.
- Use components from `src/components/design-system/` first. Add a missing reusable UI pattern to that library before using it in a campaign module. App design-system components are separate from banner brand styles.
- Preserve the ChatGPT-like sidebar, three main menu items, long campaign page, right-side timeline, card wrappers, inline campaign naming, and existing responsive behavior.
- Keep the existing REST APIs, generation providers, database schema, artifact history, version snapshots, and server-side authorization. Six frontend modules do not mean six services or six databases.
- Keep revision checks, idempotency, pending/unknown job protections, and separation of designer review from approval. A URL or client-side status must never grant permission.
- Preserve existing functionality, including automatic analysis followed by copy generation. Do not add visual uploads/video generation, new copy workflows, or publishing integrations during this refactor.
- Work in the existing integrated-MVP checkout after checking its current state. Preserve unrelated and concurrent changes. Commit only the reviewed hunks for the current task; never stage the entire dirty worktree.

---

## Review checkpoints

Implementation owner for every task: **Codex**. Product review owner for every phase: **Roman**.

| Phase | Tasks | Independently reviewable result |
| --- | --- | --- |
| 1. Contracts and compatibility | 1–2 | Agreed module boundaries, behavioral baseline, and unambiguous old/new URL mapping |
| 2. Runtime and first module | 3–4 | Copy works independently; scoped errors/loading and refresh isolation are proven in its harness |
| 3. Creation modules | 5–7 | Brief, Visuals, and Banners work in isolation and exchange existing artifacts correctly |
| 4. Review and delivery | 8 | One Review module, one Distribute module; all existing version and role gates remain |
| 5. Page migration | 9 | The current app uses exactly six modules and the existing design-system timeline |
| 6. Verification and handoff | 10–11 | Isolated API workflow test, module/debug previews, measured loading behavior, and team documentation |

Each task ends with a focused test result and reviewable commit. Each phase handoff includes what changed, how to inspect it, and remaining known failures. A phase is not complete just because files have been moved.

Phases 2–4 expose extracted modules for isolated review while the live page retains compatibility adapters. The page-wide remount problem is fully removed when the new composition is connected in Phase 5; do not claim that live-page behavior is fixed merely because a standalone module passes.

## Current implementation: why this refactor is needed

Read these files before execution; line numbers can shift because the checkout has concurrent work:

| Current source | Coupling to remove |
| --- | --- |
| `src/studio/StudioApp.jsx`, `ConnectedStudio`, `run`, `generate`, `generateCopy` | The page owns generation sequences, all pending/error state, polling, review actions, and full refreshes |
| `src/studio/StudioApp.jsx`, `loadWorkspace` and campaign render branch | Refreshing an action replaces the module tree with loading UI; unrelated local state can be lost |
| `src/studio/BriefStage.jsx`, synchronization effect | A campaign revision change resets the brief draft, even when the brief itself did not change |
| `src/studio/StudioApp.jsx`, `BannerStage` key | Key includes campaign revision, remounting the editor on unrelated changes |
| `src/studio/ReviewStage.jsx` | Numeric page position chooses review, approval, or delivery UI; those are really domain states |
| `src/studio/workflow.js`, `src/studio/CampaignTimeline.jsx` | Eight numeric steps; timeline scrolling and selected URL state can disagree |
| `server/services/workspaceService.js` | Already provides an atomic workspace snapshot; retain this backend boundary initially |
| `shared/workflowRules.js` and backend generation/version/review/delivery services | Already enforce artifact invalidation, roles, revisions, and exact-version handoffs; retain these rules |

Existing focused test evidence from the architecture assessment was **88 passed / 2 failed**. Both failures were in `StudioApp.test.jsx`: the obsolete eight-button navigation assertion and an absent-versus-disabled designer action assertion. Re-run and record the current baseline; this historical count is not a fresh verification result.

## File map

All paths below are relative to the application repository root, not the unrelated desktop task directory.

| Create | Responsibility |
| --- | --- |
| `src/studio/campaign/moduleContracts.js` | Module IDs, JSDoc contract types, projection of validated server records into narrow module inputs |
| `src/studio/campaign/moduleRegistry.js` | Six IDs, labels, order, and lazy UI loaders; no business logic |
| `src/studio/campaign/campaignRoutes.js` | Semantic module URLs and explicit legacy route/hash mapping |
| `src/studio/campaign/workflowState.js` | Derived navigation availability, progress, and internal Review phase |
| `src/studio/campaign/campaignRuntime.js` | Stable module snapshots, subscriptions, dirty ownership, serialized writes, refresh reconciliation |
| `src/studio/campaign/jobObserver.js` | One poller per job, observation lifecycle, uncertain-outcome handling |
| `src/studio/campaign/useCampaignModule.js` | React subscription adapter using `useSyncExternalStore` |
| `src/studio/campaign/workflowCoordinator.js` | Existing cross-module sequences and stable UI action bindings |
| `src/studio/campaign/CampaignPage.jsx` | Campaign title, six module hosts, and timeline composition |
| `src/studio/campaign/ModuleHost.jsx` | Shared frame, per-module loading and render-error boundary; stable module identity |
| `src/studio/campaign/modules/brief/{BriefModule.jsx,BriefView.jsx,briefCommands.js}` | Brief UI/local draft, extraction, saving, and analysis commands |
| `src/studio/campaign/modules/copy/{CopyModule.jsx,CopyView.jsx,copyCommands.js}` | Copy comparison/selection/deletion and copy generation |
| `src/studio/campaign/modules/visuals/{VisualsModule.jsx,VisualsView.jsx,visualsCommands.js}` | Direction/image UI and direction/image commands |
| `src/studio/campaign/modules/banners/{BannersModule.jsx,BannersView.jsx,bannersCommands.js}` | Composition draft/editor, preview/export, and composition save |
| `src/studio/campaign/modules/review/{ReviewModule.jsx,ReviewView.jsx,reviewCommands.js}` | Review preparation, designer checks, feedback, approval, and reopening |
| `src/studio/campaign/modules/distribute/{DistributeModule.jsx,DistributeView.jsx,distributeCommands.js}` | Approved-version package generation and download |
| `src/studio/campaign/testing/workspaceFixtures.js` | Deterministic, schema-valid snapshots for module and chain tests |
| `src/studio/campaign/testing/ModuleHarness.jsx` | Render one real module with supplied input and instrumented commands |
| `src/studio/campaign/dev/ModulePlayground.jsx` | Development-only module/scenario picker; no production API calls |
| `src/components/design-system/organisms/WorkflowModuleFrame.jsx` | Reusable step card with H2, action slot, loading/error/body regions |
| `src/components/design-system/organisms/workflow-module-frame.css` | Canonical frame styling using existing tokens and responsive card values |
| `scripts/testing/start-isolated-studio.mjs` | Disposable database-schema and asset-directory runtime for end-to-end API verification |
| `docs-site/campaign-modules.md` | Module ownership, commands, dependencies, debug instructions, and change checklist |

Place `*.test.js` or `*.test.jsx` beside each new production file that has behavioral logic. Module tests are named `BriefModule.test.jsx`, `CopyModule.test.jsx`, `VisualsModule.test.jsx`, `BannersModule.test.jsx`, `ReviewModule.test.jsx`, and `DistributeModule.test.jsx`. Add `campaignChain.test.jsx` and `campaignIsolation.test.jsx` under `src/studio/campaign/` for multi-module behavior.

Modify existing call sites in `src/studio/StudioApp.jsx`, `src/studio/CampaignTimeline.jsx`, `src/studio/api.js`, `src/studio/primitives.jsx`, `src/studio/campaign-layout.css`, and `src/App.jsx`. Keep old Stage entry points as temporary adapters while migrating; remove their implementation only once every consumer has moved. Do not rewrite unrelated template/sidebar/authentication code.

## Contracts and ownership

### Stable identities and data dependencies

```js
export const MODULE_IDS = ['brief', 'copy', 'visuals', 'banners', 'review', 'distribute']
export const MODULE_LABELS = {
  brief: 'Brief', copy: 'Copy', visuals: 'Visuals',
  banners: 'Banners', review: 'Review', distribute: 'Distribute',
}
export const LEGACY_STEP_MODULES = [
  'brief', 'copy', 'visuals', 'banners', 'review', 'review', 'review', 'distribute',
]
```

The UI chain is sequential, but artifacts are shared by explicit reference, not passed through every intervening component.

| Module | Input owned elsewhere | Output after a successful server command | Local state |
| --- | --- | --- | --- |
| Brief | Saved brief and latest analysis result available in the workspace | Saved brief; analysis job/result | Text draft, attachments/extraction, validation |
| Copy | Current brief/analysis; optional selected image for preview only | Copy sets, selected candidate, removal result | Table/cards/banners view, action errors |
| Visuals | Selected copy and brief context | Directions, generated image asset IDs, selected direction | Per-direction generation feedback |
| Banners | Selected copy, selected direction/image, template versions, saved composition | Saved composition with validation and exact template version | Unsaved slots, formats, template, preview/playback/export state |
| Review | Valid composition and immutable current version; review history | Version creation, designer checks, feedback, approval/reopen result | Figma URL, checklist, comment, downloads |
| Distribute | Exact approved current version and permitted delivery record | Version-bound delivery package | Build/download feedback |

Copy's optional selected-image preview is a read-only display dependency: changing that image must not invalidate generated copy or trigger generation. Banners reads both selected copy and selected visuals. Review and Distribute must never substitute a newer live draft for a version snapshot.

Use `workspaceRecordSchema` from `shared/studioContracts.js` and existing schemas in `shared/contracts.js`. Do not duplicate server records or fabricate unavailable freshness fields. In particular, generation-job responses contain result metadata, not the repository's full private input snapshot. Freshness comes from server invalidation, acknowledged operations, and refreshed authoritative records.

### Runtime interface

These are JavaScript/JSDoc signatures, not a TypeScript conversion. `Workspace` means the inferred `workspaceRecordSchema` type; `Actor` and `Template[]` use the existing session and template API record shapes.

```js
// ModuleSnapshot = { input, inputKey, access, operation }
// access = { canVisit: boolean, canEdit: boolean, reason: string | null }
// operation = { kind: 'idle'|'running'|'failed'|'uncertain',
//               actionId: string|null, jobId: string|null,
//               error: { message, code, requestId } | null }
// CommandResult = { ok: true } | { ok: false, code: string, message: string }

createCampaignRuntime({ api, actor, templates, workspace, reviewHistory = null, onCampaignChange })
// returns:
// getSnapshot(moduleId) -> referentially stable ModuleSnapshot
// subscribe(moduleId, listener) -> unsubscribe()
// refresh() -> Promise<void>
// execute(moduleId, actionId, operation, { expectedInputKey }) -> Promise<CommandResult>
//   operation({ api, workspace, idempotencyKey, waitForJob }) -> Promise<void>
//   waitForJob(response) -> Promise<successful generation job>
// setDirty(moduleId, dirty) -> void
// hasDirty() -> boolean
// assets.getAssetBlob(assetId, { signal } = {}) -> Promise<Blob>
// dispose() -> void

useCampaignModule(runtime, moduleId, actions, onNavigate)
// returns port = { ...ModuleSnapshot, actions, assets, setDirty, navigate }
// navigate(moduleId) changes focus/navigation only, never campaign status.

// Every module UI has the same public signature:
// default export: Component({ port }) -> React element
```

`inputKey` identifies relevant editable source data, not the entire campaign revision. Runtime keeps the current revision privately for safe writes. Permission or action feedback can update without replacing editable input. For a dirty draft whose actual source changes, retain its text, mark the source conflict, and require an explicit reload/reapply decision before saving; do not silently rebase or discard it.

`projectModuleInput(moduleId, workspace, resources)` is the single projection boundary, where `resources = { actor, templates, reviewHistory }`; `reviewHistory` is either null or the existing review-history response. Input objects have these exact top-level fields:

```text
brief:      { brief, analysis }
copy:       { brief, analysis, copies, selectedCopyId, previewAssetId }
visuals:    { brief, selectedCopy, directions, selectedDirectionId }
banners:    { selectedCopy, selectedDirection, templates, composition }
review:     { phase, composition, version, history, nextVersionNumber }
distribute: { version, delivery }
```

References such as `selectedCopy`, `version`, and `analysis` may be null. Use existing candidate IDs, copy-set IDs, direction IDs, and version numbers correctly; do not conflate a selected candidate ID with `campaign.selectedCopyId`, which identifies a copy set. Access state holds role/status guards, not JSX. Review history is refreshed only when a relevant review command/version/status changes or on explicit retry.

The `assets` port exposes only authenticated blob reads, not arbitrary API requests. Adapt `AssetImage`/`useAssetUrl` in `primitives.jsx` to accept that narrow reader while preserving old `api` callers during migration. Copy, Visuals, Banners, and Review views receive `assets` when needed. Own object URLs in the consuming hook, revoke them on asset/scope changes, and keep failures local. Review preview PNG downloads use the same reader; Distribute's package command retains its version-bound download method.

### Command and coordinator interface

Each `create<Name>Commands(runtime)` factory lives in its module's `*Commands.js`. Factories can use the runtime operation callback's API and workspace; module views cannot receive the complete workspace or generic API client.

| Factory | Methods; all commands return `Promise<CommandResult>` unless stated |
| --- | --- |
| `createBriefCommands` | `save(patch)`, `analyze()`, `extractFile(input) → Promise<{text, requestId}>` |
| `createCopyCommands` | `generate()`, `select(copyId)`, `remove(copyId)` |
| `createVisualsCommands` | `generateDirections()`, `generateImage(directionId)`, `select(directionId)` |
| `createBannersCommands` | `save(input)` |
| `createReviewCommands` | `createVersion()`, `markReady({figmaUrl, checklistAnswers})`, `requestChanges(comment)`, `approve()`, `reject(comment)`, `reopen()` |
| `createDistributeCommands` | `build()`, `download() → Promise<Blob>` |

`createWorkflowCoordinator({runtime, onNavigate})` returns `{actions, analyzeAndGenerate, regenerateCopy}`. `actions` is a stable record keyed by module ID; it exposes the relevant factory methods, with `actions.brief.submit = analyzeAndGenerate` and `actions.copy.regenerate = regenerateCopy`. `analyzeAndGenerate(patch)` runs Brief save → Brief analysis → Copy generation, stopping on the first unsuccessful result. `regenerateCopy()` preserves the current analysis → copy behavior. Neither sequence resets another module's draft. Do not make the page manually call these endpoints.

For new campaigns, `startCampaign({api, actor, templates, input, onCreated})` in `workflowCoordinator.js` creates the record, calls `onCreated(campaign)`, loads its workspace, creates a runtime, and runs analysis → copy. Return `{runtime, result}`; retain the created ID if generation fails so retry does not create another campaign. Campaign creation itself has no existing idempotency API: on an ambiguous creation response, reconcile the campaign list and do not automatically retry the POST.

### State, invalidation, and failure rules

- Server status and version records remain authoritative. Availability, completion, staleness, permission, and an operation's loading state are separate concepts; do not persist another campaign state machine.
- `deriveWorkflowState(workspace, actor, reviewHistory)` returns `{currentModule, modules, reviewPhase}`. `modules` is keyed by the six IDs and contains navigation/progress/access data. Review phase is `prepare`, `in_review`, `changes_requested`, `ready`, `approved`, or `delivered`.
- Brief edits invalidate copy, directions, and composition according to the backend. Copy selection/removal can invalidate directions/composition; direction selection can invalidate composition. Version history remains immutable. UI refresh reflects those rules; it does not blindly clear all six modules.
- Only one campaign write runs at a time initially. A second write returns `campaign_busy`; reading, navigation within the campaign, and local drafting remain available. Do not queue an old user intent and silently apply it against a newer revision.
- Every write captures its relevant `expectedInputKey`; compare again before sending. On HTTP 409, refresh authoritative data, retain the draft, show the owning module's conflict, and require explicit retry. Never just replace `If-Match` and replay an old command.
- Reuse an idempotency key for a retry of the same uncertain command where the existing endpoint supports it. Keep pending/unknown generation jobs blocking unsafe new generation. Never treat aborting a browser request as cancelling a server job.
- After success, refresh the atomic workspace without unmounting the page. Update sidebar campaign metadata from the response through `onCampaignChange`; do not reload session and templates after every write.
- Ignore responses from an obsolete campaign/actor scope and older refresh tickets. Dispose subscriptions, polling, and object URLs on scope changes. Keep drafts while their module remains in the current campaign.
- Render exceptions belong to a module error boundary. Async command errors belong to its operation state. A failed image or history download must not blank the campaign page.

## Phase 1 — Contracts and compatibility

### Task 1: Establish behavioral tests and valid fixtures

**Files:** Modify `src/studio/StudioApp.test.jsx`; create `src/studio/campaign/testing/workspaceFixtures.js` and `workspaceFixtures.test.js` beside it. Read current Stage tests and `shared/workflowRules.test.js`.

**Interfaces:** Produces `makeDraftWorkspace(overrides = {}) → Workspace` and `makeScenario(name) → {workspace, actor, templates, reviewHistory}`. Scenario names: `draft`, `copy-ready`, `visuals-ready`, `composed`, `in-review`, `changes-requested`, `ready`, `approved`, `delivered`. All scenarios must parse against existing schemas; no live API or user data.

- [ ] Record `git status --short` and run the focused baseline command below. Separate existing failures from refactor regressions.
- [ ] Correct stale assertions to inspect the real shared `WorkflowSteps` list/links and assert that designer editing is disabled or unavailable. Preserve the permission assertion; do not delete the test because it fails.
- [ ] Add a fixture-schema test before building fixtures. Use the complete required persisted campaign fields and consistent selected IDs, current version numbers, review events, and asset references.

```js
test.each(['draft', 'copy-ready', 'visuals-ready', 'composed', 'in-review',
  'changes-requested', 'ready', 'approved', 'delivered'])('%s has a valid workspace', name => {
  const { workspace } = makeScenario(name)
  expect(workspaceRecordSchema.safeParse(workspace).success).toBe(true)
})
```

- [ ] Implement deterministic fixture builders. Base timestamp is `2026-09-06T10:00:00Z`; use separate marketer and designer IDs. Derive later artifacts from the selected fixture candidate/direction/template, and use existing version snapshot schemas rather than the incomplete lightweight `StudioApp.test.jsx` fixture. Freeze or clone fixture data so tests cannot mutate one another's state.
- [ ] Run `npm test -- --run src/studio/campaign/testing/workspaceFixtures.test.js src/studio/StudioApp.test.jsx shared/workflowRules.test.js`. Expected: the corrected behavioral baseline and all fixture validations pass. Record any unrelated failures with their exact names.
- [ ] Commit only the fixture and baseline test changes: `test: establish campaign module migration baseline`.

Focused baseline command:

```bash
env DEBUG_PRINT_LIMIT=0 npm test -- --run src/studio/workflow.test.js src/studio/BriefStage.test.jsx src/studio/CopyStage.test.jsx src/studio/BannerStage.test.jsx src/studio/ReviewStage.test.jsx src/studio/StudioApp.test.jsx shared/workflowRules.test.js shared/studioTemplates.test.js
```

### Task 2: Define projections, progress, and backwards-compatible module routes

**Files:** Create `moduleContracts.js`, `workflowState.js`, `campaignRoutes.js` and their adjacent tests under `src/studio/campaign/`. Do not switch the live renderer yet.

**Interfaces:** Produces `MODULE_IDS`, `MODULE_LABELS`, `projectModuleInput`, `deriveWorkflowState` as specified above; `parseCampaignModule(search = '', hash = '') → ModuleId|null`; `campaignModuleUrl(campaignId, moduleId) → string`.

- [ ] Write failing tests for the six IDs, role/status availability, input projection, and old links. Example:

```js
test.each([[4, 'review'], [5, 'review'], [6, 'review'], [7, 'distribute']])(
  'preserves old step %s as %s', (step, expected) => {
    expect(parseCampaignModule(`?step=${step}`)).toBe(expected)
    expect(parseCampaignModule('', `#campaign-step-${step}`)).toBe(expected)
  },
)
test('semantic module wins over a conflicting legacy step', () => {
  expect(parseCampaignModule('?module=copy&step=7')).toBe('copy')
})
```

- [ ] Run `npm test -- --run src/studio/campaign/campaignRoutes.test.js src/studio/campaign/workflowState.test.js src/studio/campaign/moduleContracts.test.js`; verify failures reflect missing behavior.
- [ ] Implement semantic URLs as `/mvp/campaign/:id?module=:moduleId#campaign-module-:moduleId`. Parse valid semantic query first, then valid legacy query, then known semantic/legacy hash; invalid values return null. Preserve `/review/:id` and `/designer/:id` route aliases in the shell adapter. Default module comes from data, not a numeric fallback.
- [ ] Map statuses `in_review`, `changes_requested`, and `ready` to Review; map `approved` and `delivered` to Distribute. Earlier state progression preserves current artifact prerequisites. Inspecting a prior module does not change its completed state or the Review phase. Completion of Distribute requires a delivered package, not merely approval.
- [ ] Implement explicit narrow projections. Strip transport `requestId` by validating the workspace record; separately validate review history. Exclude campaign title/revision from editable module input keys. Treat stale/missing selected artifacts as unavailable for new writes, even when their IDs are still present.
- [ ] Run the task tests plus `src/studio/workflow.test.js` and `shared/workflowRules.test.js`. Expected: compatibility and guards pass; the existing eight-step renderer is still unchanged at this checkpoint.
- [ ] Commit: `refactor: define six campaign module contracts and route compatibility`.

## Phase 2 — Runtime and first independently working module

### Task 3: Introduce scoped runtime, command execution, and job observation

**Files:** Create `campaignRuntime.js`, `jobObserver.js`, `useCampaignModule.js`, their adjacent tests, and `campaignIsolation.test.jsx`. Modify `src/studio/api.js` and `api.test.js` for optional abort signals on reads; adapt `src/studio/primitives.jsx` to the narrow asset reader and add `primitives.test.jsx` for asset lifecycle behavior.

**Interfaces:** Produces the runtime and hook interface above. `observeJob({api, jobId, onUpdate, signal}) → unsubscribe()` shares a poller per API scope/job; the runtime adapts its updates to `waitForJob(response)`. Existing read methods gain an optional last `{signal}` argument without breaking current callers.

- [ ] Add failing tests for stale refresh ordering, actor/campaign disposal, scoped errors, write exclusion, and unchanged inputs. Example:

```js
test('a title-only refresh keeps the banner source stable', async () => {
  const scenario = makeScenario('composed')
  const next = structuredClone(scenario.workspace)
  next.campaign.title = 'Renamed campaign'
  next.campaign.revision += 1
  const api = { getWorkspace: vi.fn().mockResolvedValue(next) }
  const runtime = createCampaignRuntime({ ...scenario, api })
  const before = runtime.getSnapshot('banners').input
  runtime.setDirty('banners', true)
  await runtime.refresh()
  expect(runtime.getSnapshot('banners').input).toBe(before)
  expect(runtime.hasDirty()).toBe(true)
})
```

- [ ] Run `npm test -- --run src/studio/campaign/campaignRuntime.test.js src/studio/campaign/jobObserver.test.js src/studio/campaign/campaignIsolation.test.jsx src/studio/api.test.js`; confirm targeted failures.
- [ ] Implement immutable input projections with structural sharing. Cache stable module snapshots; `useSyncExternalStore` must not return a newly allocated snapshot on every read. Scope caches by actor and campaign. Compare actual source values/IDs/stale flags, not only object identity from JSON responses.
- [ ] Implement the execution rules above. Keep current data during background refresh; distinguish initial loading from refresh. Serialize writes with `try/finally`; report async errors to the initiating module and resolve a `CommandResult`. File extraction and downloads can reject to their local UI without claiming a campaign write occurred.
- [ ] Add abort support to `getWorkspace`, `getJob`, `getReview`, `getDelivery`, and `getAssetBlob`. Stop observation on disposal; do not cancel or replay server mutations automatically. Resume observation of pending jobs from a refreshed workspace. Preserve the existing 900 ms polling cadence and 120-second observation timeout; a timeout is still running/uncertain, not success or cancelled.
- [ ] Fetch review history for the current version on initial load and after relevant review/status changes; reject results from obsolete version/scope tickets. Provide the `assets` port without exposing other API methods, and test object-URL cleanup and late asset responses after unmount.
- [ ] Test a timed-out generation followed by retry: same key for the same unresolved command, no second generation while pending/unknown, no stale result applied after switching campaigns. Test failed refresh after acknowledged write: report reconciliation failure, preserve command identity, and do not blindly repeat the write.
- [ ] Run the task suite and `src/studio/api.test.js`; expected: pass with no real backend required.
- [ ] Commit: `refactor: scope campaign state and commands by module`.

### Task 4: Extract Copy as the pilot and add the module test harness

**Files:** Create the three Copy module files, `CopyModule.test.jsx`, `testing/ModuleHarness.jsx`, `workflowCoordinator.js`, and its test. Modify `src/studio/CopyStage.jsx` to a temporary adapter and preserve its tests.

**Interfaces:** Produces `CopyModule({port})`, `CopyView({input, access, operation, actions, assets})`, and `createCopyCommands(runtime)`. `ModuleHarness({moduleId, scenario, actions = {}, onNavigate})` renders the real module with a supplied narrow port; no `ConnectedStudio` or live network is needed. Fill unspecified actions with deterministic recording stubs that return `{ok:true}` and serve only fixture blobs through `assets`. The harness initially registers Copy; register each further module as it is extracted. The coordinator initially wires Copy actions; subsequent extraction tasks add their factories.

- [ ] Add failing module tests for table/cards/banner preview modes, selection and removal payloads, stale artifacts, disabled editing, and generation errors. Example:

```jsx
test('selection sends a candidate ID through the module boundary', async () => {
  const scenario = makeScenario('copy-ready')
  const select = vi.fn().mockResolvedValue({ ok: true })
  render(<ModuleHarness moduleId="copy" scenario={scenario} actions={{ select }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Select option 1' }))
  await waitFor(() => expect(select).toHaveBeenCalledWith(
    scenario.workspace.copies[0].candidates[0].id,
  ))
})
```

- [ ] Run `npm test -- --run src/studio/campaign/modules/copy/CopyModule.test.jsx src/studio/campaign/workflowCoordinator.test.js` and inspect the failures.
- [ ] Move the existing copy UI into CopyView. Keep the selected comparison mode locally. Use canonical `molecules/PillTabs.jsx` with matching `PillTabPanel` instances and `atoms/AppButton.jsx`; preserve their established accessibility behavior instead of making new tabs/buttons. Update tests of the migrated mode selector to `role=tab`/`aria-selected`, not the old `aria-pressed` buttons. Module receives narrow inputs and named actions, never the whole workspace.
- [ ] Implement commands using `api.generate(id, 'copy', {}, key)`, `api.selectCopy(id, {copyId}, revision)`, and `api.deleteCopy(id, copyId, revision)`. Use runtime execution and the current fresh revision. Derive selected copy-set/candidate references from the refreshed server response.
- [ ] Keep a thin legacy adapter so the pilot can be reviewed in the existing page. At this stage the existing outer analysis sequence remains; do not accidentally call analysis twice during the transition. Keep old action-label expectations only inside the adapter, not in the new module contract.
- [ ] Run new module tests, `src/studio/CopyStage.test.jsx`, and `src/studio/StudioApp.test.jsx`. Expected: the same copy UI works independently and through the adapter.
- [ ] Commit: `refactor: isolate campaign copy module`.

Phase 2 review: inspect Copy with supplied fixtures and a rejected command. Its controls remain visible, its error stays in Copy, and its comparison mode survives a server update. No other module needs to mount for this review.

## Phase 3 — Extract Brief, Visuals, and Banners

### Task 5: Move brief drafting and creation sequences out of the page

**Files:** Create the three Brief module files and `BriefModule.test.jsx`; extend `workflowCoordinator.js` and its test; adapt `src/studio/BriefStage.jsx` and the campaign creation call site in `StudioApp.jsx`.

**Interfaces:** Produces `BriefModule({port})`, `BriefView({input, access, operation, actions, setDirty})`, `createBriefCommands(runtime)`, and the coordinator's `analyzeAndGenerate`, `regenerateCopy`, and `startCampaign` contracts.

- [ ] Add tests for text-only/file-only briefs, extraction failures, campaign creation failure, analysis failure stopping Copy, and draft retention on unrelated updates. Example:

```jsx
test('retains a brief draft when unrelated input is refreshed', () => {
  const input = { brief: makeScenario('draft').workspace.campaign.brief, analysis: null }
  const props = { input, access: { canVisit: true, canEdit: true, reason: null },
    operation: { kind: 'idle', actionId: null, jobId: null, error: null },
    actions: { submit: vi.fn(), extractFile: vi.fn() }, setDirty: vi.fn() }
  const view = render(<BriefView {...props} />)
  fireEvent.change(screen.getByLabelText('Campaign description'), { target: { value: 'Unsaved launch notes' } })
  view.rerender(<BriefView {...props} input={{ ...input }} />)
  expect(screen.getByLabelText('Campaign description')).toHaveValue('Unsaved launch notes')
})
```

- [ ] Run `npm test -- --run src/studio/campaign/modules/brief/BriefModule.test.jsx src/studio/campaign/workflowCoordinator.test.js` and verify the intended failures.
- [ ] Move composer/file validation logic into BriefView; use canonical `organisms/PromptComposer.jsx`. Preserve 5 MB/file and 20,000-character total limits, file MIME behavior, keyboard submit, and the one-input UX. Initialize drafts from brief content, not campaign revision. Actual source changes must not silently overwrite a dirty draft.
- [ ] Implement Brief commands with existing extraction/PATCH/analysis APIs. Keep campaign title editing separate from brief synchronization. Move the bento facts and summary to BriefModule because they describe its analysis output, not page-wide layout.
- [ ] Implement coordinator sequences explicitly: `await save(patch)` → check `ok` → `await analyze()` → check `ok` → `await copy.generate()` → navigate to Copy only on success. New campaign generation failures leave the saved campaign accessible for retry; do not rerun creation.
- [ ] Connect `/mvp/new` to the same BriefView and the `startCampaign` coordinator. Keep its current centered initial layout. Remove only the superseded creation/analysis sequence from the page; sidebar creation metadata remains shell-owned.
- [ ] Run task tests plus `src/studio/BriefStage.test.jsx` and `src/studio/StudioApp.test.jsx`.
- [ ] Commit: `refactor: isolate brief module and campaign creation handoff`.

### Task 6: Extract Visuals with per-direction feedback

**Files:** Create the three Visuals module files and `VisualsModule.test.jsx`; adapt `src/studio/VisualStage.jsx`; add the Visuals factory to the coordinator.

**Interfaces:** Produces `VisualsModule({port})`, `VisualsView({input, access, operation, actions, assets})`, and `createVisualsCommands(runtime)` with the methods defined in the command table.

- [ ] Write tests for empty directions, image generation, selected image, stale selected copy, failure, and busy state on the correct direction. Example:

```jsx
test('image generation identifies its direction, not its list position', async () => {
  const scenario = makeScenario('visuals-ready')
  scenario.workspace.directions[0].previewAssetId = null
  scenario.workspace.directions[0].status = 'pending'
  const generateImage = vi.fn().mockResolvedValue({ ok: true })
  render(<ModuleHarness moduleId="visuals" scenario={scenario} actions={{ generateImage }} />)
  fireEvent.click(screen.getAllByRole('button', { name: 'Generate image' })[0])
  await waitFor(() => expect(generateImage).toHaveBeenCalledWith(scenario.workspace.directions[0].id))
})
```

- [ ] Run `npm test -- --run src/studio/campaign/modules/visuals/VisualsModule.test.jsx` and inspect failures.
- [ ] Move the existing stacked media-left/text-right cards unchanged into VisualsView. Rename its heading and continuation labels to Visuals. Use action IDs such as `image:<directionId>` for feedback instead of comparing human-readable pending strings.
- [ ] Implement generation with existing `directions` and `image` endpoints, preserving the current `{directionId, width:1080, height:1080}` request. Select using `{directionId}` and current revision. Only select a non-stale ready direction with a real preview asset. A failed image leaves the direction available for a valid explicit retry.
- [ ] Extend module harness coverage for failed and pending operations. Do not add upload/video controls: those are not implemented in the current source and are outside this structural migration.
- [ ] Run the Visuals test plus runtime/job tests and `src/studio/StudioApp.test.jsx`.
- [ ] Commit: `refactor: isolate visuals module and direction actions`.

### Task 7: Extract Banners and protect unsaved compositions

**Files:** Create the three Banners module files and `BannersModule.test.jsx`; adapt `src/studio/BannerStage.jsx`; extend `campaignIsolation.test.jsx` and the coordinator. Preserve `AnimatedBanner.jsx` and `exportAnimation.js` behavior.

**Interfaces:** Produces `BannersModule({port})`, `BannersView({input, access, operation, actions, assets, setDirty})`, and `createBannersCommands(runtime).save(input)`. Save input remains `{templateId, templateVersion, ratioIds, slotValues}`.

- [ ] Add tests for selected copy/tag/image mapping, validation errors, unsaved template/format/slot retention, and actual upstream replacement. Example:

```jsx
test('keeps unsaved headline when the banner source is unchanged', () => {
  const scenario = makeScenario('composed')
  const view = render(<ModuleHarness moduleId="banners" scenario={scenario} />)
  fireEvent.change(screen.getByLabelText('Headline'), { target: { value: 'My unfinished headline' } })
  const renamed = structuredClone(scenario)
  renamed.workspace.campaign.title = 'A new project name'
  renamed.workspace.campaign.revision += 1
  view.rerender(<ModuleHarness moduleId="banners" scenario={renamed} />)
  expect(screen.getByLabelText('Headline')).toHaveValue('My unfinished headline')
})
```

- [ ] Run `npm test -- --run src/studio/campaign/modules/banners/BannersModule.test.jsx src/studio/campaign/campaignIsolation.test.jsx` and verify failures.
- [ ] Move editor local state into BannersView. Key module lifetime by campaign ID/module ID only. Initialize from saved composition or selected source artifacts; an unrelated revision is not an initialization event.
- [ ] Submit the exact template version and image asset ID through the save command. Use runtime source-key and revision checks. Preserve drafts on failed saves. When copy/image changes, show a local source-changed state; keep authored content until the user explicitly reloads from the new source, and block saving an obsolete composition accidentally.
- [ ] Preserve current animated preview, selected formats, optional tag, local HTML draft export, and final PNG-package distinction. Reuse app controls; banner typography/colors remain template/brand-owned.
- [ ] Add a two-module isolation test: fail a Visuals command while Banners has a dirty headline; both module trees remain mounted and the headline stays intact.
- [ ] Run new tests plus `src/studio/BannerStage.test.jsx`, `src/studio/AnimatedBanner.test.jsx`, and `src/studio/exportAnimation.test.js`.
- [ ] Commit: `refactor: isolate banner editor and preserve composition drafts`.

Phase 3 review: change one module input in its harness, inspect its output command, then exercise Brief → Copy → Visuals → Banners together. Verify title renaming never resets either brief or banner drafts.

## Phase 4 — Consolidate Review; separate Distribute

### Task 8: Replace numeric review screens with domain-owned internal phases

**Files:** Create all Review/Distribute module files and their module tests; extend `workflowCoordinator.js`, `workflowState.test.js`, and `campaignChain.test.jsx`. Adapt `src/studio/ReviewStage.jsx` temporarily.

**Interfaces:** Produces `ReviewModule({port})`, `ReviewView({input, access, operation, actions, assets, setDirty})`, `DistributeModule({port})`, `DistributeView({input, access, operation, actions})`, and both command factories. Review actions use the exact current version ID and fresh campaign revision; Distribute uses that approved version ID.

- [ ] Add tests for all internal Review phases and the role matrix. Example:

```jsx
test('an approved version exposes delivery in Distribute, not another review screen', () => {
  const scenario = makeScenario('approved')
  const { rerender } = render(<ModuleHarness moduleId="review" scenario={scenario} />)
  expect(screen.queryByRole('button', { name: 'Build delivery' })).toBeNull()
  rerender(<ModuleHarness moduleId="distribute" scenario={scenario} />)
  expect(screen.getByRole('button', { name: 'Build delivery' })).toBeEnabled()
})
```

- [ ] Run both new module test files and `src/studio/campaign/workflowState.test.js`; verify the tests fail for the missing modules/phase behavior.
- [ ] Move version preparation, preview downloads, history, Figma checklist, feedback, and approval into Review. Its content derives from `input.phase` and authorized actions, not the selected URL/module or a numeric `stage` prop. Approved/delivered Review remains an inspectable version summary.
- [ ] Preserve existing gates: only editor roles create a valid review version; only designer marks ready; Figma link and all three checks are required; approving actor must be permitted and different from the ready-event actor; changes require feedback and reopening. Reject missing/mismatched current version/history instead of guessing a version. Backend remains the final authority.
- [ ] Keep Figma URL/checklist/comment drafts scoped to the version ID. Do not reset them on unrelated revision/history refresh. A new version changes their context and cannot reuse old ready checks as approval evidence.
- [ ] Move delivery building/downloading into Distribute. Validate the package belongs to the approved current version. Preserve designer visibility restrictions, disabled downloads while running, and the ZIP manifest/hash semantics. Downloads do not trigger a campaign-wide loading screen.
- [ ] Add chain tests for request changes → reopen → changed artifact → new version → designer ready → marketer approval → distribution. Include denied premature delivery, self-approval, stale revision, and duplicate command retries.
- [ ] Run `npm test -- --run src/studio/campaign/modules/review/ReviewModule.test.jsx src/studio/campaign/modules/distribute/DistributeModule.test.jsx src/studio/campaign/campaignChain.test.jsx src/studio/ReviewStage.test.jsx shared/workflowRules.test.js server/services/reviewService.test.js server/routes/versions.test.js server/services/deliveryService.test.js`.
- [ ] Commit: `refactor: consolidate review and isolate approved distribution`.

## Phase 5 — Switch the page to six module hosts

### Task 9: Compose the modules using the app design system

**Files:** Create `moduleRegistry.js`, `ModuleHost.jsx`, `CampaignPage.jsx`, their tests, and shared `WorkflowModuleFrame.jsx`/CSS/test. Modify `StudioApp.jsx`, `CampaignTimeline.jsx`, `campaign-layout.css`, `workflow.js`, `workflow.test.js`, `CampaignLayout.test.jsx`, and `StudioApp.test.jsx`. Document the shared frame in `src/components/design-system/examples/library-catalog.js` and `src/components/design-system/examples/UIBlocks.jsx`.

**Interfaces:** `MODULES = [{id, label, load}]` in approved order; each loader resolves `{default: ModuleComponent}`. `CampaignPage({runtime, coordinator, campaign, activeModule, onNavigate, onRename})` composes hosts. `ModuleHost({moduleId, runtime, actions, onNavigate})` connects the hook/port to the loaded component. `WorkflowModuleFrame({id, title, action, busy, error, onRetry, children})` is the canonical shared container.

- [ ] Add failing six-module page and isolation tests. Example:

```jsx
test('renders six module headings and one combined Review', async () => {
  const scenario = makeScenario('approved')
  const api = { getWorkspace: vi.fn().mockResolvedValue(scenario.workspace) }
  const runtime = createCampaignRuntime({ ...scenario, api })
  const coordinator = createWorkflowCoordinator({ runtime, onNavigate: vi.fn() })
  render(<CampaignPage runtime={runtime} coordinator={coordinator}
    campaign={scenario.workspace.campaign} activeModule="review"
    onNavigate={vi.fn()} onRename={vi.fn()} />)
  await screen.findByRole('heading', { name: 'Review', level: 2 })
  for (const name of ['Brief', 'Copy', 'Visuals', 'Banners', 'Review', 'Distribute']) {
    expect(screen.getAllByRole('heading', { name, level: 2 })).toHaveLength(1)
  }
})
```

- [ ] Run the new page/host/frame tests and inspect their failures before changing the live composition.
- [ ] Extract the existing rounded step-card pattern into the design-system frame. Preserve current 36 px desktop H2, 30 px small-screen H2, card padding/radii, background, and border using canonical tokens; the campaign stylesheet only places/sizes frames. A module view must not duplicate the frame's H2. Standalone harnesses use the same frame.
- [ ] Use existing `molecules/WorkflowSteps.jsx` through CampaignTimeline. Timeline receives module progress and active module, not the full workspace. Keep its existing 1050 px responsive collapse and sticky desktop placement; no new viewport-specific redesign.
- [ ] Switch campaign composition to `MODULES.map(...)` with stable `campaign.id + module.id` keys. Remove numeric Review-stage branches and permanently locked duplicate review placeholders. Keep modules mounted during refresh; initialize a new runtime only when actor/campaign changes.
- [ ] Connect semantic query/hash navigation and explicit legacy mapping. Link click, Back/Forward, and initial deep link resolve the same module and scroll target. Normal locked-link guards remain; an unauthorized future-module URL falls back to the current available module without executing an action. Respect reduced motion. No navigation should discard same-campaign drafts merely to scroll.
- [ ] Aggregate dirty ownership for leaving/switching campaigns and unload warnings. Saving one module clears only that module's dirty flag. Preserve current sidebar search, pinned/recent items, duplicate/delete, user menu, and silent inline rename behavior.
- [ ] Remove superseded campaign action/polling/step-render logic from ConnectedStudio. Keep session/auth/sidebar/workspace-list concerns there. Delete old Stage adapters only after `rg` confirms no remaining callers; migrate useful tests rather than dropping coverage.
- [ ] Run `npm test -- --run src/studio/campaign src/studio/StudioApp.test.jsx src/studio/CampaignLayout.test.jsx src/studio/workflow.test.js src/components/design-system/AtomicContracts.test.jsx src/components/design-system/organisms/WorkflowModuleFrame.test.jsx` and `npm run build`.
- [ ] Commit: `refactor: compose campaign page from six design-system modules`.

Phase 5 review: use a current campaign, an old `?step=5` review link, and a narrow viewport. The user-visible flow has six modules; Review does not depend on scrolling to an old numeric section.

## Phase 6 — Isolation, performance, and team handoff

### Task 10: Make real workflow verification isolated from the user's demo

**Files:** Create `scripts/testing/start-isolated-studio.mjs` and `start-isolated-studio.test.js`. Modify `scripts/test-studio-workflow.mjs`; use its existing exported `verifyStudioWorkflow(baseUrl, options)` function and service wiring in `scripts/dev-studio.mjs` as references. Do not alter the user's demo settings/data.

**Interfaces:** `startIsolatedStudio({connectionString}) → Promise<{url, close}>`; CLI defaults to `TEST_DATABASE_URL` or `postgresql:///banner_studio_test`. Isolated runtime uses a generated `campaign_modules_test_<hex>` schema and a `mkdtemp` asset directory; `close()` removes only those exact resources created by that invocation.

- [ ] Add a failing isolation test using the test database: start two runtimes, create a campaign in one, verify the other cannot read it, close both, and verify the generated schemas are gone. Guard against using the known `banner_studio_demo` database or a non-loopback database server.
- [ ] Run `TEST_DATABASE_URL=postgresql:///banner_studio_test npm test -- --run scripts/testing/start-isolated-studio.test.js` and confirm the intended failure. If the dedicated database is unavailable, report this test as blocked; never fall back to the live demo.
- [ ] Build the runtime with existing service factories, migrations, seeded demo-role users, installed template manifests, mock provider, and temporary local asset store. Bind to loopback on an ephemeral port. Scope all SQL through its generated schema and retain existing demo authorization/origin protections. Close HTTP/pool/asset handles in `finally`; validate the generated schema name before cleanup.
- [ ] Change the workflow script's default launcher to the isolated runtime. Keep the explicit `STUDIO_TEST_BASE_URL` mode only as an opt-in integration target; warn that it creates records and never use it for this plan's verification. Do not broaden production startup or expose demo identity headers there.
- [ ] Run `TEST_DATABASE_URL=postgresql:///banner_studio_test npm run test:workflow`. Expected: Brief → Copy → Visuals → Banners → Review → Distribute succeeds through real services with a verified ZIP, denied role/early-approval actions, idempotent retries, and automatic test-resource cleanup.
- [ ] Commit: `test: isolate campaign workflow verification from local demo data`.

### Task 11: Finish module debugging, loading boundaries, and regression checks

**Files:** Create `dev/ModulePlayground.jsx`, its test, and `docs-site/campaign-modules.md`. Modify `src/App.jsx`, `ModuleHost.jsx`, `moduleRegistry.js`, module preview/export import call sites, `docs-site/workflow.md`, `docs-site/.vitepress/config.js`, and the architecture spec status after migration actually passes. Extend `campaignIsolation.test.jsx` and `campaignChain.test.jsx`.

**Interfaces:** Development-only route `/mvp/dev/modules/:moduleId?scenario=:scenarioName`; scenarios come from `makeScenario`. Overlay operation states `running`, `failed`, and `uncertain` without modifying production records. Real app deep links remain the semantic module URLs from Task 2.

- [ ] Add tests that an injected module render error leaves another module usable, async errors remain local, and refreshing does not remount a dirty sibling. Add a production-build check that the dev playground and fixture records are absent from production chunks.
- [ ] Add the playground behind `import.meta.env.DEV` with a dynamic import in App. Reuse design-system controls for module/scenario selection. Instrument commands with mock results/recorded payloads, no credentials or production API client. Show module ID, input key, operation/job/request IDs and dependency state; raw briefs/assets are fixture data only.
- [ ] Establish before/after measurements using the same campaign fixtures and viewport: initial JS chunks, request count for selecting a copy, render/mount counts, and draft retention during a title-only refresh. Record actual measurements in the module doc; do not claim a speed improvement from file splitting alone.
- [ ] Lazy-load module UI through the registry. Keep each frame/header/anchor present immediately; activate content on direct navigation or near-viewport intersection. Once activated, keep it mounted for the campaign lifetime. Keyboard navigation and browsers without IntersectionObserver must still render usable content. Do not unmount editors while scrolling to save memory.
- [ ] Import expensive banner-preview/export code only when the relevant view/export action is used; ensure Copy's default table does not eagerly load banner/export tools. Verify actual built chunks, since eager imports through legacy entry points can defeat lazy loading. Preserve existing animation/reduced-motion behavior.
- [ ] Test and document request boundaries: no session/templates fetch for each copy action; one active poller per generation job; no whole-page loading replacement for background refresh. Keep the full atomic workspace endpoint for now; a new backend read API requires separate measured justification.
- [ ] Run `TEST_DATABASE_URL=postgresql:///banner_studio_test npm run test:run`, `npm run build`, and the isolated workflow command from Task 10. Report skipped database tests separately from passes and compare unrelated failures to Phase 1's recorded baseline.
- [ ] Visually inspect 1440 px desktop, the existing large desktop layout, and a 390 px mobile viewport: six wrappers, readable table/visual cards, current module indication, collapsed mobile timeline, keyboard focus, error/retry layout, and no horizontal page overflow. Use current design-system tokens; no decorative redesign.
- [ ] Publish the module document with: each module's input/actions/output, standalone preview URL, tests to run, source-key/dirty rules, neighboring contract-change checks, and exact-version review/delivery gates. Link it from the team docs navigation and workflow page. Update the structural spec to implemented only after all required verification succeeds.
- [ ] Commit: `test: verify six-module workflow isolation and document module development`.

## Final acceptance checklist

- [ ] Exactly six module IDs and six workflow headings: Brief, Copy, Visuals, Banners, Review, Distribute.
- [ ] Each module can be opened directly in the app when allowed and exercised independently with fixtures.
- [ ] Every module has named actions, explicit input/output boundaries, and local draft/loading/error ownership.
- [ ] Changing module internals behind the same contract requires no page or sibling-module edits.
- [ ] A changed contract has tests for its actual dependents and the full workflow, including non-adjacent artifact consumers.
- [ ] Full workspace refresh, title rename, or another module's error does not reset unrelated drafts.
- [ ] Existing campaign URLs and old review/approval links resolve safely; numeric steps are not reinterpreted as six-step indices.
- [ ] Review preserves designer/approver separation, exact versions, revision conflicts, feedback, and reopen behavior.
- [ ] Distribute operates only on the authorized approved version; a successful download/package matches that version.
- [ ] Sidebar, app design system, and banner brand design systems remain separate and intact.
- [ ] No unrequested step functionality, new provider/service split, or production-data mutation was introduced.
- [ ] Tests/build/isolated workflow results and any measured performance changes are recorded for review.

## Plan self-review

| Approved requirement | Implementation coverage |
| --- | --- |
| Six named modules in order | Tasks 2 and 9 |
| Module-owned functionality/state and explicit I/O | Contract tables; Tasks 3–8 |
| Independent access/debugging | Harness in Task 4; app routes in Tasks 2/9; playground in Task 11 |
| Neighbor and cross-module communication | Coordinator; Tasks 5–8 and chain tests |
| Internal changes do not change the shell | Uniform port/registry boundary in Task 9 |
| Review + Figma + Approval combined, delivery separate | Task 8 |
| Existing workflow/permissions retained | Global constraints; Tasks 1, 8, and 10 |
| No draft loss on refresh | Tasks 3, 5, 7, 9, and 11 |
| Design-system-first UI | Tasks 4–9 and shared frame |
| Functional changes specified separately | Global constraints and final acceptance checklist |

Execution is in progress. Use the checkpoint section above for verified implementation status; the remaining task and final-acceptance checkboxes still govern completion of the migration.
