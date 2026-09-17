# External change protocol v2 — agent-agnostic

**Status:** Design accepted by the owner, 17 September 2026. Not implemented. Extends [the v1 design](2026-09-15-external-change-protocol-design.md); v1 behaviour stays in force until v2 ships.

**Consumer spec:** Automation Studio `docs/specs/design-system-integration.md` (branch `docs/design-system-integration`).

## Why v2

The v1 pipeline already provides strong guarantees that do not depend on the agent: an isolated candidate worktree, a changed-paths check, full verification by the worker, checksummed packages and restore on failed adoption. Five problems remain:

1. **Agent lock-in.** `scripts/changes/agent.mjs` builds Codex-specific arguments (`exec --cd --sandbox workspace-write --output-schema --output-last-message`). `agentExecutable` can be changed but the arguments cannot. The prompt assumes the Observatory CLI. There is no `CLAUDE.md`, so Claude Code does not load `AGENTS.md` automatically.
2. **Incompatible adoption.** `scripts/changes/app-update.mjs` installs `file:<absolute package path>` into the app. Automation Studio requires `file:vendor/<artifact>` plus `vendor/brutalist-design-system.json` provenance and rejects anything else in `npm run design-system:check`. Absolute paths also break other machines, Docker and CI.
3. **Local-only releases.** The worker promotes to local `main` and never pushes. Automation Studio's updater builds from `main` on GitHub, so it cannot see pipeline releases.
4. **Allowed-paths mismatch.** The prompt allows `src/atomic/**`, focused tests, `fixtures/atomic-consumer/**` and `docs/guides/component-usage.md`, but `allowedPath()` in `worker.mjs` accepts only `src/atomic/`. Legitimate fixture or guide edits are rejected.
5. **Thin requests and no breaking-change control.** Requests carry only four fields, and every request is approved automatically, including API removals.

## Goals

- Any agent (Codex, Claude Code, others) or a person can implement a request.
- Guarantees stay in the pipeline and do not depend on the implementer.
- One install path per consuming application, owned by that application.
- Releases are reproducible on any machine.
- Breaking changes require the owner's approval; additive changes stay automatic.

## Non-goals

- Hosted API, multi-tenant queue or npm publishing.
- Multiple configured applications (still one).
- Changing the atomic layer rules.

## Roles

| Role | Responsibility |
| --- | --- |
| **Requester** | The configured application (its agents or people) submits and reads requests. |
| **Queue and worker** | This repository. Stores requests, prepares candidates, enforces guards, releases. |
| **Implementer** | Any agent or person, through pull mode or a push adapter. Edits the candidate only. |
| **Adopter** | The application's own install command, invoked by the worker. |
| **Owner** | Approves breaking changes. |

## Request (v2)

```json
{
  "schemaVersion": 2,
  "requestId": "as-routed-steps-001",
  "installedVersion": "0.1.0-atomic.0",
  "component": "WorkflowSteps",
  "change": "Support steps rendered as links for routed navigation.",
  "changeType": "additive",
  "acceptanceCriteria": [
    "A step with href renders as a link and keeps aria-current on the current step.",
    "Disabled steps are not focusable links and announce their disabled state."
  ],
  "consumer": {
    "application": "automation-studio",
    "usage": "Four-stage asset creation flow navigation at /mvp/campaign/:id"
  },
  "accessibility": "Keyboard and screen-reader behaviour of links; visible focus."
}
```

- Requests without `schemaVersion` are validated as v1 and remain accepted.
- `changeType` is the requester's declaration; the worker's detection result wins.
- Limits: `acceptanceCriteria` 1–10 items of up to 500 characters; `consumer.usage` and `accessibility` up to 1,000 characters. Unknown fields are rejected.
- Idempotency is unchanged: the same ID and payload return the existing request; a different payload with the same ID is a conflict.

## States

```text
queued → awaiting-implementation (pull) ─┐
       → implementing (push adapter) ────┴→ verifying → [needs-approval] → packaged
       → releasing (promote main, push main + tag) → released → adopting → adopted
Any state → failed (with a specific error); adoption failure leaves the release available.
```

## Implementation modes

### Pull mode (default)

The request waits in `awaiting-implementation` with a prepared candidate worktree.

| Command | Result |
| --- | --- |
| `changes list --status awaiting-implementation` | Requests available to claim |
| `changes claim <id> --by <name>` | Claim record, candidate worktree path, prompt file path, result file path |
| `changes submit <id>` | Implementer has written the result file; the worker continues with `verifying` |
| `changes release-claim <id>` | Returns the request to the queue |

Claims do not expire. A claimed request stays with its claimant until it is submitted or released with `changes release-claim <id>`; `changes list` shows who holds each claim and since when. After a release, the candidate worktree is preserved; the next claimant may continue or reset it.

### Push adapters (optional)

The configuration selects one adapter:

```json
{ "agent": { "adapter": "codex", "timeoutMs": 1800000 } }
{ "agent": { "adapter": "claude", "timeoutMs": 1800000 } }
{ "agent": { "adapter": "command", "command": ["my-agent", "--dir", "{worktree}", "--prompt", "{promptFile}"], "timeoutMs": 1800000 } }
```

- `codex`: the current v1 invocation.
- `claude`: Claude Code in non-interactive print mode, with editing permitted only inside the candidate worktree. Exact flags are fixed and tested during implementation.
- `command`: any executable; placeholders `{worktree}`, `{promptFile}`, `{resultFile}`, `{timeoutMs}`.

### Adapter contract

**Input:** candidate worktree path, prompt file (instructions template plus request data), result file path, the allowed-paths list, timeout.

**Output:** the result file, validated by `agent-result.schema.json` (`outcome`, `summary`, `error`). A missing or invalid result file is a failure.

The worker never trusts the result. After every implementation, by any mode, it runs the same guards.

## Guards (independent of implementer)

1. **Allowed paths** from one shared constant used by both the prompt template and the changed-paths check: `src/atomic/**`, focused tests within it, `fixtures/atomic-consumer/**`, `docs/guides/component-usage.md`.
2. **Clean candidate:** no dependency, script, release-tooling or configuration changes.
3. **Verification:** `npm run verify` run by the worker.
4. **Breaking-change detection:** compare public export names and emitted type declarations with the last release. Removed or renamed exports, new required props, and removed props or variants are breaking. Breaking results enter `needs-approval`; the owner runs `changes approve <id>` or `changes reject <id> --reason <text>`.
5. **Packaging:** consumer verification of the packed artifact and SHA-512 integrity, as in v1.

## Instructions for implementers

- The prompt moves from code into `scripts/changes/prompt.md`, rendered with request data as quoted data.
- `AGENTS.md` stays the canonical rule set. A `CLAUDE.md` that imports it is added so Claude Code loads the same rules.
- Observatory reporting becomes optional: the worker reports progress only when an Observatory CLI is configured. Implementing agents do not use Observatory, and the Task Observatory section is removed from `AGENTS.md`.

## Releases

- Promotion to local `main` stays as in v1 (rebase, fast-forward, conflict handling).
- After promotion the worker pushes `main` and the tag `v<version>` to `origin`. A push failure sets `release-push-failed`, is retryable with `changes retry-release <id>`, and blocks adoption.
- Release notes are generated from request summaries.
- Versions follow semantic versioning before 1.0: an additive release increments the patch number, a breaking release (after owner approval) increments the minor number. The store's version reservation stays authoritative and applies this rule.

## Adoption

The worker does not edit the application's manifests. It runs the application's configured install command:

```json
{
  "adoption": {
    "appPath": "/absolute/path/to/app",
    "command": ["npm", "run", "design-system:update", "--", "--artifact", "{artifact}", "--commit", "{commit}"],
    "timeoutMs": 1800000
  }
}
```

- Before running, the worker checks that the application's dependency files are clean and records their state.
- The command owns vendoring, provenance, lockfile, checks, tests, build and restore. Exit code 0 means `adopted`.
- On failure the worker verifies the dependency files were restored and reports `adoption.status: failed` with the command output excerpt. The release remains available.
- The v1 direct-install adapter (`app-update.mjs`) is retired for applications that configure an adoption command.

## Migration from v1

1. Add the shared allowed-paths constant and fix the mismatch (no behaviour change for valid v1 requests).
2. Add GitHub push and tags.
3. Add the adoption command; configure Automation Studio to use it.
4. Add pull mode and the adapter contract; keep `codex` as a push adapter.
5. Add `CLAUDE.md`, the prompt template and optional Observatory reporting.
6. Add request v2 validation and the breaking-change gate.

Each step keeps existing `npm run test:changes` tests passing and adds its own.

## Acceptance

- The same additive request completed three ways (Codex adapter, Claude adapter, person via pull mode) produces released, pushed and adopted packages with identical guard results.
- An implementation touching a disallowed path is rejected in every mode.
- A request that removes an export stops in `needs-approval`; approval continues it, rejection fails it.
- A pipeline release installed into Automation Studio passes its `design-system:check`, tests and build, and leaves no absolute paths in its manifests.
- A second machine can install the released version from GitHub.

## Decisions

Recorded in Automation Studio's decision log on 17 September 2026.

| Topic | Decision |
| --- | --- |
| Version scheme | Semantic versions before 1.0: patch for additive, minor for breaking (D25) |
| Claims in pull mode | Claims do not expire; released explicitly (D27) |
| Where the worker runs | The owner's machine for the pilot; Observatory reporting optional (D26) |
| Agents and Observatory | Agents do not use Observatory (D30) |
