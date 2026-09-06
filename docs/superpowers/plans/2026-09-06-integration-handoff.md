# Studio integration handoff and acceptance checklist

## Goal and scope

User assigned Architecture & implementation to synchronize completed agent work, add unit tests, verify complete flows, and unify UI/UX with the app design system. Preserve Brief → Copy → Visuals → Banners → Review → Distribute and the existing sidebar. Reviewed integration was committed as `f9282b7`; the final browser closeout is recorded below.

This is a coordination ledger, not approval to implement design-only proposals. Plan concrete fixes after stable handoffs and inspection; follow applicable design, TDD, and review skills.

## Ownership

App worktree: `/Users/roman/Documents/Dev/crisp/lingu-agents/.worktrees/integrated-mvp`, branch `codex/integrated-mvp`. Task cwd in project-x is not the app repository.

| Task | Task ID | Handoff status |
| --- | --- | --- |
| Architecture & implementation | 01a07110-9e68-7612-b860-68e68d104884 | Owns final synchronization, QA and commit |
| Brief | 01a07630-1ff6-7142-b892-0e6e6093cdcc | Source edits/tests stopped. Owner reports 91 focused tests, final build and isolated browser QA passing; reviewers closed |
| Copy | 01a07668-92a4-7fc0-8ac5-3ba66234dd28 | Stopped. Latest work runtime-only mock simulation; five Copy cards, three prompts, zero images verified by owner |
| AI Visuals | 01a0766e-65a3-7be1-b998-77417d3c5db1 | Stopped; complete explicit generation/uploads. New Brief handoff supersedes earlier integrated verification. Video is a placeholder |
| UI system | 01a0760c-5730-7b30-94da-61bf0d5b6a66 | Stopped. Canonical DS and validation handoff inspected; final review reconciled legacy/extraction wording |
| Banners | 01a07879-c3a8-7010-8aaf-63bf720bfa8d | Final handoff complete; all source/docs stopped. Batch, source integrity and exact-renderer preflight repaired and reviewed |
| Approval | 01a0788e-bde1-72e3-920a-c312839699ab | Stopped, DESIGN ONLY. No files or tests; notification/deadline/designer integration not implemented |
| Design export screen states | 01a0789b-7167-7673-b262-10838c7e2b98 | Stopped, REQUIREMENTS ONLY. No files or tests; Pageful source unresolved, external export destinations not implemented |

## Synchronization rules

- Preserve all concurrent work. Do not stage a broad dirty worktree or commit until owners confirm shared-file edits stopped.
- Only one full test/build run at a time; targeted owner checks may run while implementation continues.
- Brief's current sequence prepares first Copy and text-only campaign prompts; image generation remains explicit. Preserve effective-analysis/raw-source lineage when integrating Banners version changes.
- Treat prior pass counts as snapshots, never as certification of newer changes.
- Use isolated databases/assets and mock providers for workflow tests. The new default workflow launcher uses a unique test schema and temporary assets; do not use explicit live-demo targets for this verification.
- No paid-provider calls, real notifications, deployments, pushes, merges, or deletion of user campaigns.
- Review/Distribute acceptance covers their current implemented functionality, not design-only Approval or Pageful export proposals.

## Acceptance checklist — owner: Architecture & implementation

- [x] Collect final changed-file, contract, test and limitation handoffs; confirm all implementation owners idle.
- [x] Snapshot status/diffs and inspect shared schema, migrations, provider output, runtime projections and neighbor commands for contract mismatches.
- [x] Add focused unit regression tests for uncovered behavior; demonstrate failing tests before fixes.
- [x] Verify analysis → first Copy → prompt preparation without automatic images, refinement/retry, copy approval, and stale-source invalidation.
- [x] Verify explicit Visuals generation/upload, copy lineage, multi-design/multi-format Banners selection, Review version integrity and approved Distribute output.
- [x] Verify pending/error/empty states, navigation/draft persistence, role restrictions, stale revisions and idempotent retry across module boundaries.
- [x] Browser-test complete flow with isolated local mock data, including reload/recovery and desktop/mobile layouts; record actual evidence and limitations.
- [x] Audit canonical DS usage and unify existing controls, headings, spacing, loading/disabled/error patterns and keyboard behavior without redesigning the flow.
- [x] Run full unit/integration suite, application/docs build and relevant production checks after edits stabilize.
- [x] Obtain independent integration review, resolve findings and rerun affected checks.
- [x] Update architecture and handoff documentation with final evidence; commit verified in-scope changes, leaving unrelated edits intact.
- [ ] Mark goal complete, pause integration heartbeat and report commit, results and limitations.

## Verification baseline (not current acceptance)

Before newer Brief/Banners edits: own run 1,221 passing tests plus one intentionally red Brief integration test. Brief later reported 1,238 passing/12 failing during Banners migration edits. These are moving-worktree snapshots; no final integrated pass yet.

## Coverage inspection

- `src/studio/campaign/campaignChain.test.jsx` exercises real runtime/coordinator factories, but uses an in-memory API that replaces entire workspace fixtures. It does not prove production request/response contracts or persisted state through all six modules.
- `scripts/verify-brief-ui.mjs` provides real browser/API, isolated PostgreSQL schema and mock-provider coverage for creation, first drafts, inline edit, refinement and reload at 390/1440/2252 widths. It intentionally does not mount version/review/delivery/asset services and cannot cover the full workflow.
- `server/services/bannerBatch.integration.test.js` exercises approved Copy/Visuals pairs, batch persistence, immutable review and delivered PNG/ZIP contents through actual services, but bypasses the browser and frontend coordinator.
- `src/studio/campaign/testing/ModuleHarness.test.jsx` now verifies real refinement, prompt retry, bulk/image upload, Banners save/review and override interactions. Six missing harness callbacks were restored without production changes. Independent review approved; controller fresh run passed 22 harness/fixture tests.
- Read-only subagent `/root/integration_test_gap_audit` completed. Additional gaps: real Brief edit invalidating approved Copy → Visuals → saved batch; HTTP feedback → reopen → version 2 → current-only delivery; selection identity preservation across UI → batch route → persisted workspace → manifest; all-module responsive/keyboard/error-state QA.
- Harness repair completed under `2026-09-06-module-harness-interactions.md`; scoped implementation and independent review complete, awaiting integrated commit.

Next verification deliverable: an isolated full-service API fixture used by runtime integration tests and browser QA. Assert server-persisted results and downloaded bytes, not just mocked callback counts; keep real routes, schemas, authorization, coordinator and runtime, substituting only the paid generation provider and asset storage. Final testing waits for Banners and UI system stable handoffs.

Runtime HTTP integration assigned to `/root/runtime_http_tests` under `2026-09-06-runtime-http-integration.md`. Scope: new `server/testing/isolatedStudio.js` and `server/services/campaignRuntimeFlow.integration.test.js`, real six-step batch flow, feedback/v2, stale lineage and transport recovery. No production edits or full suite while owners finish.

UI audit context loaded once using Impeccable for CampaignPage. `DESIGN.md` is current app authority; `PRODUCT.md` still describes older Russian/frontend-only Lingu prototype and is not authority over newer user instructions. No product-document rewrite or redesign authorized by that stale context. Full technical/visual audit deferred until UI/Banners handoffs; no detector or screenshot polish pass has yet been spent by integration coordinator.

Read-only live DOM inspection of the existing campaign confirmed all six labelled module regions/H2s, canonical Banners tabs/panels, Copy approval controls and prompt/static/video Visuals structure. No campaign input, selection or generation was changed. This is not full-flow or responsive verification.

UI consistency candidate for regression test: `ModuleHost.jsx` renders Visuals operation errors while `VisualsModule.jsx` separately renders the same prepare-prompts error, causing duplicate alerts for one failed prompt request. Keep retry available while showing one clear error. Generic host progress is plain text although canonical `AsyncStatus` now exists; verify module-owned detailed progress before standardizing, to avoid duplicate loading messages. These findings are queued, not fixed or browser-error-state verified yet.

## Latest integration run

- Parent full `npm run test:run` (2026-09-06 23:51 local): **126 files / 1,275 tests passed; one new regression failed**. The failure is a genuine notes-only Brief → long generated headline → Banners renderer overflow, not a harness-only mismatch. Do not claim a green full suite yet.
- Browser QA uses disposable isolated schema and mock provider via test-only API 57127 / Vite 57128, owned Node PID 96260. Campaign `f48ca8fb-ae3e-4dfa-adca-f456e5bfa8a3`: first five Copy/three prompt-only directions, two approvals, two explicit linked images, two-design/two-size selection and confirmation verified. Review preparation exposed HTTP 500; no approval/delivery browser pass yet. Browser tab 4 is temporary. Close owned fixture with SIGINT to run its schema cleanup when finished; do not stop demo services.
- Fresh fixture reproduction traced `RendererError: Slot headline exceeds its line limit`. Banners owner is repairing exact renderer preflight before persistence and typed actionable validation errors, preserving text and selections. Tests include the failing regression; owner and parent test agent must synchronize final error contract.
- HTTP integration independent reviewer requested stronger persisted ready/delivered history payload assertions; implementer added them. Final re-review remains pending after overflow repair/test synchronization.
- Mobile 390px Banners measured no horizontal page overflow; all six module H2s share 24px responsive size. This is partial responsive evidence, not complete QA. Duplicate alerts across Banners/Review were visible for the failed handoff; module error ownership remains under review.
- Banners owner additionally observed mobile expanded timeline scroll landing below its target. Parent assigned regression-first feedback/navigation hardening under `2026-09-06-module-feedback-hardening.md` to `/root/module_feedback_hardening` (no Banners/backend scope).

### Continuation handoff (2026-09-07 00:00 local)

- Banners owner has accepted and is implementing the exact-renderer preflight repair. Expected result: `saveBannerBatch` rejects unrenderable content with `400 invalid_composition`, design/template/ratio/slot details, before persistence; residual renderer failures during version creation also become actionable. No truncation or automatic typography changes. Parent owns synchronizing the fourth HTTP regression to rejection + successful recovery after the owner reports stable.
- `/root/review_runtime_http` approved helper and original three HTTP scenarios after strengthened post-delivery histories. Fourth notes-only regression intentionally remains red until repair. No final integrated pass.
- `/root/module_feedback_hardening` completed ModuleHost/CampaignTimeline fixes plus tests; parent fresh focused run **3 files / 16 tests passed** at 23:58. Scoped reviewer `/root/review_module_feedback` is pending. Tests currently mock registry for host behavior; reviewer must assess sufficient real-module loading/error coverage.
- Temporary browser QA fixture PID 96260 was stopped with SIGINT. Verified process exited and **zero `runtime_flow_*` schemas remain**. Only disposable test data was removed; no user campaigns changed. Ports 57127/57128 are no longer valid. Tab 5 closed; closing stalled tab 4 timed out (temporary unmarked tab cleanup may close it at turn end).
- Browser control became unreliable after viewport reset: existing tab timed out, and fresh tab filled input but click/keyboard submission did not change state. No app console error observed. Do not label this an app defect without reproducing. Start a fresh isolated fixture and browser tab after code stabilizes; no need to reuse stale URLs.
- UI system confirmed idle through task snapshot cursor `e0e67a9d-3b73-48d4-a965-dd0f2edcfa1c:4`; current DESIGN.md remains visual authority. Preserve TokenCopyTarget changes.
- Next: collect Banners repair result; update/review HTTP regression; resolve feedback review; run final complete suite/build/production artifact checks; fresh isolated full browser approval/distribution and responsive/keyboard checks; independent whole-integration review; scoped commit. Keep heartbeat/goal active until these actually finish.
- Feedback reviewer returned important findings: blanket Visuals-owned progress suppresses status for prepare-prompts/upload/select; upload/image errors can still duplicate host and local alerts. `/root/module_feedback_hardening` was reactivated to make ownership action-specific with real host+Visuals tests, plus retry/keyboard/disabled-step coverage. Earlier 16-pass snapshot is not final acceptance of that fix. Reviewer confirmed timeline collapse ordering itself sound.

### Remaining original architecture acceptance (continuation)

- Original architecture Tasks 10–11 were explicitly unfinished, not merely optional followups: safe default workflow runner, dev-only playground, near-viewport activation and measured loading, team module docs. New continuation plans `2026-09-07-isolated-workflow-runner.md` and `2026-09-07-module-debugging-handoff.md` preserve these requirements.
- Banners source now stopped; final handoff `2026-09-07-banner-selection-handoff.md`. Parent HTTP run **4/4 passed** at 00:05; independent reviewer approved all four scenarios, including exact early overflow rejection and fitting-content recovery without truncation.
- Task 10 runner implemented by `/root/isolated_workflow_runner`: safe disk-backed isolated startup, default `test:workflow` replacement, current approval/Visuals/batch workflow and tests. Owner reported 2 isolation +31 route tests and successful workflow/cleanup. Parent found empty-host URL could inherit remote `PGHOST`; owner is repairing this guard with regression tests and adding failed-startup cleanup coverage before independent review. Do not call Task 10 finally accepted yet.
- Feedback's fresh review still found immediate idle-snapshot upload errors duplicated. Root and implementer agreed to consolidate transient Visuals error/target state in VisualsModule and remove View/Host competing ownership, with persisted runtime fallback and stale async protection. `/root/module_feedback_hardening` is analysis-only, awaiting parent go after Task 10 implementation stops. Do not run repeated exception-only patch loops.
- Parent baseline `npm run build` and `npm run verify:production` passed; this validates generated assets/container configuration, not a deployed container. Baseline entry/chunks recorded in `2026-09-07-module-loading-measurements.md`; VitePress large-chunk advisory remains. No final performance improvement claim.
- Added team `docs-site/campaign-modules.md`, linked docs navigation, corrected outdated eight-step workflow text and README ownership. Playground/default-runner statuses remain explicitly pending in docs until verified.

### Fresh acceptance snapshot (2026-09-07 00:21 local)

- Parent full `npm run test:run`: **130 files / 1,298 tests passed**, exit 0, 70.61 seconds. This supersedes the earlier red full-run baseline, but Task 11 implementation/browser acceptance remains unfinished.
- Parent focused feedback/runner run: **6 files / 43 tests passed**. Independent feedback reviewer approved cohesive single-owner Visuals errors (including immediate returned/thrown errors, remount, missing targets, stale async attempts, retry/reconcile) and timeline collapse ordering; reviewer selected 6 files / 41 passing tests.
- Parent `TEST_DATABASE_URL=postgresql:///banner_studio_test npm run test:workflow`: delivered, ZIP 40,790 bytes with SHA-256 reported, exit 0. Synthetic resources cleaned by runner, no demo records changed.
- Task 10 independent review accepted runner/guard/cleanup/CLI implementation and found one P2 in the failed-startup test: global temp-directory set comparison races unrelated concurrent runs. Owner is scoping that assertion to its own invocation before acceptance.
- Task 11 preflight/ledger/brief prepared under `.superpowers/sdd/2026-09-07-module-debugging-handoff/`; playground implementation not yet dispatched. No completed task is being restarted.

### Browser and Task 11 continuation (00:30 local)

- Task 10 cleanup assertion was scoped to its own temporary parent; independent re-review approved. Parent focused runner/playground/harness/App run: **6 files / 44 passed**, exit 0. Task 10 is accepted; no user/demo data touched.
- Playground Task 1 implemented, scoped reviewer requested a valid historical-template mock and stronger real overlay/navigation assertions. Owner is fixing these before acceptance. No activation changes yet.
- Current disposable browser fixture: Node PID **4380**, exec session **39033**, API **63901**, UI **57128**; schema `campaign_modules_test_5d3f1256d58a4ae6bce866c867ec610c`. Close this exact PID with SIGINT when finished; cleanup removes only its synthetic data/assets. User demo remains API 3010 / UI 5176.
- Browser campaign `6e2292c5-3774-4634-afd6-90a06529e2e6`: notes-only Brief → five Copy/three prompts → approve option 5 → generate linked image → select Product spotlight/square → review v1 → switch designer → request changes, verified visibly and server revision 6. Marketer sees waiting state before feedback, designer sees checklist/change form. Mock text is intentionally synthetic, not a production AI-quality claim.
- Browser reopen activation stalled with no request/error/state change across semantic click, keyboard, fresh tabs, accessibility and coordinate fallback. Read-only diagnosis found live wiring intact; focused 4 files / 54 tests passed including app-level reopen→API→refresh. This is not a confirmed app bug and not a completed browser revision loop. No API mutation was used to bypass this browser acceptance gap.
- Browser tabs 6/7/8 are temporary fixture tabs. CUA session reset; current binding `reviewTab` is tab 8. Temporary viewport was reset. Partial 1440/390 measurements showed scrollWidth equals clientWidth (1428 and 378 CSS px respectively), but full responsive/keyboard acceptance remains pending.

### Final verification work (00:44 local)

- Playground and module-loading implementation/reviews accepted. Parent post-loading app/docs build passed; actual emitted chunk/entry comparison and fixture exclusion recorded in `2026-09-07-module-loading-measurements.md`. No browser speed claim.
- `/root/connected_review_flow` is implementing the final real ConnectedStudio→HTTP→DB designer-feedback/marketer-reopen/v2-delivery regression under `2026-09-07-connected-review-flow.md`. This supplements, rather than replaces, pending physical-browser verification. No other implementation agent is active.
- Browser control failure also reproduced on the fixture playground's operation selector; scoped read-only diagnosis found no Review wiring defect. Temporary production preview PID 5684 was stopped after confirming production sign-in remains required; no demo bypass was introduced. Main QA fixture PID 4380 still active.
- Known final-review handoff item from UI-system owner: market-combobox positioning exists only as `.system-screen--v2 .v2-combobox` in `src/styles/design-system.css`, not in extracted standalone `src/styles/app-controls.css`. Owner validation doc identifies this P2 extraction issue; final integration review/fix wave must reconcile it and stale validation wording. Do not silently omit it.
- README/team docs now document real playground URLs, scoped isolated CLI, sticky activation and measurement limits. Final broad review, final full suite, physical browser loop and commit remain pending.

### Latest full-suite checkpoint (00:48 local)

- Parent `TEST_DATABASE_URL=postgresql:///banner_studio_test npm run test:run`: **136 files / 1,336 tests passed**, exit 0, 69.52 seconds. `npm run verify:production` passed (41 SPA / 80 docs assets and container configuration); this is not a live container/deployment test.
- Parent new connected UI/HTTP test: **2/2 passed**. Scoped review verified the real flow and ZIP/history assertions, but required exact restoration of temporary jsdom global/prototype property descriptors. Owner is making this test-isolation-only fix, then re-review and final suite must follow. No production defect was found in reopen.
- Production code is otherwise stable; no owner is making business-function changes. Final broad reviewer should also assess the inherited standalone combobox CSS issue and current Copy approval request-boundary coverage (the new controlled measurement currently exercises legacy `selectCopy`, not the live approval button).

### Final review handoff (00:51 local)

- Connected UI/HTTP regression accepted after exact global-descriptor cleanup and proof; owner final **3/3 passed**, scoped re-review approved. No production reopen bug found. All implementation agents stopped.
- QA fixture PID 4380 stopped via SIGINT, verified its exact schema absent and asset directory removed. Only synthetic test data was removed. Production-preview PID 5684 was already stopped. No parent QA servers remain; user's API 3010/UI 5176 untouched.
- Temporary tabs 7–10 closed; closing stalled tab 6 timed out and turn cleanup may remove it. No deliverable/handoff mark was applied. Viewport override was reset before cleanup.
- Next: broad integration review of the complete uncommitted worktree, one consolidated fix wave including verified handoff issues, scoped re-review, fresh full suite/build/isolated workflow, final docs and commit. Physical browser end-to-end/large-responsive checks remain a disclosed tool limitation, not a code pass.

### Final review and consolidated fix wave (01:00 local)

- Parent full suite after connected-test cleanup: **136 files / 1,337 tests passed**, exit 0, 70.17 seconds. Fresh isolated CLI also delivered a verified 40,769-byte ZIP, exit 0. These are pre-final-fix checkpoints.
- Broad final review requested two P2 corrections: invalidating a saved multi-design batch when a secondary referenced Copy/image is deleted/replaced, and resetting duplicated analyzed briefs that otherwise lack new-campaign analysis provenance. Existing source checks fail closed, so neither finding establishes corrupt approved output or a permission bypass.
- `/root/final_integration_fix` owns one consolidated regression-first fix wave, including live Copy Approve request-count coverage and accurate DS validation wording. No other implementation agent is active. Full broad review and fix brief are retained under this plan's ignored review workspace until completion.
- The combobox catalog already has scoped positioning; standalone extraction remains deferred. No unused global selector or speculative component promotion is required. The historical empty ReviewStage warning is not a defect in the current six-module route.
- Fresh physical-browser retry on the fixture-only Copy playground again returned a click without opening the operation selector. No user campaign or API state was changed. Comprehensive physical-browser acceptance remains pending; connected UI/HTTP tests do not certify that separate layer.

### Verified integration checkpoint (7 September, final fix accepted)

- Parent final suite: **136 files / 1,340 tests passed**. App/docs build, production artifacts/configuration, and isolated delivered ZIP all passed. Exact results and limits: [integration verification](2026-09-07-integration-verification.md).
- Final scoped re-review accepted both P2 corrections, live Copy approval request-count coverage and DS documentation reconciliation; no new breakage. The review's nonblocking inventory observation concerned this parent-owned ledger edit, not an omitted implementer production change.
- All source owners and the final fixer are stopped. The local verified integration can be committed as a checkpoint; full physical-browser acceptance and goal completion remain open. No push/merge/deployment is authorized by this checkpoint.

### Final browser closeout — 7 September

- Continued the same disposable campaign through marketer reopen, two-format version 2, designer checks, independent marketer approval, delivery and actual browser download. ZIP files/hashes/dimensions and campaign/version identity verified. Full evidence and requirement audit are in [integration verification](2026-09-07-integration-verification.md).
- Inspected all six module layouts at 2252/1440/390px. Verified keyboard step navigation, Copy preview Escape/focus return, Banners arrow-key tabs, mobile timeline selection/collapse, drawer Escape/focus return, and delivered-state reload. Isolated Visuals failure shows one alert and records retry/reconcile commands.
- Two bounded styling fixes: count/action gap and wrapping in the Visuals toolbar; canonical control scope on the DEV playground. Browser assertions failed before and passed after each fix. No business behavior changed.
- Fresh full suite: 136 files / 1,340 tests; focused follow-up: 3 files / 35 tests. App/docs build, production artifacts, fixture exclusion and isolated workflow passed. Exact package and measurement details are in the evidence documents.
- Owned browser fixture PID13618 closed cleanly; exact schema and temporary assets verified absent. QA tabs closed, viewport reset, downloaded QA ZIP retained. User demo untouched. Final closeout commit and goal/heartbeat transition follow this recorded acceptance; git history and task state are authoritative.
