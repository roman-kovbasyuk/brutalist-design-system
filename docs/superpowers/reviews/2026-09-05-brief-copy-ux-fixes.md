# Brief and copy UX — final review fixes

Base: `e48533b3a0825a0d71f71cf1ffdb74c63634e7cd`

## Changes

- Removed the native textarea character cap so pasted text remains intact for the existing combined-brief validation, visible error, and disabled submit state.
- Normalized only missing and `application/octet-stream` browser MIME values from a validated TXT/MD/Markdown/PDF/DOCX extension. Known contradictory MIME values remain unchanged for server rejection.
- Added `.markdown` to the server allowlist and UTF-8 text extraction path.
- Resolved the isolated parser relative to `import.meta.url`, independent of the process working directory.

## RED

Command:

```text
npm test -- --run src/studio/BriefStage.test.jsx server/briefTextExtractor.test.js
```

Result before implementation:

```text
Test Files  2 failed (2)
Tests       5 failed | 16 passed (21)
```

The failures demonstrated native truncation at 20,000 characters, empty/generic MIME forwarding for `.md` and `.markdown`, and server rejection of `.markdown`.

## GREEN

Focused command after implementation:

```text
npm test -- --run src/studio/BriefStage.test.jsx server/briefTextExtractor.test.js
```

Result:

```text
Test Files  2 passed (2)
Tests       21 passed (21)
```

Final focused regression command:

```text
git diff --check && npm test -- --run src/studio/BriefStage.test.jsx src/components/design-system/UIBlocks.test.jsx server/briefTextExtractor.test.js
```

Result:

```text
Test Files  3 passed (3)
Tests       24 passed (24)
```

`git diff --check` also completed successfully.

## Concerns

No known functional concerns in this scope. Full/shared-database suites and paid/cloud checks were intentionally not run. Browser verification remains with the parent task as requested.
