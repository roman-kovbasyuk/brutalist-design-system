# Finish independent module debugging and measured loading

This executes Task 11 of the approved six-module architecture plan after integration repairs. Preserve current Copy cards, Visuals uploads/generation, Banners selections and canonical app DS; historical table-view wording is superseded by the Copy owner's implementation.

## Task 1 — development-only playground

- Add `/mvp/dev/modules/:moduleId?scenario=:name` behind `import.meta.env.DEV` and a dynamic import in App. Production routes/bundles must not expose it or fixture records.
- Exercise the six real modules with serialized `makeScenario` fixtures, not the production API. The fixture factory imports Node hashing and must never enter browser code. Generate/check serialized fixtures using the existing Node factory; test that they match it.
- Reuse canonical DS controls for module, scenario, role and operation state. Display module/input key, dependency/access state and operation/action/job/request identifiers. Record named command arguments and dirty/navigation events. Clearly label all records as fixtures.
- Provide safe mock return values for reads/downloads and review receipts so ordinary controls can be exercised without incidental TypeErrors. No real generation, credentials, persisted user data or external service calls.
- Add tests for semantic route parsing, all six module entries, running/failed/uncertain overlays, command recording and production exclusion. Preserve non-playground app routes.

## Task 2 — loading boundaries and measurements

- Keep all six frame headings/anchors present immediately. Activate allowed module content on direct navigation or near-viewport intersection; keep it mounted thereafter. Without IntersectionObserver, fall back to accessible content. Never unmount a draft when scrolling.
- Keep module-local feedback fixes intact. Test direct navigation, observer activation, stable mounts, dirty drafts and sibling refresh/error isolation.
- Inspect actual production chunks for eager preview/export imports and retain lazy export boundaries. Do not claim faster performance from file splitting alone.
- Record reproducible before/after initial module/chunk measurements with the same fixture/viewport, request counts for a copy action, mount/render behavior and title-only refresh draft retention. Distinguish browser evidence from unit/integration instrumentation.

## Task 3 — team documentation and final acceptance

- Publish `docs-site/campaign-modules.md` with module inputs/actions/outputs, playground URLs, test commands, dirty/source-key rules, neighbor-change checks and exact-version review/distribution gates. Link from docs navigation and workflow.
- Refresh README ownership rows (Visuals now owns upload; coordinator prepares text-only prompts) and original architecture status/checklists only where fresh evidence supports completion.
- Run full suite, app/docs build, production artifact checks and safe isolated workflow command; browser-check complete flow plus1440/large desktop/390 mobile, keyboard/role/error/retry behavior.
- Independent integration review, scoped commit, final requirement audit. Do not mark complete for a playground-only or tests-only subset.

No redesign, new production provider/API, external publishing, paid calls, demo-data modification or broad dirty-worktree staging. Execute independent implementation tasks sequentially; parent owns final integrated verification/commit.
