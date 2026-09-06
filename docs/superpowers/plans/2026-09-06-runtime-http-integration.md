# Campaign Runtime HTTP Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Verify the real module runtime, API adapter, HTTP routes and persisted six-step workflow together, including feedback and stale-source boundaries.

**Architecture:** A test-only isolated PostgreSQL schema, full Fastify service composition and in-memory private asset store host actual production routes. The existing deterministic mock generation provider replaces paid AI; real frontend commands use createStudioApi against an ephemeral loopback server. No production behavior is replaced by workspace fixtures.

**Tech Stack:** Vitest, Fastify, PostgreSQL, real createStudioApi/createCampaignRuntime/createWorkflowCoordinator, mock generation provider.

**Spec:** `docs/superpowers/plans/2026-09-06-integration-handoff.md` and the approved six-module workflow.

## Global Constraints

- Edit only new test/helper files named below and this task's report. No existing production module, backend, schema or owner files.
- Use `TEST_DATABASE_URL` or `postgresql:///banner_studio_test`, unique UUID-derived `runtime_flow_` schemas, real migrations and isolated storage. Never target the demo database or paid providers.
- Validate the generated schema name before cleanup; clean only this test's schema and resources in finally, even when assertions fail.
- No full suite, paid calls, notifications, deploy, git stage/commit or subagents. Focused tests only; controller owns integration commit/review.
- Tests assert independently derived persisted outcomes, not mocks echoing expected results. Simulate network faults only at transport after a real server response.

### Task 1: Real HTTP workflow coverage

**Files:**
- Create: `server/testing/isolatedStudio.js`
- Create: `server/services/campaignRuntimeFlow.integration.test.js`

**Interfaces:**
- Helper `createIsolatedStudio()` returns `{ pool, url, actor(role), api(role), close }`. Roles are marketer/designer/admin with seeded isolated users; API uses actual `createStudioApi` and a test-only identity header resolved by the injected actor resolver. All production role middleware remains active.
- Mount real workflow, generation, workspace, version, review, delivery, asset and visual-upload services through `buildApp`; same memory asset store across services. Seed current `studioTemplates` via admin workflow service.
- Test connects with `createCampaignRuntime({api, actor, templates, workspace})` and `createWorkflowCoordinator({runtime})`; use actual refresh/history reads when switching roles.

- [ ] Implement test fixture resource lifecycle from the existing `scripts/verify-brief-ui.mjs` isolation pattern, adding complete services using `server/bootstrap.js` as wiring evidence. Bind loopback port 0. Seed sufficient mock test budget, never production settings.
- [ ] Write a complete-flow test. Create a campaign via real API with a valid text brief. Submit via coordinator; assert exactly five initial candidates, three pending prompts, no image job/asset. Dispose/reconnect and resume initial drafts; assert no duplicate jobs. Approve two Copy candidates through commands. Explicitly generate selected-copy Visuals, assert two ready linked directions. Save a two-design/two-format batch through `banners.saveBatch`; assert exact source IDs and ratio IDs in persisted composition. Confirm through `banners.prepareReview`, assert immutable version 1 has four render PNG assets. Assert marketer cannot mark-ready and cannot distribute before approval.
- [ ] Extend that flow with designer `requestChanges('Use the alternate layout')`, marketer reopen, a changed batch selection and version 2, designer mark-ready using HTTPS Figma URL and all three true checklist answers, marketer approval and distribution. Assert v1 content/hash unchanged, histories remain version-scoped, delivery references v2, and ZIP bytes/hash and manifest contain exactly the selected design×format outputs. A reconnected runtime must download the same delivery. Reject attempting to deliver v1.
- [ ] Add a separate stale-source case: analyze, approve, explicitly generate a linked image, save batch, then edit/refine Brief through its command. Assert old copies, directions and composition cannot be used for review; old captured input keys fail safely. Regenerate/approve/rebuild current sources and assert progress can resume.
- [ ] Add a transport recovery case if not already covered by these flows: allow a real mutation to finish, simulate one lost response at fetch boundary, then retry through runtime with original intent. Assert persisted job/output count does not increase and the operation reconciles. No stubbed service/workspace transitions.
- [ ] Run `npm test -- --run server/services/campaignRuntimeFlow.integration.test.js`. Record every failure as fixture/selector mismatch versus genuine production integration defect. Do not weaken expected behavior to make tests pass. Escalate production defects to controller with exact reproducer; do not edit active owners' source.
- [ ] Self-review fixtures/cleanup and report commands, results, file list and limitations to the controller. No commit; independent task review follows.
