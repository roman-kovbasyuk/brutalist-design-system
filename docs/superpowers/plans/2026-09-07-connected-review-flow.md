# Connected Review flow regression

Browser QA reached designer feedback, then in-app browser activation stopped responding. Existing coordinator→HTTP tests and mocked ConnectedStudio click tests pass, but neither combines the real connected UI with persisted review transitions. Add this bounded regression without treating the browser tool symptom as a proven app defect.

## Task 1 — real connected UI against isolated services

- Add a focused JSX integration test using `ConnectedStudio`, the actual API client, and the existing isolated full-service fixture. No mocked Review module, coordinator, API method, or server repository.
- Seed a fitting composition/review through the existing real workflow helpers or public API. Keep fixture ownership and cleanup exact. No demo database, external services, credentials, or paid providers.
- Render designer, submit changes with user-event interactions, then remount with marketer and the semantic `?module=review` URL. Verify the current version and enabled Reopen control.
- Exercise Reopen through user-event click and keyboard in independent fresh scenarios. Assert one reopen POST, persisted revision/status transition, and corresponding UI transition. No repeated blind retries.
- Continue one scenario to v2, designer checklist, independent marketer approval, delivery build and download action. Assert exact current version and actual ZIP bytes; previous review remains immutable.
- Substitute only browser layout/download plumbing missing in jsdom; record each substitution explicitly. No production behavior changes unless a failing test identifies a real defect, then report the cause before implementation.
- Run only the new focused test and directly affected existing tests. Parent owns full-suite/build/browser/final review. No staging or commit.

This is connected UI/HTTP evidence, not a claim of trusted physical browser activation or visual correctness. The browser gap remains separately recorded until verified.
