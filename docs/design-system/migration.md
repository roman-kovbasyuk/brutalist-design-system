# Migration map and compatibility

> Historical design-system migration record. Product paths and consumer claims below describe the original host application, which is not part of this standalone workspace. For current boundaries, see [component ownership](../../src/components/design-system/README.md) and [validation](validation.md).

All paths below are repository-relative. Reversible moves retain the original module as a re-export of the **same component**, preserving component identity and old consumers. This work introduces no removed export, renamed state value, route change or backend mutation. HMR may reset a currently open demo's local state; persistent campaign data is unaffected.

| Current component / location | Target location / name | Action | Reason |
| --- | --- | --- | --- |
| `components/design-system/AppButton.jsx` | `components/design-system/atoms/AppButton.jsx` | **Moved; old export retained** | One action responsibility; supports independent emphasis, size and icon shape. |
| `AppButton.variant="icon"` | `AppButton iconOnly variant="secondary"` | **Deprecated alias retained** | Icon shape is independent of emphasis; use primary/danger when the action needs them. |
| `studio/primitives.Button` | Adapter over `atoms/AppButton` | **Retained; canonical import updated** | Existing `primary` callers remain valid; avoid mass JSX changes during active work. New shared code uses AppButton. |
| `components/ui/Button` | Legacy `components/ui/button.jsx` | **Retained; migration proposed** | Radix Slot/asChild, CVA size APIs and Sidebar dependencies differ; visual similarity does not establish substitutability. |
| `design-system/PillTabs.jsx` | `design-system/molecules/PillTabs.jsx` | **Moved; old exports retained; PillTabPanel added** | Coordinate selection, keyboard behavior and associated content. |
| `studio.css` and catalog PillTabs rules | `molecules/pill-tabs.css` | **Consolidated** | Shared component owns appearance and motion; TemplateLibrary owns spacing. |
| `TemplateLibrary` unlabelled category content | `PillTabPanel` per category | **Migrated in place** | Every aria-controls points to an existing, correctly labelled panel. |
| `design-system/WorkflowSteps.jsx` | `design-system/molecules/WorkflowSteps.jsx` | **Moved; old export retained** | Ordered navigation independent of campaign eligibility rules. CSS compatibility path retained. |
| `studio/CampaignTimeline.jsx` | Same feature location; consumes `molecules/WorkflowSteps` | **Retained; canonical import updated** | Domain-derived workflow state belongs to the feature. |
| `design-system/PromptComposer.jsx` | `design-system/organisms/PromptComposer.jsx` | **Moved; old export retained; readonly corrected** | Complete brief task section; caller retains request and validation ownership. |
| `BriefStage` composer import, used by StudioApp entry and campaign page | `organisms/PromptComposer` | **Canonical consumer migrated** | Both production compositions use the library owner through BriefStage. |
| `UIBlocks.BlockSelect` + campaign-status select markup | `molecules/SelectMenu.jsx` + `select-menu.css` | **Extracted and consolidated** | Same single-select purpose; four catalog call sites now share keyboard and dismissal logic. |
| `ControlSpecimens` + `NavigationSpecimens` | `examples/ControlSpecimens.jsx` | **Moved; old exports retained** | Demonstration sections are not standalone controls. Loading button now exercises AppButton.busy. |
| `AdvancedControlSpecimens` | `examples/AdvancedControlSpecimens.jsx` | **Moved; old export retained** | Local state examples remain explicit until individual controls are extracted. |
| `FeedbackSpecimens`, `DataSpecimens`, `ContentObjectSpecimens` | `examples/DataSpecimens.jsx` | **Moved; old exports retained** | Sample campaign data and local StatusLabel are not production models. |
| Three `SpecimenCard` implementations | `examples/SpecimenCard.jsx` | **Consolidated; old public export retained** | Identical documentation framing, no domain dependencies. |
| `SpecimenSection` | `examples/SpecimenSection.jsx` | **Moved; old export retained** | Documentation layout and example IDs stay out of library components. |
| `MotionSpecimens` | `examples/MotionSpecimens.jsx` | **Moved; old export retained** | Overlay/motion demos need extraction before product adoption. |
| `ResponsiveSpecimen` | `examples/ResponsiveSpecimen.jsx` | **Moved; old export retained** | Example layout, not an application shell. |
| `UIBlocks`, `PromptInputBlock`, `SchedulingBlock`, `SettingsBlock` | `examples/UIBlocks.jsx` | **Moved; old exports retained; labelled exploratory** | These blocks have local state and unsupported product capabilities; do not merge with PromptComposer. |
| `styles/tokens.css` v2 declarations | `design-system/foundations/tokens.css` imported by the old CSS entry | **Moved; aliases added; values preserved** | Raw palette and semantic roles now have a clear owner. Legacy tokens retained separately. |
| Inline `bs-field` / `AdvancedControlSpecimens.Field` | Proposed `atoms/Input`, `Textarea`, `NativeSelect` + `molecules/FormField` | **Recommended; not implemented** | Share label/help/error relationships across banner and review forms. |
| Local `StatusLabel`, `bs-status`, `bs-tag` | Proposed `atoms/StatusBadge` + feature status adapter | **Recommended; not merged** | State display, arbitrary metadata and actions have distinct semantics; migration needs status mapping. |
| `bs-view-switch` and `v2-segmented-control` | Proposed `molecules/SegmentedControl` | **Recommended** | Same choose-a-view responsibility without tab/panel semantics. |
| `ErrorNotice`, `bs-info`, processing/empty examples | Proposed shared feedback primitives/AsyncState | **Recommended** | Agree retry, error detail and live-region contracts first. |
| `ConnectedStudio` shell | Proposed `templates/AppShell` | **Recommended; no fake shared template created** | Extract layout slots without relocating API orchestration or workflow state. |
| `AnimatedBanner`, banner manifests, BrandDesignSystems | Existing artwork/feature locations | **Retained** | Campaign creative is not the application design system. |
| Campaign preview toolbar / legacy body minimum | Compact wrapping in studio.css + scoped active-page minimum reset | **Fixed** | Avoid replay-button overflow and a scrollbar-width overflow at 320px without changing legacy pages. |
| Old root DESIGN.md | `docs/design-system/legacy-visual-reference.md` | **Archived; current root guide updated** | Preserve the prior identity as historical context without presenting it as current. |

## Consumer/dependency checks

Before consolidation, searched all source imports and read production call sites. SpecimenCard was an internal helper plus a local public helper with equivalent markup. PromptInputBlock and PromptComposer had materially different behaviors, so neither was deleted. Legacy shadcn/Radix components have internal sidebar dependencies and tests, so none were replaced automatically. Product call sites now import canonical atomic paths; compatibility wrappers preserve all former exports. Tests continue to import some wrappers to exercise compatibility.

No true Figma instances, component sets or variable bindings were involved. In this React system, the equivalent preservation boundaries are module exports, component identity, props, callback payloads, class names, DOM relationships and semantic token names.

## Remaining migration / future breaking changes

- Remove compatibility files only after all reachable consumers and downstream users have migrated; announce removal in a versioned change log. Do not infer zero usage solely from current route reachability.
- `Button.primary` to `AppButton.variant` remains a future source migration. `components/ui/Button` requires a separate Radix/Slot consumer audit.
- Preserve label-derived tab IDs and explicit unique idPrefix until an intentional migration to stable item IDs. Localization or duplicate labels can collide today.
- Example-only controls are not supported production APIs. Promote a control only with props, interaction contract, real call site, and behavioral checks.
- The readonly textarea change is intentional behavior: reviewers can focus/read it but cannot edit or submit it. Busy/disabled remain locked.

## Rollback

No commit or stash was created because this worktree contains other ongoing work. A pre-edit source backup and SHA-256 manifest are at `/tmp/banner-studio-ds-audit/before` and `/tmp/banner-studio-ds-audit/before.json`; the baseline Git status is alongside them. Final touched-file inventory is recorded in `validation.md` and the audit backup directory. Restore **only this migration's edits**, checking for subsequent edits first. Do not run a blanket git reset/checkout or restore the entire backup over concurrent work. New atomic/example modules can be removed after their old implementations are restored. The old CSS entry point and module wrappers make incremental rollback possible.
