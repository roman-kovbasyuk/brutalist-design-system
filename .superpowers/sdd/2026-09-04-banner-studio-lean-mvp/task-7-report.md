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
| `GET` | `/api/v1/templates` | invited actor | — |
| `GET` | `/api/v1/templates/:templateId/versions` | invited actor | — |
| `GET` | `/api/v1/templates/:templateId/versions/:version` | invited actor | — |
| `POST` | `/api/v1/templates` | Admin | immutable version creation |
| `GET` | `/api/v1/settings` | invited actor | response ETag |
| `PATCH` | `/api/v1/settings` | Admin | required quoted integer `If-Match`; response ETag |
| `POST` | `/api/v1/invitations` | Admin | service-generated ID and seven-day expiry |
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

`createIdempotencyService` provides:

- required visible-ASCII keys of 1–255 characters;
- persistent scope `(actorId, method, resourceId, key)`;
- canonical JSON SHA-256 payload fingerprints;
- one persistent owner claim;
- stored status/body completion and same-fingerprint replay;
- `409 idempotency_conflict` for changed payloads;
- injected-clock/injected-wait polling with a bounded timeout for concurrent callers;
- deterministic `failed` persistence and same-fingerprint ownership retry after owner failure.

Migration `003_retryable_idempotency.sql` adds the constrained failed lifecycle. PostgreSQL integration verifies that changed fingerprints remain conflicts while the same fingerprint can reclaim a failed record and complete it.

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
