# Campaign modules

Approved chain: **Brief → Copy → Visuals → Banners → Review → Distribute**.

The live campaign page uses this architecture. `CampaignPage` composes six stable module hosts; `ConnectedStudio` retains authentication, campaign navigation, sidebar actions and naming. Mutations publish refreshed module snapshots without replacing the page with a loading screen.

## Ownership

| Part | Owns | Does not own |
| --- | --- | --- |
| `moduleContracts.js` | Six IDs, explicit inputs, source-comparison keys | HTTP, local drafts, security hashes |
| `workflowState.js` | Navigation, completion, stale/read-only state, Review phases | Persisted workflow state or server authorization |
| `campaignRuntime.js` | Atomic server snapshot, per-module subscriptions/errors, write exclusion, recovery | Page layout or module editor state |
| `jobObserver.js` | One poller per API scope/job; observation cleanup | Cancelling a server generation |
| `workflowCoordinator.js` | Save → analysis → initial Copy and text-only visual prompts; stopping/resuming the sequence | Copy UI, automatic images, sidebar, new business rules |
| `modules/copy/` | Copy cards, per-card approval/removal/preview, append generation | Whole workspace, arbitrary API access, sibling drafts |
| `modules/brief/` | Brief draft, extraction, analysis summary, save/analyze commands | Campaign title editing or sibling drafts |
| `modules/visuals/` | Prompt and explicit image generation, uploads, source-linked selection | Video generation or sibling state |
| `modules/banners/` | Multi-design/multi-size draft, renderer validation, preview and review receipt | Review decisions |
| `modules/review/` | Preparation, Figma checklist, feedback, approval, reopening | Delivery package construction |
| `modules/distribute/` | Exact approved-version package and download | Review decisions or publishing integrations |
| `CampaignPage`, `ModuleHost`, `moduleRegistry` | Layout, per-module render/loading boundary, lazy imports | Per-step business logic |

Review preparation, Figma checks, feedback, approval, and reopening share one Review module driven by persisted status, independent of the selected URL. Version/hash checks and designer/approver separation remain server-owned. Distribution is tied to the approved exact version.

## Module boundary

`Module({port})` receives `input`, `inputKey`, `access`, `operation`, `actions`, `assets`, `setDirty`, and `navigate`. Visuals additionally receives a host-scoped `reconcile` callback for its module-owned transient and persisted error recovery. `useCampaignModule` subscribes only to that module's stable snapshot. A view must not import the API client or receive the entire workspace.

Keep editor drafts inside the owning module. Capture the input key when initializing a draft and pass it when saving; do not substitute the latest key at submit time. A source conflict retains the draft. Clear only the owning module's dirty flag after a confirmed save. Title/revision-only updates are excluded from editor input keys.

Commands are named factories. They use `runtime.execute(moduleId, actionId, operation, options)` and return `{ok:true}` (optionally with a command-specific receipt) or `{ok:false,code,message}`. The callback gets a captured authoritative workspace, API, idempotency key, and `waitForJob`.

- `intent` identifies the operation's submitted arguments.
- `idempotent:true` is allowed only for existing server endpoints with idempotency support.
- A transport/5xx ambiguity keeps the original key and revision. Pending/unknown jobs block unsafe new work.
- Revision-protected, non-idempotent saves supply an exact-state reconciler. Return `applied`, `not_applied`, or `unknown`; never infer success solely from a newer revision.
- A refresh that supersedes a post-write refresh must commit before the write reports success.
- History-read failures affect Review, not publication of unrelated workspace updates.
- Read-only extraction uses the runtime's scoped read boundary; assets expose only blob reads. Consuming hooks own and revoke object URLs.

The coordinator accepts `actions.brief.submit(patch, {expectedInputKey})`. A failed save or analysis stops downstream work. After analysis, initial Copy and text-only Visuals prompts have independent retry ownership; a known failure in one does not prevent the other. An uncertain paid request blocks further writes until reconciled. Resuming the same source preserves its operation identity; a changed submission cannot replace unresolved work. Campaign creation is never retried automatically; retain the created ID on later failure and reconcile an ambiguous creation against the campaign list.

## Review a module independently

### Banners selection contract

`modules/banners/` owns the Design and Sizes & formats tabs, copy/visual preview pairing, local multi-selection, format filters, Cartesian totals and final verification. Its input contains approved copies carrying `copySetId`, ready visual directions, published templates and the saved composition. Banner artwork is supplied by immutable template manifests; application controls come from the shared design system.

- `saveBatch({designs, ratioIds}, {expectedInputKey})` sends only `{templateId, templateVersion, copySetId, copyId, directionId}` per design to `PUT /api/v1/campaigns/:id/banner-batch` with a quoted revision. Content slots, provenance and validation remain server-owned. It returns `{ok:true, reviewInputKey}` bound to the exact persisted composition.
- `prepareReview({expectedInputKey: receipt.reviewInputKey})` delegates to the existing Review command. Retain the same receipt through retries so a refreshed, different composition cannot replace what the user verified.
- `loadTemplateVersion(id, version)` is a scoped read for selected historical manifests and custom dimensions. The latest gallery is not silently upgraded or expanded with old versions.
- A batch composition contains `designs[]`; immutable review snapshots additionally bind each design to its own copy, direction and template manifest/hash. Rendering and delivery enumerate every design × size. Legacy single-design fields remain compatible, not authoritative shortcuts for a batch.
- Before saving, exact renderer preflight checks every design × size. An unrenderable selection returns `400 invalid_composition` with design/template/ratio/slot details, leaving the previous composition and revision unchanged. Banners retains the draft and displays those details in verification and after Back; it never silently truncates copy. The local command failure may include `details` without changing the shared runtime result contract.

The bundled catalog currently has three designs and seven size presets. Video/Stories are placement categories; current review output is static PNG. Figma handoff prepares those PNGs for manual import and a Figma link in Review. Designer checks and approval are unchanged.

`testing/ModuleHarness.jsx` renders any of the six real modules from a supplied scenario and named action stubs, without the page shell or a live API:

```jsx
<ModuleHarness
  moduleId="copy"
  scenario={makeScenario('copy-ready')}
  actions={{ approve: async (candidateId) => ({ ok: true }) }}
/>
```

The harness records unspecified actions when given a `record` callback. Fixture builders are Node/test-only because version hashes use the real server hasher. The development-only `/mvp/dev/modules/copy?scenario=copy-ready` playground uses generated JSON snapshots instead; production builds exclude them. Module, scenario, role and operation controls expose the real view with mock commands, diagnostics and an event log. Mock downloads/images are placeholders, not delivery artifacts. Regenerate snapshots with `node scripts/generate-module-playground-fixtures.mjs`; the parity test compares every scenario with `makeScenario`.

From the application repository, run:

```sh
npm test -- --run src/studio/campaign
npm test -- --run src/studio/CopyStage.test.jsx src/studio/StudioApp.test.jsx
npm run build
```

Run full suites serially when sharing `banner_studio_test`: the legacy repository integration suite resets its public schema. Parallel agents must coordinate full-suite ownership. Copy's dedicated integration test uses an isolated temporary schema.

New links use `?module=brief|copy|visuals|banners|review|distribute` and matching `#campaign-module-*` anchors. Old numeric step links map explicitly: 0–3 → Brief/Copy/Visuals/Banners; 4–6 → Review; 7 → Distribute. Navigation inside a campaign keeps mounted drafts. Leaving the campaign, changing role or signing out checks unsaved changes. Each module has a local failure boundary; a failed module does not remove its neighbors.

Page-adaptation verification on 6 September 2026: **281 tests passed across 33 focused files**, covering modules, shell, API/asset lifecycle, backend review/delivery rules, and atomic design-system contracts. App and documentation builds passed; documentation still reports a large-chunk advisory. The live browser accessibility tree showed six frames, six timeline entries and the shared Copy tabs. `campaignChain.test.jsx` exercises the real coordinator/runtime/commands against an in-memory API, including a feedback round and second-version delivery; it is not a real-database/provider end-to-end test.

Final structural review additionally covered Brief locking through Copy generation, one-time automatic creation processing, Escape title cancellation and runtime disposal/re-entry (26 focused checks passed).

Copy implementation checkpoint, 6 September 2026: cards replace the earlier comparison tabs. **179 focused checks pass across 17 files**, including real PostgreSQL approval, append/cap/replay/deletion tests. The full shared-checkout run passed **1195 tests**, with five new Visuals command tests failing during that parallel implementation. App and documentation builds pass. Browser verification covered saved cards, single-banner preview, Escape focus restoration and card fit at 390px. See [Copy implementation](../../../../docs/superpowers/plans/2026-09-06-copy-cards-implementation.md) for scope and the downstream integration checkpoint; this is not a claim that concurrent Visuals work is complete.

## Integration status

- [x] Brief view: draft retention, file extraction, analysis facts and summary.
- [x] Visuals view/commands: current directions, image generation and selection.
- [x] Banners view/commands: local composition draft, validation, preview and exports.
- [x] Review and Distribute: exact-version actions, role tests and delivery isolation.
- [x] Shared module frame/host and six-step page: local render boundaries, stable mounts, dirty navigation guards.
- [x] Development-only playground, fixture parity and real module command/feedback tests.
- [x] Isolated real HTTP workflow tests and safe default CLI workflow launcher.
- [x] Near-viewport/direct navigation activation, persistent mounts and no-observer fallback.
- [x] Before/after production artifact comparison and controlled mount/request/draft measurements.
- [x] Connected UI/HTTP designer feedback, pointer/keyboard reopen, independent approval and exact v2 delivery regression.
- [x] Final-review production fixes: dependency-aware saved batch invalidation and fresh-source duplication, with real runtime/API regressions.
- [x] Final fix re-review, full suite, app/docs build, production artifact checks and isolated delivery verification.
- [ ] Scoped integration checkpoint commit (see integration handoff and git history).
- [ ] Complete physical-browser workflow and comprehensive responsive/keyboard checks after browser activation recovers.

All six headings/anchors render immediately. Allowed content activates on direct navigation or within a 400px viewport margin, then remains mounted. Without IntersectionObserver, accessible content mounts directly. The template route and AnimatedBanner now have separate production chunks; Copy's preview import is dynamic. Entry changed from 350,573 to 346,790 bytes (same-method gzip 107,628 to 106,263); emitted JS files increased from 22 to 26. This is build evidence, not a claim of faster browser rendering. See [measurement evidence](../../../../docs/superpowers/plans/2026-09-07-module-loading-measurements.md).

Parent full-suite checkpoint on 7 September after the final production fixes: **136 files / 1,340 tests passed**, with no skipped tests reported. Browser QA reached immutable review and designer feedback, but control activation later stopped even on the fixture playground. Do not treat that as a verified application defect or a completed physical-browser approval/delivery loop. The connected UI/API and isolated CLI checks are separate evidence layers.

No live demo records or settings were changed. Legacy Stage exports remain compatibility adapters. Shared working-tree changes are preserved; final commit/deploy status is tracked in the integration handoff.
