# Brief implementation

Approved design: `../specs/2026-09-06-brief-module-design.md`.

Keep the six-module shell, existing design-system components, and server authorization. No automatic image generation.

- [x] Persist structured analysis in the existing brief JSON contract; support refinement instructions and editable summary/facts. Test schema compatibility, source freshness, title persistence, and downstream context.
- [x] Add a prompt-only Visuals command. Coordinate initial Copy and Visuals drafts independently, retaining idempotency/recovery and staying at Brief. Test first generation, branch failure, retries, and zero image requests.
- [x] Implement Brief default, working, results, inline editing, and chat states using shared controls. Preserve local input on errors/conflicts; animate saved title updates with reduced-motion support. Test module interactions in isolation.
- [x] Verify targeted and integration tests, production build, and desktop/mobile rendering. Record remaining limitations honestly.

Persistence: structured analysis is an optional field in brief JSON, preserving legacy records without a database migration. Provider job snapshots remain immutable. New analysis replaces saved results only while its captured source is current; manual overrides feed subsequent generation. Existing copy and media are retained and marked stale when the brief changes.

Coordination: the runtime still serializes campaign writes. Logical branches do not depend on each other's outputs. Initial prompt preparation never invokes the image-generation command. Later brief refinements preserve previous drafts rather than auto-regenerating them.

## Verification — 6 September 2026

- Eight focused suites: **91 tests passed**, including real PostgreSQL source freshness, legacy hydration, concurrent idempotent Copy replay, module recovery, owner-UI retry after a lost response, and review lineage.
- Production app and documentation build passed; documentation bundle retains the existing large-chunk warning.
- `scripts/verify-brief-ui.mjs` passed against a real isolated API/database with the mock provider: creation, five Copy options, three prompt-only directions, inline editing, refinement, reload persistence, zero image jobs, and no horizontal overflow at 390/1440/2252px.
- Independent visual review: ship. Shared-component detector: no findings.
- Full concurrent-worktree run: 1238 passed, 12 failed. One outdated Visuals guidance assertion is fixed and verified; the other 11 were migration expectations missing the parallel Banners task's new migration 027. Those belong to that task, not Brief.

Limitations: real Gemini calls and paid image generation were intentionally not exercised. This is a local implementation, not a cloud deployment. Existing downstream results remain stale after refinement until explicitly regenerated/reviewed; initial generation does not replace historical outputs. Failed durable initial jobs require a user-triggered module retry. Initial keys deduplicate concurrent tabs for the same actor through server idempotency; normal user-requested regeneration uses a fresh key.
