# Finish the isolated workflow runner

This executes remaining Task 10 of `2026-09-06-six-module-campaign-implementation.md`; it does not replace the full module-development goal with the already-passing focused HTTP tests.

## Scope and acceptance

- Add `scripts/testing/start-isolated-studio.mjs` and its tests. Expose `startIsolatedStudio({connectionString}) -> {url, close}` plus test-only resource identifiers if needed for isolation assertions.
- Default to `TEST_DATABASE_URL` or `postgresql:///banner_studio_test`; reject the known demo database, non-loopback hosts, URL host/connection overrides that escape the guard, and production execution before connecting or creating resources. No creation of an absent database and no fallback to demo.
- Unique validated schema, temporary local asset directory, full real service factories/migrations/current manifests and deterministic mock provider. Bind loopback port 0, preserve the dev launcher's loopback Host/Origin/Sec-Fetch-Site restrictions and scoped seeded roles.
- Teardown must attempt every handle and remove only this invocation's exact generated schema and temporary directory, including failed startup. Keep production bootstrap/authentication unchanged.
- Reuse the test fixture composition where practical without weakening its tests or coupling production code to test launchers. The existing `server/testing/isolatedStudio.js` is test-only and currently memory-backed; do not silently replace disk-isolation acceptance with memory-only checks.
- Change the default launcher in `scripts/test-studio-workflow.mjs` from `startDemoServer` to this runner. Explicit `STUDIO_TEST_BASE_URL` remains loopback opt-in and must warn that it creates records. No explicit external target is used during verification.
- Add `scripts/testing/**/*.test.js` to the existing Vitest include list in `vite.config.js`; the current list otherwise silently excludes the required runner tests. Preserve the rest of the Vite configuration.
- Bring the runner's actual workflow onto current approved Copy + explicit Visuals + banner batch contracts where needed; assert exact approved-version ZIP, denied role/early approval operations, retries and cleanup.

## Regression-first sequence

1. Add failing tests for two isolated instances, cross-instance campaign invisibility, auth/origin rejection, safe connection guard and cleanup.
2. Implement runner and default command wiring; preserve the user's demo database, files and process.
3. Run focused isolation tests, then `TEST_DATABASE_URL=postgresql:///banner_studio_test npm run test:workflow`.
4. Independently review cleanup/auth/connection scope and workflow assertions. Parent performs final complete suite/build and integrated commit.

No deployment, paid calls, real notifications, broad cleanup, index changes, commits or full suite by this task. Any implementation changes to shared test helper must preserve its existing API and coordinate with the HTTP-test agent first.
