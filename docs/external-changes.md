# External changes protocol

> **Protocol v2 is specified but not implemented** ([design](superpowers/specs/2026-09-17-change-protocol-v2-design.md), accepted 17 September 2026). It makes implementation agent-agnostic, adopts releases through the application's own install command, pushes releases to GitHub and holds breaking changes for owner approval. This page describes the current v1 behaviour.

The protocol is a local CLI and worker for one configured npm application. Requests are automatically approved under `single-app-policy`; the application still receives verification and adoption results. There is no HTTP endpoint, npm publish, remote push, or production deployment.

Configure the application once and run the worker separately:

```sh
node scripts/changes/cli.mjs configure --app /absolute/path/to/app --check typecheck --check build
npm run changes:worker
```

Submit exactly four JSON fields:

```json
{
  "requestId": "app-change-184",
  "installedVersion": "0.1.0-atomic.0",
  "component": "SearchField",
  "change": "Add an optional keyboard shortcut hint."
}
```

```sh
node scripts/changes/cli.mjs request --input /absolute/path/to/request.json
node scripts/changes/cli.mjs get app-change-184
```

`requestId` accepts 1–80 ASCII letters, digits, `_`, and `-`, beginning with a letter or digit. The version and component are non-empty strings up to 100 characters; the change is up to 4000 characters. Unknown fields are rejected. Repeating the same normalized request is idempotent; a different payload with the same ID is a conflict.

The public result is JSON with `working`, `ready`, or `failed`. A ready result includes the immutable `version`, absolute `packagePath`, and `summary`; `adoption.status` is separately `pending`, `installed`, or `failed`. A package can remain ready when application installation fails. The adapter installs the exact SHA-512-verified tarball without lifecycle scripts, runs the configured checks, and restores the previous dependency files on failure. Concurrent edits are reported as a conflict and are never overwritten.

The worker agent may change `src/atomic/**`, focused atomic tests, `fixtures/atomic-consumer/**`, and the canonical usage guide when a component change needs its documentation. It may not change dependencies, release tooling, arbitrary documentation, application files, or Observatory. Recovery, stale guards, release retention, and rollback behavior are covered by `npm run test:changes`.
