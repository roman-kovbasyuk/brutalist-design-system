# Task 1 report: Backend freeform brief and five-option contract

## Status

Implemented and verified.

## Changes

- Brief contracts now accept notes-only input, default legacy fields to empty strings and locale to `auto`, reject wholly empty briefs, preserve complete legacy structured briefs, and allow up to 20,000 note characters.
- Copy contracts enforce exactly five provider results and banner limits of headline 80, body 160, CTA 24, and optional `offer` tag 40. Persisted generation metadata remains compatible with historical result counts.
- Mock generation remains deterministic, is explicitly local/demo behavior, handles notes-only briefs, creates five distinct options, and does not invent a tag.
- Gemini structured output requests and validates exactly five options, permits an omitted tag, treats campaign content as untrusted data, and explicitly asks the provider to infer subject, audience, intent, and language from notes.
- Added authenticated `POST /api/v1/brief-files/extract` for marketer/admin roles and the matching `extractBriefFile({name,mimeType,data})` Studio client method.
- Added strict base64 validation, a 5 MB decoded input ceiling, explicit supported extension/MIME pairs, UTF-8 validation, PDF/DOCX text extraction, a 20,000-character output ceiling, and safe unsupported/malformed/unreadable errors with paste-text fallback guidance.
- Added exact parser coverage for TXT, Markdown, a generated text PDF, and a generated DOCX. Image-only/unreadable content is rejected rather than silently accepted or truncated.
- Added exact dependencies `mammoth@1.12.2` and `pdf-parse@2.4.5`, selected from their official npm documentation for raw DOCX buffer extraction and PDF text extraction.

## TDD evidence

### RED

Command:

```sh
npm test -- --run shared/contracts.test.js server/providers/mockProvider.test.js server/providers/geminiProvider.test.js src/studio/api.test.js server/briefTextExtractor.test.js server/routes/briefFiles.test.js
```

Observed: exit 1; 6 failed files, 11 expected failed tests, 74 passed. Failures were specifically missing extractor module/route/client, notes-only schema rejection, missing optional-tag default, three rather than five copy options, and absent role enforcement on the nonexistent route.

Additional RED transport check:

```sh
npm test -- --run server/routes/briefFiles.test.js
```

Observed: exit 1; the valid attachment above Fastify's default 1 MB JSON limit returned 413 instead of 200.

### GREEN

Command:

```sh
npm test -- --run shared/contracts.test.js shared/generationContracts.test.js shared/workflowRules.test.js server/providers/mockProvider.test.js server/providers/geminiProvider.test.js server/providers/registry.test.js server/services/generationService.test.js server/routes/generation.test.js server/routes/routes.test.js server/routes/briefFiles.test.js server/app.test.js server/briefTextExtractor.test.js src/studio/api.test.js
```

Observed: exit 0; 13 files passed, 177 tests passed, 0 failed.

`git diff --check` also exited 0.

## Self-review

- The route raises its body limit only for this endpoint and only enough for a 5 MB base64 payload plus a small JSON envelope.
- Base64 is validated before decoding; decoded size and extracted character count are independently enforced. Oversize content is rejected, never truncated.
- Extension and MIME type must agree, avoiding accepting arbitrary formats by filename alone.
- Provider-generated counts are enforced at the provider result boundary, while historical persisted generation result metadata remains permissive.
- Existing idempotency and generation control-plane logic was not changed; its focused service and route tests pass with five-option fixtures.
- No paid AI or cloud calls were used.

## Concerns

- PDF/DOCX parsers process only server-received buffers capped at 5 MB, but highly complex compressed documents can still cost more CPU/memory than plain text. Production deployment should also retain request timeouts and process/container resource limits.
- `npm audit --omit=dev --json` reports 8 existing moderate production advisories through `firebase-admin`/Google dependencies. It reports no high or critical production advisories and none are attributed to the two extraction dependencies. No unrelated dependency upgrades were attempted.

## Review round 1 fixes

### Findings and root causes

- The first implementation tightened `copyVariantSchema`, but that schema is also used to parse historical workspace copy sets, immutable version snapshots, and completed job metadata. New-generation limits therefore accidentally became migration requirements for stored records.
- PDF and DOCX parsing ran in the API process. Capping compressed input at 5 MB did not bound decompressed DOCX size or parser CPU/memory consumption.

### RED evidence

Command:

```sh
npm test -- --run shared/copyCompatibility.test.js server/briefTextExtractor.test.js
```

Observed: exit 1; 5 targeted failures. Historical long copy failed in snapshot, completed-job, and workspace schemas; a compressed DOCX expansion returned the generic unreadable error instead of being rejected during preflight; and the isolated-parser deadline API did not exist.

### Fixes

- Restored the historical `copyVariantSchema` limits: headline 160, body 500, CTA 80, offer 200 with the legacy required field shape.
- Added `generatedBannerCopySchema` with headline 80, body 160, CTA 24, and optional/default-empty offer 40. Exactly five copies using this schema are required only at the provider result boundary.
- Added regressions that parse long historical copy through an immutable snapshot, completed generation job, and full workspace response.
- Moved PDF and DOCX parsing into a child process with a 64 MB old-generation heap ceiling, reduced stack ceiling, a five-second hard deadline, and forced process termination after success, failure, or timeout.
- Added DOCX central-directory preflight with a 1,000-entry ceiling, a 25 MB cumulative uncompressed-size ceiling, malformed-directory checks, and ZIP64 rejection before Mammoth sees the archive.
- The parser child enforces the 20,000-character output ceiling before sending text back to the API process.

### GREEN evidence

Command:

```sh
npm test -- --run shared/contracts.test.js shared/copyCompatibility.test.js shared/generationContracts.test.js shared/versionContracts.test.js shared/workflowRules.test.js server/providers/mockProvider.test.js server/providers/geminiProvider.test.js server/providers/registry.test.js server/services/generationService.test.js server/routes/generation.test.js server/routes/routes.test.js server/routes/briefFiles.test.js server/app.test.js server/briefTextExtractor.test.js src/studio/api.test.js
```

Observed: exit 0; 15 files passed, 186 tests passed, 0 failed. This includes real PDF/DOCX extraction, expansion-bomb rejection, and enforced parser timeout coverage.
