# Validation and handoff

## Current design-system-only validation — 9 September 2026

The current public repository is design-system-only. This pass reviewed the foundations catalog, component workbench, UI-block workbench, registry metadata, semantic tokens, shared CSS, and the package consumer fixture.

| Check | Result and evidence |
| --- | --- |
| Full frontend suite | `npm run test:run`: 41 files and 172 tests passed. |
| TypeScript and production build | `npm run typecheck` and `npm run build` passed. Vite reports the existing non-blocking large design-system page chunk warning. |
| Library and package contract | `npm run build:library`, `npm run verify:package`, and `npm run verify:consumer` passed; the clean consumer fixture installed the packed artifact without source aliases. |
| Token harmonization | Legacy names in `src/styles/tokens.css` alias `--v2-*`; missing semantic roles are declared in `basics/tokens.css`; token and registry tests enforce the contract. |
| Browser routes | Foundations and inputs workbench routes loaded in the local browser. At 390px, body and root client/scroll widths matched on both routes, so no horizontal overflow was observed. |
| Impeccable detector | The final detector pass returned no findings for the design-system, screen, workbench, and shared-style source roots. |

The consumer application still needs to adopt the package through its own repository. That migration is documented in `docs/design-system/full-application-review.md`; this checkout cannot claim external product-screen coverage after the legacy app was removed.

Validated on 6 September 2026 in the existing `codex/integrated-mvp` worktree. Source root: `/Users/roman/Documents/Dev/crisp/lingu-agents/.worktrees/integrated-mvp`. Live catalog: http://127.0.0.1:5176/design-system. Figma was excluded.

## Completed checks

| Check | Result and evidence |
| --- | --- |
| Frontend suite | `npx vitest run src`: 201 tests across 32 files passed. Covers the shared components, catalog, Studio screens, tokens and existing frontend API contracts. Log: `/tmp/design-system-tests-final.log`. |
| Production build | `npm run build`: application Vite build, VitePress documentation build and artifact verification passed. Log: `/tmp/design-system-build-final.log`. VitePress reports a non-blocking chunk-size warning. |
| Interaction regression tests | New tests were observed failing before the fixes for template tab/panel associations, read-only brief behavior and keyboard single-selection. They now pass. Existing wrapper imports remain exercised by component tests. |
| Inherited test failures | Initial selected baseline: 81/83 passing. Two StudioApp assertions expected an older workflow DOM and an absent action that is now disabled. Updated assertions verify current ordered-link semantics and prevent disabled navigation/action activation; permission guards were preserved. |
| Independent review | Read-only review compared this migration with the pre-edit backup. All 12 former flat component modules retain their exports and component identity; all pre-existing token values resolve unchanged. The review identified a combobox extraction limitation; the catalog's scoped positioning rule exists, while a standalone reusable contract is deferred. |
| Combobox after review | The catalog example remains positioned by `.system-screen--v2 .v2-combobox`. Standalone extraction, including its positioning, focus and dismissal contract, is deferred until a production consumer requires it. |
| Scoped static audit | Impeccable detector returned no findings for the shared library, catalog, TemplateLibrary and app-controls scope. `/tmp/design-system-detector.json`. This heuristic is supplementary; it did not detect the CSS issue found in review. |
| Patch hygiene | `git diff --check` passed. Local documentation/source links were checked. Existing unrelated work remains in the worktree; no commit, stash or destructive Git operation was performed. |

## Representative browser validation

Used the live application through the in-app browser. Interactions stayed local to catalog examples or presentation controls; no campaign save, provider generation, approval, export or deletion was invoked.

| Surface / condition | Observed result |
| --- | --- |
| Catalog, desktop | Search narrows the 26-entry directory across three plain-language groups—Basics, Components and UI blocks. Component details expose purpose, properties, states, usage, source and constraints; token names appear as copyable chips in the detail view. Examples and legacy modules are labelled explicitly. No document overflow at the inspected desktop sizes. |
| Foundation copy targets | Color swatches and spacing markers copy one semantic token; typography samples copy one combined font declaration containing family, size, line-height and weight. Token names remain hidden from the visual specimens and are available in the Library detail panel. |
| Catalog, 390px and 320px viewports | Navigation and component documentation reflow; labels and sources wrap. At 320px, client width and scroll width both measured 308px after accommodating the reserved scrollbar. No duplicate element IDs were found. |
| Production composer specimen | Uses the same PromptComposer as BriefStage. Read-only textarea remains enabled and focusable; edit and submit are blocked. Busy mode disables interaction. Local submission is explicitly marked as a preview. |
| Campaign, desktop and 320px | Inspected the existing brief, copy/table and banner preview composition. The copy table keeps its 720px content inside a local 257px scroll region. Preview controls now wrap; final document client/scroll width both measured 308px at a 320px viewport. |
| TemplateLibrary, 390px | Arrow-key navigation moves selected tab and focus; all four aria-controls targets exist with matching aria-labelledby; inactive panels are hidden. |
| Shared selection and focus | Selected option receives focus, arrow/Home/End movement works, Escape returns focus to the trigger, and selecting updates the value. Focus styling resolves to a 2px cyan outline plus a black ring. |
| Browser diagnostics | No console warnings/errors were reported in the inspected temporary validation tab at the time checked. Temporary viewport overrides were reset. |

The 6 September legacy-stage audit observed an empty ReviewStage heading while the former global stage was 0–3. That is dated evidence for the compatibility flow, not a defect in the live six-module campaign page. This migration does not claim that every app screen has been remediated.

## Remaining validation and migration

- Perform assistive-technology, forced-colors, reduced-motion runtime and complete contrast/target-spacing checks across supported browsers. JSDOM and sampled browser inspection do not establish WCAG conformance.
- Verify native dialogs, file extraction and submission under real browser/permission conditions. Real provider requests, backend permissions, export and delivery integrations were not run by this UI audit.
- Extract FormField, feedback and action-menu contracts before extending those product patterns. The standalone multi-select/combobox positioning, focus and dismissal contract remains deferred; other catalog demos retain the limitations in the component reference.
- Keep the old module exports, semantic token names and legacy UI components until all consumers migrate. No breaking export removal is included here.
- Use the existing light application theme. Dark mode, generalized DataTable/AppShell APIs and speculative booking/model controls remain proposals.
- The repository contains concurrent work. Build/tests validate the observed worktree, including pre-existing edits, rather than an isolated clean commit containing only this migration.

## Reversibility and file inventory

Pre-edit files and SHA-256 hashes are in `/tmp/banner-studio-ds-audit/before` and `before.json`; `status-before.txt` records the initial dirty worktree. `changes.json` and `migration.patch` in that directory record this migration's touched files and the before/after patch. These temporary artifacts are local to this machine and are not a durable release archive.

Restore selected hunks only after checking for subsequent edits. Do not restore the entire backup over ongoing work. The canonical modules and old compatibility entry points support incremental reversal. The inventory below is restricted to files changed or added by this task; it is not the full Git status.

```text
DESIGN.md
docs/design-system/audit.md
docs/design-system/components.md
docs/design-system/legacy-visual-reference.md
docs/design-system/migration.md
docs/design-system/roadmap.md
docs/design-system/validation.md
docs/superpowers/plans/2026-09-06-atomic-design-system.md
src/components/design-system/AdvancedControlSpecimens.jsx
src/components/design-system/AppButton.jsx
src/components/design-system/AtomicContracts.test.jsx
src/components/design-system/ControlSpecimens.jsx
src/components/design-system/DataSpecimens.jsx
src/components/design-system/MotionSpecimens.jsx
src/components/design-system/PillTabs.jsx
src/components/design-system/PromptComposer.jsx
src/components/design-system/README.md
src/components/design-system/ResponsiveSpecimen.jsx
src/components/design-system/SpecimenCard.jsx
src/components/design-system/SpecimenSection.jsx
src/components/design-system/UIBlocks.jsx
src/components/design-system/WorkflowSteps.jsx
src/components/design-system/atoms/AppButton.jsx
src/components/design-system/examples/AdvancedControlSpecimens.jsx
src/components/design-system/examples/ControlSpecimens.jsx
src/components/design-system/examples/DataSpecimens.jsx
src/components/design-system/examples/LibraryIndex.jsx
src/components/design-system/examples/MotionSpecimens.jsx
src/components/design-system/examples/PromptComposerExample.jsx
src/components/design-system/examples/ResponsiveSpecimen.jsx
src/components/design-system/examples/SpecimenCard.jsx
src/components/design-system/examples/SpecimenSection.jsx
src/components/design-system/examples/UIBlocks.jsx
src/components/design-system/examples/library-catalog.js
src/components/design-system/examples/library-index.css
src/components/design-system/foundations/tokens.css
src/components/design-system/molecules/PillTabs.jsx
src/components/design-system/molecules/SelectMenu.jsx
src/components/design-system/molecules/WorkflowSteps.jsx
src/components/design-system/molecules/pill-tabs.css
src/components/design-system/molecules/select-menu.css
src/components/design-system/organisms/PromptComposer.jsx
src/components/design-system/templates/README.md
src/screens/DesignSystemScreen.jsx
src/screens/DesignSystemScreen.test.jsx
src/studio/BriefStage.jsx
src/studio/BriefStage.test.jsx
src/studio/CampaignTimeline.jsx
src/studio/StudioApp.test.jsx
src/studio/TemplateLibrary.jsx
src/studio/primitives.jsx
src/studio/studio.css
src/styles/app-controls.css
src/styles/design-system.css
src/styles/tokens.css
src/styles/tokens.test.js
```
