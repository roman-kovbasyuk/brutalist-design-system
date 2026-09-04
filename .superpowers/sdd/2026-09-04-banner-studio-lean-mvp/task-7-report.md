# Task 7 Report — Campaign, Template, Invitation/User, and Settings API

## Status

Implemented the Task 7 backend/shared scope and prepared it for commit as `feat: expose persistent campaign workflow API`.

No React components, screens, styles, or documentation-site code were changed.

## Delivered API

All routes are versioned under `/api/v1` and are registered through `buildApp` only when both the actor resolver and workflow service are injected. There is no anonymous or header-based actor fallback.

| Method | Route | Access | Concurrency |
| --- | --- | --- | --- |
| `GET` | `/api/v1/campaigns` | invited actor | — |
| `POST` | `/api/v1/campaigns` | Marketer/Admin | response ETag |
| `GET` | `/api/v1/campaigns/:campaignId` | invited actor | response ETag |
| `PATCH` | `/api/v1/campaigns/:campaignId` | Marketer/Admin | required quoted integer `If-Match`; response ETag |
| `DELETE` | `/api/v1/campaigns/:campaignId` | Marketer/Admin | required quoted integer `If-Match`; soft archive; `204` + response ETag |
| `GET` | `/api/v1/templates` | invited actor | — |
| `GET` | `/api/v1/templates/:templateId/versions` | invited actor | — |
| `GET` | `/api/v1/templates/:templateId/versions/:version` | invited actor | — |
| `POST` | `/api/v1/templates` | Admin | immutable version creation |
| `GET` | `/api/v1/settings` | invited actor | response ETag |
| `PATCH` | `/api/v1/settings` | Admin | required quoted integer `If-Match`; response ETag |
| `POST` | `/api/v1/users/invitations` | Admin | service-generated ID and seven-day expiry |
| `POST` | `/api/v1/users/:userId/disable` | Admin | explicit command |

Campaign PATCH is a strict `title`/full-`brief` payload. Unknown keys—including status, selections, versions, review/delivery data, open-version fields, and composition/template/slot fields—return `400 invalid_request`. Module 1 exposes no generic action, generation, arbitrary review-event, or delivery route.

## Shared contracts and errors

- Added strict Zod request/response schemas for campaigns, templates, invitations, users, settings, and normalized API errors.
- Invitation email input is trimmed and lowercased by the shared contract.
- Missing `If-Match` returns `428 precondition_required`; malformed unquoted/non-integer values return `400 invalid_if_match`; stale writes return `409 revision_conflict`.
- Exposed errors use `{ code, message, details?, requestId }`. Unexpected repository/database errors remain `500 INTERNAL_ERROR` with no database message or stack disclosure.

## Workflow service

`createWorkflowService` owns campaign, settings, template, invitation, and user commands. Campaign commands follow the required order inside one transaction:

1. lock/load;
2. validate expected revision;
3. validate the command;
4. persist the new state;
5. append the audit event;
6. return the persisted state.

Settings updates and user disable commands use the equivalent lock-first transaction boundary. Template creation, invitations, campaign creation, settings changes, user disable, and campaign commands append audit records in their transaction. Audit IDs and timestamps come from the service's injected ID generator and clock, never request payloads.

## Reusable idempotency

`createIdempotencyService` provides a database-only `executeDatabaseCommand` boundary:

- required visible-ASCII keys of 1–255 characters;
- persistent scope `(actorId, method, resourceId, key)`;
- canonical JSON SHA-256 payload fingerprints;
- one short, committed, leased owner claim;
- a row-locked owner transaction that runs the domain write on the supplied PostgreSQL client and stores status/body before the same commit;
- owner-token fencing, expired/failed lease recovery, and guarded best-effort failure marking;
- stored status/body completion (including JSON null) and same-fingerprint replay;
- `409 idempotency_conflict` for changed payloads;
- injected-clock/injected-wait polling with a bounded timeout for concurrent callers;
- rollback of both the domain write and response completion when either part fails.

Migration `003_retryable_idempotency.sql` adds the constrained failed lifecycle. Forward migration `004_crash_safe_commands.sql` adds lease expiry and campaign archival. PostgreSQL integration verifies changed-payload conflict, failed and expired lease reclaim, old-token fencing, row-lock protection against concurrent takeover, completion-failure rollback, JSON-null replay, and replay after the caller loses a committed response.

This helper must not wrap paid-provider calls. Task 9 must use the persisted generation-job recovery protocol for those external side effects.

Ordinary campaign, template, and settings operations do not require idempotency keys.

## Persistence checkpoint

The PostgreSQL checkpoint test uses only `postgresql:///banner_studio_test` and verifies:

1. create a campaign through HTTP (`201`, ETag `"0"`);
2. close the app and pool;
3. construct a new pool, service, and app;
4. reload the campaign through HTTP;
5. execute a service-only mock transition from `draft` to `copy_ready`;
6. reject a stale HTTP PATCH with `409 revision_conflict`;
7. read the persisted audit history.

The asserted transition audit row is equivalent to:

```json
{
  "action": "campaign.mock_transition",
  "beforeStatus": "draft",
  "afterStatus": "copy_ready",
  "payload": { "checkpoint": true }
}
```

It is followed by the earlier persisted `campaign.created` row when read in reverse chronological order.

## TDD and verification

Red tests were observed before implementation for shared contracts, route registration/behavior, workflow ordering, idempotency service behavior, and the PostgreSQL failed-record lifecycle.

Final verification performed before the commit:

- `TEST_DATABASE_URL=postgresql:///banner_studio_test npm test -- --run server shared`
  - 9 test files passed
  - 129 tests passed
- `npm run build`
  - exit 0
  - Vite application build succeeded
  - VitePress build succeeded

The build retains the pre-existing VitePress chunk-size advisory; it does not fail the build.

## Concerns and handoff

- `server/start.js` intentionally does not inject an actor resolver or workflow service yet. Consequently, production startup exposes only the existing health/readiness shell until Task 8 wires authentication and its persistent actor resolver. This preserves the explicit no-insecure-fallback requirement.
- The public `executeCampaignCommand` service method exists for later narrow paid/version/review/delivery commands, but Task 7 registers no HTTP endpoint for it.
- Template identity (`id`, `version`, and `name`) must match its immutable manifest; the service computes the canonical manifest hash.

## Fix round 1 — crash safety and review findings

### Root causes addressed

- Domain operations previously ran before a separate completion write, so a completion failure could leave a committed domain change with no replay record.
- In-progress records had no lease, so process death could leave permanent ownership.
- PostgreSQL received JavaScript `null` as SQL NULL rather than JSONB `null`.
- Campaign callbacks received the locked object directly, so mutation could corrupt `beforeStatus`; returned campaign identity/state was not fenced.
- Success responses were declared in shared schemas but not validated before transmission.
- Campaign deletion and the documented nested invitation route were missing.

### Exact RED evidence

- `npm test -- --run server/routes/routes.test.js shared/contracts.test.js`
  - 4 failures observed before route/contract fixes:
  - campaign DELETE returned `404` instead of required `428` without `If-Match`;
  - `/api/v1/users/invitations` returned `404` instead of reaching role authorization;
  - response drift returned `200` instead of failing closed with `500`;
  - campaign response schema rejected the new `archivedAt` contract.
- `npm test -- --run server/services/workflowService.test.js`
  - 2 failures observed before workflow fixes:
  - callback mutation changed audit `beforeStatus` from `draft` to `copy_ready`;
  - `archiveCampaign` did not exist.
- `TEST_DATABASE_URL=postgresql:///banner_studio_test npm test -- --run server/repositories/repositories.integration.test.js -t "reclaims expired leases|row locking prevents|rolls domain writes back|persists JSON null|replays a committed response|soft-archives"`
  - 6 targeted failures observed before persistence/service fixes:
  - DELETE was missing;
  - expired claims were not reclaimed;
  - owner row locking did not exist;
  - the service had no transactional database-command API;
  - null replay and committed-response-loss replay could not execute under the required boundary.

### Focused GREEN evidence

- `TEST_DATABASE_URL=postgresql:///banner_studio_test npm test -- --run server/repositories/repositories.integration.test.js -t "reclaims expired leases|rolls domain writes back|persists JSON null|replays a committed response"`
  - 4 passed, 33 skipped.
- `TEST_DATABASE_URL=postgresql:///banner_studio_test npm test -- --run server/repositories/repositories.integration.test.js -t "row locking prevents"`
  - 1 passed, 36 skipped.
- `npm test -- --run server/services/idempotencyService.test.js`
  - 6 passed.
- `npm test -- --run server/routes/routes.test.js server/app.test.js`
  - 19 passed.
- `npm test -- --run server/services/workflowService.test.js shared/contracts.test.js`
  - 24 passed.
- `TEST_DATABASE_URL=postgresql:///banner_studio_test npm test -- --run server/repositories/repositories.integration.test.js`
  - 37 passed.
- `TEST_DATABASE_URL=postgresql:///banner_studio_test npm test -- --run server/repositories/repositories.integration.test.js -t "reclaims expired leases"`
  - RED follow-up: persisted `leaseExpiresAt` mapped as `undefined`, proving polling could not observe expiry through `find`.
  - GREEN after selecting/mapping `lease_expires_at`: 1 passed, 36 skipped.

### Fix details

- Added forward migration `004_crash_safe_commands.sql`; prior migrations remain unchanged. It persists lease expiry and a unique owner-token index as well as campaign archival.
- Campaign DELETE performs a revision-checked soft archive, increments revision, appends `campaign.archived`, returns no body, and preserves campaign/version/audit rows. Archived campaigns are excluded from list and direct GET returns 404.
- Invitation creation moved to `POST /api/v1/users/invitations`; the former top-level route is not registered.
- Every Task 7 success response is parsed through its strict shared response schema with the server request ID before transmission. Schema drift produces a generic non-leaking 500.
- Campaign callbacks receive deep clones. Locked state and callback output are strict-validated, identity cannot change, repository writes and audit entities use the locked ID, and persisted output is revalidated.
- Leased idempotency claims are committed separately. Owner execution locks and verifies the token/fingerprint/lease, runs database-only work on the transaction client, and stores the response in that transaction. Completion failure rolls back domain work; guarded failure marking and lease expiry provide recovery.

### Fix-round final verification

- `TEST_DATABASE_URL=postgresql:///banner_studio_test npm test -- --run server shared`
  - 9 test files passed.
  - 139 tests passed.
- `npm run build`
  - exit 0.
  - Vite application and VitePress builds succeeded.
  - The pre-existing chunk-size advisory remains non-fatal.

## Fix round 2 — bounded lease recovery

### Root cause

The expired/failed reclaim branch used a normal `UPDATE`. When the original owner still held `FOR UPDATE`, PostgreSQL waited on that row lock inside `coordinator.claim`. That wait occurred outside the service polling loop, so the injected clock, wait function, and deadline could not bound request latency.

### Exact RED evidence

- `TEST_DATABASE_URL=postgresql:///banner_studio_test npm test -- --run server/repositories/repositories.integration.test.js -t "bounds expired-lease recovery"`
  - 1 failed, 36 skipped.
  - The real PostgreSQL contender reached the conservative 750 ms wall-clock ceiling while the owner transaction still held the expired row lock, producing `{ kind: "wall_clock_ceiling" }` instead of `409 idempotency_in_progress`.

### Fix

- Reclaim now selects only an expired/failed candidate with `FOR UPDATE SKIP LOCKED` and updates only that selected scoped row.
- A locked candidate is skipped immediately; a final non-locking read preserves completed replay/conflict semantics and otherwise returns deterministic `in_progress`.
- The service polling loop remains the sole owner of wait/deadline behavior. No additional unbounded row-lock acquisition was added to reclaim.
- The integration test keeps the owner transaction open past lease expiry, verifies the contender resolves with bounded `409 idempotency_in_progress` while the lock is still held, commits the owner's stored response, and then verifies normal replay without running the contender operation.

### GREEN evidence

- `TEST_DATABASE_URL=postgresql:///banner_studio_test npm test -- --run server/repositories/repositories.integration.test.js -t "bounds expired-lease recovery"`
  - 1 passed, 36 skipped.
- `TEST_DATABASE_URL=postgresql:///banner_studio_test npm test -- --run server/repositories/repositories.integration.test.js -t "idempotency coordination"`
  - 9 passed, 28 skipped.
- `npm test -- --run server/services/idempotencyService.test.js`
  - 6 passed.
- `TEST_DATABASE_URL=postgresql:///banner_studio_test npm test -- --run server shared`
  - 9 test files passed.
  - 139 tests passed.
- `npm run build`
  - exit 0; Vite and VitePress builds succeeded.
  - The existing chunk-size advisory remains non-fatal.
