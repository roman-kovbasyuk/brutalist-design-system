# Task 8 Report: Firebase authentication and invitation policy

## Status

Implemented and verified. Task 8 now has Firebase Admin token verification behind an injected verifier, atomic invitation acceptance, request-time PostgreSQL actor resolution, Fastify role pre-handlers, a strict session route, and a production startup composition that exposes the authenticated Task 7 API.

## Implementation

- Added `firebase-admin@13.10.0` as a production dependency.
- Added `server/auth/verifyToken.js`:
  - accepts only an exact `Authorization: Bearer <token>` header;
  - delegates token verification to an injected `{ verify(token) }` interface;
  - uses Firebase Admin `verifyIdToken(token, true)` in production, including revocation checks;
  - maps missing, malformed, expired, revoked, and invalid credentials to the same safe `401 unauthorized` response;
  - requires a Firebase UID, normalized valid email, and `email_verified === true`;
  - ignores token role claims and returns only an actor resolved from PostgreSQL;
  - defensively confirms the persisted UID, email, and role before returning an actor;
  - closes an owned Firebase app during shutdown.
- Added `server/auth/authorize.js`:
  - produces `requireRole(...roles)` Fastify pre-handlers;
  - writes the authenticated database actor to `request.actor`;
  - returns normalized `403` responses for disabled users and role denial.
- Added forward migration `005_authentication.sql`:
  - introduces `users.disabled_at`;
  - backfills existing `disabled = true` rows;
  - removes the legacy boolean column without modifying migrations 001-004.
- Extended `server/repositories/userRepository.js` with a parameterized, transaction-owned `resolveAuthenticatedUser` path:
  - accepted users must join to their accepted, non-revoked invitation;
  - later requests require the same Firebase UID and normalized verified email;
  - first sign-in locks the live invitation row, creates the user from the invitation role, and marks the invitation accepted in one transaction;
  - concurrent first sign-ins for the same identity converge on exactly one user and one binding;
  - role and `disabled_at` are read fresh on every request.
- Replaced route-local actor checks across all Task 7 campaign, template, user, and settings routes with real Fastify authorization pre-handlers.
- Added `GET /api/v1/session` with a strict response containing only `id`, `email`, `role`, `displayName`, and `requestId`.
- Added `server/bootstrap.js` and rewired `server/start.js`:
  - load configuration;
  - create the PostgreSQL pool;
  - run migrations before listening;
  - construct workflow repositories/services;
  - construct the Firebase verifier and database authenticator;
  - inject the real actor resolver and workflow service into `buildApp`;
  - expose readiness through a database probe;
  - close Fastify, Firebase, and PostgreSQL once and in safe order;
  - clean up partially created resources after startup failure.

## Security and role behavior covered

- Valid invited user and first invitation acceptance.
- Concurrent first-login binding race.
- Missing and malformed bearer headers.
- Expired/invalid token normalization without SDK detail leakage.
- Unverified email, malformed email, missing UID, uninvited email, verified-email mismatch, and UID mismatch.
- Disabled-user revocation through `disabled_at`.
- Database role changes taking effect on the next protected request.
- Wrong-role denial.
- Admin inheritance of Marketer capabilities while remaining excluded from Designer-only workflow actions.
- Self-approval denial using the authenticated database actor identity, even when token role claims disagree.
- Strict session response field filtering.
- Production bootstrap dependency injection, startup failure cleanup, idempotent resource shutdown, and listen failure cleanup.

## Verification

- Focused auth/startup/routes: `npx vitest run server/auth/auth.test.js server/bootstrap.test.js server/start.test.js server/routes/routes.test.js`
  - 4 files passed, 33 tests passed.
- Server/shared: `npx vitest run server shared`
  - 12 files passed, 168 tests passed.
  - PostgreSQL tests used only `postgresql:///banner_studio_test` through the existing guarded test setup.
- Build: `npm run build`
  - Vite application build passed.
  - VitePress documentation build passed.
- Diff hygiene: `git diff --check` passed.

## Concerns and follow-up

- `npm audit --omit=dev` reports nine production dependency advisories: one high-severity advisory family in the pre-existing `@fastify/static@8` dependency and moderate transitive advisories under `firebase-admin@13`. The requested Firebase major is installed; npm currently proposes an incompatible Firebase downgrade as its automated remedy. No audit fix was applied because that would violate the requested dependency constraint or introduce an unrelated Fastify major upgrade.
- The VitePress build retains the existing large-chunk warning. It does not fail the build and is unrelated to backend authentication.
- Firebase network calls are intentionally absent from tests; all authentication tests inject the verifier interface. Production credentials still need to be supplied through Firebase Application Default Credentials in the deployment environment.
