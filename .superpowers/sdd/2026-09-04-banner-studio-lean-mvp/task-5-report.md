# Task 5 — Fastify application and health boundary

## Scope delivered

- Added `buildApp(dependencies)` in `server/app.js`; it composes Fastify routes and never calls `listen` or reads `process`.
- Added `loadConfig(environment)` in `server/config.js`; it validates the supplied environment object, validates `NODE_ENV` and `PORT`, requires `DATABASE_URL` in production without interpolating its value into errors, and returns a frozen configuration object.
- Added `GET /healthz` for liveness and `GET /readyz` for injected dependency readiness.
- Added a generated/safely preserved request ID to JSON responses and the `x-request-id` response header.
- Added normalized API error envelopes with no error stack or internal error message leakage.
- Added `server/start.js` as the only listener, plus idempotent `SIGTERM`/`SIGINT` shutdown handling.
- Added the `start` npm script and runtime dependencies on Fastify 5, `@fastify/static` 8, and `pg` 8.

## Test-first evidence

### RED

Command:

```sh
npm test -- --run server/app.test.js
```

Result: failed as intended before implementation. Vitest could not resolve `./app.js` from `server/app.test.js`; zero tests ran because the required module did not yet exist.

### Focused GREEN

Command:

```sh
npm test -- --run server/app.test.js
```

Result: 1 test file passed, 10 tests passed.

Covered behaviours: liveness, readiness, unavailable readiness, no listener during app construction, safe/unsafe request IDs, normalized 404 and unexpected errors, production configuration validation without secret exposure, immutable injected configuration, and missing injected environment rejection.

### Broader tests

Command:

```sh
npm test -- --run server shared
```

Result: 5 test files passed, 75 tests passed.

### Build

Command:

```sh
npm run build
```

Result: exit 0. Vite production build and VitePress build both completed. VitePress emitted its existing chunk-size warning for bundles over 500 kB.

### Process lifecycle smoke check

Command:

```sh
NODE_ENV=test PORT=41387 node server/start.js > /tmp/banner-studio-start.log 2>&1 &
server_pid=$!
sleep 1
kill -TERM "$server_pid"
wait "$server_pid"
```

Result: process started, accepted SIGTERM, and exited 0. The initial `PORT=0` attempt correctly failed during configuration validation because port zero is outside the configured 1–65535 range; the retry used a valid explicit port.

## Review notes

- `npm install fastify@5 @fastify/static@8 pg@8` resolved to Fastify 5.12.3, `@fastify/static` 8.3.0, and pg 8.23.0.
- The dependency install reported 12 audit findings (9 moderate, 3 high) in the dependency tree. They were not changed because remediation would exceed this task's dependency scope.
- No React screens, components, styles, or docs-site files were modified.
