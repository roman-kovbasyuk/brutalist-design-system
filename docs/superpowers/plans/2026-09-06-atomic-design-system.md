# Atomic design-system migration

Goal: make the application UI library discoverable, distinguish production components from demonstrations, and preserve existing callers.

Authority: the user requested an evidence-based audit, reversible reorganization, documentation, and an extension roadmap. Continue inline in the existing `codex/integrated-mvp` worktree. Preserve prior changes and the current Avenir/cyan visual identity.

## Design decision

Use atomic folders for responsibilities and a searchable reference for discovery. Keep existing flat import paths as deprecated re-exports. Avoid either a documentation-only taxonomy (does not fix ownership) or a wholesale rewrite (risks active work). Product-specific modules remain in `src/studio`; artwork templates are not application layout templates. Only the existing light theme is supported.

## Execution

- [x] Record baseline tests and a file backup outside the repository.
- [x] Test template tab/panel associations and read-only composer behavior before changes.
- [x] Move AppButton to atoms; PillTabs and WorkflowSteps to molecules; PromptComposer to organisms; specimens to examples. Preserve all exports and CSS hooks with compatibility entry points.
- [x] Consolidate the three SpecimenCard implementations into the existing shared example helper.
- [x] Add a PillTabPanel companion and fix TemplateLibrary associations. Preserve keyboard activation and category state.
- [x] Separate AppButton icon shape from emphasis, retaining variant="icon" as an alias. Keep default 48px and provide compact 44px sizing; preserve busy/disabled behavior.
- [x] Add a production PromptComposer example. Label command, scheduling, settings, and unextracted controls as examples with explicit limits.
- [x] Add primitive/semantic token documentation and aliases without changing the palette. Add a searchable library index showing purpose, props, states, constraints, source, and production usage.
- [x] Write audit, complete migration table, extension roadmap, and validation/rollback notes in docs/design-system and reference them from the library README.
- [x] Run relevant unit/integration tests, build, and bounded desktop/mobile browser checks. Record inherited failures separately.

## Validation contract

No old import path breaks. Every template tab controls a real labelled panel; inactive panels remain hidden. Read-only prompt content remains readable and selectable. Catalog search exposes the matching component with its adoption status; examples cannot masquerade as production support. Verify catalog, campaign brief/copy, and templates at desktop/mobile widths. Do not invoke paid generation or mutate campaigns during the audit.

## Baseline

83 selected tests: 81 passing, 2 inherited failures in StudioApp.test.jsx (workflow expects an outdated navigation/button structure; designer test expects Generate copy to be absent but it is disabled). Full output: /tmp/design-system-baseline.log. Existing files backed up to /tmp/banner-studio-ds-audit/before; preserve later unrelated changes when reverting.

## Completed additions discovered during inspection

Extracted SelectMenu and component-owned styles; fixed compact preview toolbar/body overflow. The catalog retains its scoped combobox positioning rule; standalone combobox extraction with a focus and dismissal contract is deferred until a production consumer requires it. Final evidence and scoped file inventory are in docs/design-system/validation.md. Two inherited frontend assertions were reconciled with current semantics; the full frontend suite passes. The empty ReviewStage heading is retained only as dated legacy-flow evidence, not as a live six-module defect.
