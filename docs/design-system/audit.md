# Banner Studio application design-system audit

> Historical design-system migration record. Product paths and consumer claims below describe the original host application, which is not part of this standalone workspace. For current boundaries, see [component ownership](../../src/components/design-system/README.md) and [validation](validation.md).

Audited 6 September 2026 against `http://127.0.0.1:5176/design-system` and its live source in the `codex/integrated-mvp` worktree. Figma was excluded at the user's request. This is a code and browser audit, not a claim of WCAG conformance.

## Outcome and scope

The catalog had substantial visual/state coverage but mixed reusable APIs, locally recreated controls, speculative workflows, and page demos in one directory. The migration now separates these responsibilities, preserves the old import paths, and documents adoption explicitly in the live searchable Library structure section.

Reviewed: both token families; all twelve original design-system JSX modules; the thirteen `components/ui` modules and their imports; catalog CSS; App routing; Studio entry, brief, copy, timeline, templates, banner composition and review implementations; representative live catalog, campaign and template screens. The reusable library now has six named component exports: AppButton, PillTabs, PillTabPanel, WorkflowSteps, SelectMenu, PromptComposer. Several controls shown in the catalog are still examples, not exported components.

The active route is `App → StudioApp`, with `/design-system` lazily rendering `ApplicationDesignSystemPage → DesignSystemScreen`. The old `MvpApp`, `MvpShell`, `CampaignSidebar` and `components/ui` implementation remain in source. Static imports and tests are evidence of dependencies, not proof that an old component can safely be deleted.

The production workflow is brief → copy → AI assets → banners → review file → Figma review → approval → assets ready. It includes pending generation, campaign revisions, read-only reviewer access, selectable copy/image directions, constrained artwork templates and approved delivery. PRODUCT.md describes an earlier prototype and is not reliable evidence of the current runtime's language, providers or capabilities.

## Findings

Severity: P0 blocks a primary task; P1 substantially harms an interaction/accessibility contract; P2 causes drift, misleading guidance or maintenance cost; P3 optional polish. No P0 was confirmed.

| Severity | Confirmed finding and evidence | Impact | Outcome |
| --- | --- | --- | --- |
| P1 | `TemplateLibrary` rendered `PillTabs` whose `aria-controls="template-category-banners-panel"` and other targets did not exist. The catalog’s own tabs had panels. | Production tabs lacked the relationships demonstrated by the library. | **Fixed:** added `PillTabPanel`; all four panels exist, inactive ones are hidden, and keyboard selection/focus are tested. |
| P1 | `AdvancedControlSpecimens` campaign-status selector opened a listbox while leaving focus on the trigger; all options were tab stops and ArrowDown did not move through them. Browser reproduction and regression test confirmed this. `UIBlocks.BlockSelect` had a separate, stronger implementation. | Keyboard interaction differed for the same kind of single selection. | **Fixed:** extracted `SelectMenu` and adopted it in four example call sites, with selected-option focus, roving tab stop, arrow/Home/End movement, Escape and focus restoration. |
| P2 | Three implementations of `SpecimenCard`: its own file, `DataSpecimens`, and `MotionSpecimens`. The two local copies had the same structure but omitted the optional className prop. | Documentation frames could drift independently. | **Fixed:** one helper under `examples/`; all imports and old entry points preserved. |
| P2 | `PromptInputBlock` advertised slash commands, model/effort, 25 MB uploads and Enter-to-send; actual `PromptComposer` accepts document briefs and uses Ctrl/⌘+Enter, with 5 MB/file and 20,000 combined characters enforced by the caller. | The catalog taught an interaction contract that the app does not support. | **Fixed documentation:** added an actual `PromptComposer` example and labelled the old block exploratory. Both remain separate because their behavior and purpose differ. |
| P2 | `PromptComposer` mapped `readOnly` to native `disabled` on its textarea. | Reviewers could not tab into a read-only brief to inspect/select text normally. | **Fixed:** native readOnly stays focusable; actual disabled/busy states still disable it; submission remains blocked. |
| P2 | Reusable AppButton, PillTabs, WorkflowSteps and PromptComposer lived beside entire pages of specimens. `PillTabs` appearance was owned by both catalog CSS and `studio.css`. | A folder import did not reveal whether it was a production component; screen CSS owned shared behavior. | **Fixed:** atomic folders, example folder, compatibility exports, and component-owned tab/select styles. Broader field/status styling remains to be extracted. |
| P2 | `AppButton.variant` combined emphasis (`primary`, `danger`) and shape (`icon`). Studio also exposes `Button.primary`; the legacy Button has a different CVA API. | Consumers cannot consistently compose an icon-only primary/danger action through the old shape variant. | **Fixed:** iconOnly boolean and default/compact size are independent of emphasis. `variant="icon"` and the Studio Button adapter remain compatible. Legacy CVA Button is retained pending its dependency migration. |
| P2 | Root DESIGN.md described Inter/indigo, 10–16px corners and underline tabs. Live app and `--v2-*` use Avenir-family/cyan, 4px corners and pill tabs. | Documentation contradicted the actual library. | **Fixed:** current application reference; previous direction archived as legacy. PRODUCT.md still needs a broader product-owner review. |
| P2 | Native form elements, `bs-field`, status labels, view switching, error notices, menus and campaign objects are recreated locally in `studio/`. `AdvancedControlSpecimens.Field` renders help text without associating it to its control. | Library catalog coverage exceeds reusable implementation coverage; future screens repeat accessibility and state wiring. | **Remaining:** FormField, controls, StatusBadge, SegmentedControl, menu/confirmation and async feedback are priority extensions. |
| P2 | The catalog file input says “up to 25 MB” without enforcing a limit; multi-select/search popovers still have independent focus/dismissal behavior. | Copying the demo can introduce incomplete validation or keyboard behavior. | **Contained:** explicit example-only constraints. Shared upload and multi-select/combobox contracts remain on the roadmap. |
| P2 | Before migration, literal-pixel declaration counts were 249 in `design-system.css`, 433 in `studio.css`, 97 in `ui-blocks.css`, 29 in `app-controls.css`. Custom select borders used 2px while foundations documented a 1px structural rule. | Spacing/sizing changes remain costly; border roles need explicit distinctions. These counts include justified preview dimensions and are **not** counts of defects. | **Partial:** primitive palette, semantic aliases, control/icon/type sizing tokens and tab/select ownership extracted. Incremental spacing, border and layering cleanup remains. |
| P2 | Root tokens, v2 tokens and shadcn tokens coexist. SettingsBlock has a local dark preview but root color-scheme is light; no application-wide theme mode exists. | A preview can be mistaken for supported theme switching. | **Documented:** one supported light application mode. No invented dark mode or parallel theme flag added. Legacy token family remains for old consumers. |

## Representative-screen findings discovered during validation

- **P2, fixed — banner preview toolbar overflow:** at 320px the campaign document extended to 343px; the Replay animation button lay beyond the available width. The table itself correctly scrolled in its own 257px region. `bs-preview-toolbar` now wraps its control groups on compact screens; active app/catalog pages also override the legacy body minimum width to accommodate reserved scrollbars; final width verification is recorded in validation.md.
- **P2, remaining — review section uses the active page stage:** the live campaign at stage 3 rendered an empty `<h2>` under `campaign-step-4`. `StudioApp` passes `stage={stage}` into that ReviewStage; its title array is empty for stages 0–3. In the long page, an organism's own section identity must be separate from the active scroll/navigation stage. This needs a campaign-page composition fix and review-role regression cases, rather than a generic SectionHeading fallback that hides the cause.

## Strengths preserved

- Semantic text colors already work on their intended surfaces: `--v2-text-secondary` gives approximately 7.00:1 on white and 6.35:1 on canvas; white on danger gives 4.61:1; black on accent 13.18:1 and black on success 6.53:1. Tests resolve semantic aliases before measuring contrast.
- The 50%-black muted swatch is approximately 3.95:1 on white. It is a **decorative palette sample**, not a confirmed body-text failure. The live catalog uses `--v2-text-secondary` for secondary copy and now labels the swatch's constraint.
- Shared buttons expose busy/disabled semantics and guard duplicate actions; primary buttons have a 48px target. Focus combines a cyan outline with a black inner ring. Compact shared buttons and tabs use at least 44px.
- Existing modal/inline confirmation examples manage cancel focus, Escape and trigger restoration. Tabs already had arrow wrapping/Home/End behavior, which was preserved.
- Native labels, table headers, scroll regions, live statuses, responsive rules and reduced-motion alternatives provide a useful base. Application chrome and banner artwork styles are already conceptually separate.

## Practical Atomic Design hierarchy

| Level | Responsibility | Actual location / examples |
| --- | --- | --- |
| Foundations | Values and assets with no task behavior | `foundations/tokens.css`: primitive palette, semantic roles, type, spacing, sizing, radii, border, elevation, motion; Lucide icons |
| Atoms | One action or basic visual/control responsibility | `atoms/AppButton.jsx`; native input/checkbox/etc extraction next |
| Molecules | A coordinated interaction built from simpler elements | `molecules/PillTabs.jsx`, `WorkflowSteps.jsx`, `SelectMenu.jsx`; FormField next |
| Organisms | A complete task section | `organisms/PromptComposer.jsx`; feature organisms stay in `studio/` |
| Templates | Content-independent layout with slots | `templates/README.md` defines candidate AppShell/Gallery structure; no shared template API falsely claimed |
| Pages/examples | Realistic compositions, reference helpers, experiments | `examples/`; `DesignSystemScreen` and `ApplicationDesignSystemPage` are pages, never product primitives |

Ambiguous cases are classified by responsibility, not the count of nested elements. WorkflowSteps is a molecule; CampaignTimeline, which maps domain permissions/readiness to eight steps, is a feature organism. A native input is an atom; a labelled input with help/error association is a FormField molecule. A semantic Table primitive is an atom-level structural tool; filtering, loading, selection and row actions form a DataTable organism. Modal confirmation is a molecule for one decision; a complex editing dialog may compose an organism. “TemplateLibrary” is currently a product page, and AnimatedBanner/template manifests are artwork—not application templates.

Naming: PascalCase noun/responsibility for React exports; lower-case atomic folders; `*Example`/`*Specimens` for reference compositions; feature-specific names stay in `studio/`. New imports use the atomic path. Keep current `v2-*` CSS classes and semantic tokens during migration; a cosmetic prefix rename would add risk without improving behavior. Boolean busy/disabled/iconOnly props, finite emphasis/size options and native interaction states replace combinatorial variant names. Icon position comes from child composition. Domain state maps to visual state at the feature boundary.

## Accessibility and validation limits

This audit uses [W3C tabs guidance](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) for panel relationships and keyboard interaction. Normal text contrast follows [WCAG 2.2 contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): 4.5:1 for normal text and 3:1 for qualifying large text. The library's 44/48px target policy is a design choice; [WCAG 2.2 target-size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) is 24×24 CSS pixels with defined exceptions, not a universal 44px AA requirement.

No screen-reader audit, forced-colors audit, complete target-spacing audit or complete contrast traversal has been performed. Browser layout checks and JSDOM tests cannot prove all native-dialog, assistive-technology or mobile-browser behavior. The fixed-ID legacy specimens must appear only once per page. Dynamic/disabled/vertical tabs, async option loading and typeahead are not supported contracts. Backend approval permissions, real provider generation, document extraction and exports are outside these UI mutations and require their own integration checks.

See [migration](migration.md), [component contracts](components.md), [extension roadmap](roadmap.md) and [validation](validation.md) for completed changes and remaining work.
