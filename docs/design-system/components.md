# Component contracts

Current, code-backed inventory. The same records power the searchable live catalog. Shared indicates an exported reusable API; usage states whether production has adopted it. Native interaction states are not separate variants.

## Foundations

Shared visual values and assets; no application behavior.

### Application tokens

**Shared** · [Source](../../src/components/design-system/foundations/tokens.css)

The light application palette, typography, spacing, shape, dimensions, and motion.

See [typography roles](typography.md) for the H1–H5, lead, body and small-text scale, weights, line heights and usage.

- **Properties:** Primitive palette → semantic --v2-* roles. Typography: H1–H5, Lead Large, Lead Medium, Body, Small text. Control height: 48px default / 44px compact. Icons: 16 / 20 / 24px.
- **States:** Light theme; reduced motion through component CSS. Dark mode is not supported by the application.
- **Usage/dependencies:** Consumed by catalog and Studio. Use semantic roles in components; primitives only define the palette.
- **Constraints:** --v2-muted is a palette sample, not body text. Use --v2-text-secondary. Legacy --accent/--ink remain compatibility tokens. Lucide icons are decorative unless given an accessible name.

## Atoms

One control or visual responsibility.

### TextAction

**Shared** · [Source](../../src/components/design-system/atoms/TextAction.jsx)

Low-emphasis action below related content. Accepts native AppButton props and children; composes quiet/compact styling with an underlined small label and a 44px keyboard/touch target. Disabled and busy states inherit AppButton. Visuals uses it for upload and exact prompt copying; file handling and feedback belong to the module. Use anchors for navigation.

### AppButton

**Shared** · [Source](../../src/components/design-system/atoms/AppButton.jsx)

Trigger an application action, including a pending operation.

- **Properties:** variant: primary | secondary (default) | danger | quiet; size: default | compact; iconOnly, busy, disabled: booleans; native button props and ref.
- **States:** Default, hover, focus-visible, pressed, disabled, busy. Native states are not separate variants.
- **Usage/dependencies:** Used by Studio Button adapter and PromptComposer. Place decorative icon children before or after the label.
- **Constraints:** Icon-only buttons require aria-label. Busy blocks repeated activation; the caller supplies a meaningful label. type defaults to button. Legacy variant="icon" maps to secondary + iconOnly.

### TokenChip

**Shared** · [Source](../../src/components/design-system/atoms/TokenChip.jsx)

Display a CSS token as a chip and copy its name to the clipboard.

- **Properties:** `token`: CSS custom-property name, such as `--v2-accent`. Composes AppButton.
- **States:** Idle, hover, focus, copying, copied confirmation, failure with retry. Enter/Space activate.
- **Usage/dependencies:** Typography and color values in the catalog. No active Studio consumer yet.
- **Constraints:** Copies the exact token name, without `var()` or the resolved value. Requires browser clipboard access; confirms only after a successful write. Minimum 44px target.

### TokenCopyTarget

**Shared** · [Source](../../src/components/design-system/atoms/TokenCopyTarget.jsx)

Make a rendered value copyable while keeping the token name out of the specimen layout.

- **Properties:** `copyValue`: exact clipboard value; `label`: accessible copy description; `children`: rendered visual; `className?`.
- **States:** Idle, hover, focus-visible, copying, copied confirmation, failure with retry. Enter/Space activate.
- **Usage/dependencies:** Foundations uses it for color swatches, typography samples, and spacing markers. It composes AppButton and the shared clipboard interaction.
- **Constraints:** The visual target remains a keyboard-operable 44px button. Copy feedback is exposed in a status region; the caller owns the displayed value and semantic token mapping.

### Native inputs and selection controls

**Examples only** · [Source](../../src/components/design-system/examples/ControlSpecimens.jsx)

Text input, textarea, native select, checkbox, radio, switch, file input, and disabled controls.

- **Properties:** Native value/defaultValue, checked, required, disabled, readOnly, min/max. These specimens do not export reusable control components.
- **States:** Objective validation and disabled examples exist; full state coverage varies by control.
- **Usage/dependencies:** Studio currently uses local bs-field markup. Extract controls and FormField before adding more product fields.
- **Constraints:** Labels must remain associated with controls; help/error IDs must be in aria-describedby. The file specimen advertises 25 MB but does not enforce it. Do not copy it as an uploader.

### StatusLabel and progress

**Examples only** · [Source](../../src/components/design-system/examples/DataSpecimens.jsx)

Communicate state with text plus a symbol; communicate known or unknown progress.

- **Properties:** Local StatusLabel: tone neutral | success | warning | danger, icon, children. Progress uses native ARIA values.
- **States:** Draft, ready, review due, blocked; determinate and indeterminate examples.
- **Usage/dependencies:** Production uses bs-status and workflow statusLabel(). Promote a shared StatusBadge with a separate campaign-status adapter.
- **Constraints:** A status badge is not an action or live region by default. Do not invent progress percentages for unknown generation work.

### Legacy UI primitives

**Legacy** · [Source](../../src/components/ui/)

Button, Input, Textarea, Badge, Alert, Separator, Skeleton, RadioGroup, Table and supporting Radix primitives.

- **Properties:** Existing shadcn/Radix APIs; Button uses default/destructive/outline/secondary/ghost/link and separate size options.
- **States:** Existing primitives have their own theme and state rules; this is not the active Studio component API.
- **Usage/dependencies:** Retained for MvpShell, CampaignSidebar and legacy consumers. Active App routes to StudioApp.
- **Constraints:** Do not replace automatically: asChild, Radix composition, and sidebar dependencies require explicit migration. Table is an unstyled structural primitive, not a data-table organism.

## Molecules

Related controls with one shared interaction contract.

### PillTabs + PillTabPanel

**Shared** · [Source](../../src/components/design-system/molecules/PillTabs.jsx)

Choose one content panel with keyboard navigation and stable relationships.

- **Properties:** tabs: unique string labels; value; onChange(label); ariaLabel; idPrefix. Panel: tab, value, same idPrefix, children, className.
- **States:** Selected/unselected, hover, focus; ArrowLeft/Right wrap; Home/End; automatic activation.
- **Usage/dependencies:** TemplateLibrary and NavigationSpecimens. Provide one panel per tab and a unique idPrefix per tab group.
- **Constraints:** For local content with immediate updates. No disabled/vertical/dynamic-tab support yet. Do not use tabs for routes or table density; use links or a segmented control.

### SelectMenu

**Shared** · [Source](../../src/components/design-system/molecules/SelectMenu.jsx)

Choose one value from a small list with consistent focus and dismissal.

- **Properties:** label, value, options: unique strings, onChange(value), triggerLabel?, triggerId?, disabled?.
- **States:** Open/closed, selected, focus, disabled; arrows wrap, Home/End, Enter/Space, Escape, outside click and blur.
- **Usage/dependencies:** Used in campaign-status, prompt model/effort and language specimens. No active Studio call site yet.
- **Constraints:** Prefer native select for forms. No hidden form value, typeahead, multiple selection or async search. Those are distinct patterns. Keep options stable while open.

### WorkflowSteps

**Shared** · [Source](../../src/components/design-system/molecules/WorkflowSteps.jsx)

Expose an ordered workflow, its current step, and completion.

- **Properties:** items: label, context, complete, current, href?, disabled?; ariaLabel; onNavigate(index)?.
- **States:** Complete/current/upcoming; optional disabled navigation; aria-current="step".
- **Usage/dependencies:** CampaignTimeline maps campaign state to steps. The component does not decide whether work is complete.
- **Constraints:** Classified as molecule because it owns only the ordered step interaction. The timeline with workflow rules is a feature organism. Disabled links prevent activation but remain discoverable.

### Search, pickers and value controls

**Examples only** · [Source](../../src/components/design-system/examples/AdvancedControlSpecimens.jsx)

Search, password visibility, currency, date range, combobox, single/multi-select, stepper, rating, and sliders.

- **Properties:** Local state and fixed example values; no reusable props contract. Native input constraints where shown.
- **States:** Market filtering, no results, selected channels, bounded values, determinate/indeterminate progress.
- **Usage/dependencies:** Product needs campaign search and template filters. Budget, rating, audience age and scheduling have no confirmed active workflow.
- **Constraints:** Multi-select and searchable-combobox focus/dismissal still require extraction. Help text is not consistently associated. Do not treat every displayed control as production-ready.

### Overlays and feedback

**Examples only** · [Source](../../src/components/design-system/examples/MotionSpecimens.jsx)

Menu, tooltip, toast, inline confirmation and modal confirmation demonstrations.

- **Properties:** Internal open/closed state. Modal uses native dialog; local refs restore focus.
- **States:** Open/closed; initial cancel focus, trapped modal focus, Escape and trigger restoration.
- **Usage/dependencies:** Production campaign menus and errors are implemented separately. Extract a shared menu/confirmation contract before expanding deletion flows.
- **Constraints:** Specimen modal is not a reusable Dialog API. Menu uses a group of buttons, not menu roles. Toast is local-only; there is no global notification queue.

## Organisms

Complete task sections composed from smaller controls.

### MediaWorkflowCard

**Shared** · [Source](../../src/components/design-system/organisms/MediaWorkflowCard.jsx)

Labelled result with `title`, optional `context`/`status`, `selected`, and ordered `columns: [{id, label, content, actions}]`. Column IDs must be unique. Uses H3/H4 headings and app tokens. Three areas share a row at **720px card width**, otherwise stack without reordering. Caller supplies loading/error/ready content and actions; the component never generates or loads assets. Current consumer: Visuals (Prompt → Static visual → Video).

### PromptComposer

**Shared** · [Source](../../src/components/design-system/organisms/PromptComposer.jsx)

Write a campaign brief, attach documents, and submit one request.

- **Properties:** value, onChange, files [{id,name}], onAttach(FileList), onRemove(id), onSubmit, canSubmit, busy, disabled, readOnly, hint, placeholder, submitLabel.
- **States:** Empty/ready, attachment list, drag-over, busy/disabled, readable read-only. Ctrl/⌘+Enter submits; plain Enter adds a line.
- **Usage/dependencies:** StudioApp campaign entry and BriefStage. AppButton handles submission; the caller owns validation, extraction, errors and requests.
- **Constraints:** Accepts TXT/MD/PDF/DOCX. Production caller enforces 5 MB/file and 20,000 combined characters. No model selector or slash commands. Never starts generation merely by mounting.

### CampaignTimeline

**Feature-specific** · [Source](../../src/studio/CampaignTimeline.jsx)

Map campaign readiness and review rules to eight workflow steps.

- **Properties:** workspace, stage, pending, onChange; depends on WorkflowSteps and studio/workflow.js.
- **States:** Brief → Copy → AI assets → Banners → Review file → Figma review → Approval → Assets ready.
- **Usage/dependencies:** Campaign workspace navigation; remains in studio because it knows workflow rules.
- **Constraints:** Do not move domain eligibility, version state or review approval rules into generic WorkflowSteps.

### CopyStage and campaign objects

**Feature-specific** · [Source](../../src/studio/CopyStage.jsx)

Review, select, delete and regenerate copy options in list, card and banner views.

- **Properties:** Workspace data and explicit action callbacks; depends on AppButton through the Studio Button adapter.
- **States:** No copies, generated options, selected option, pending action, read-only and local errors.
- **Usage/dependencies:** Production CopyStage, VisualStage, BannerStage and ReviewStage own different workflow responsibilities.
- **Constraints:** Do not merge campaign cards, prompt cards, asset tiles and banner artwork into a generic variant set. Extract DataTable only when multiple real workflows share its behaviors.

## Templates

Page structure and slots; separate from banner artwork templates.

### Application shell

**Feature-specific** · [Source](../../src/studio/StudioApp.jsx)

Arrange navigation, campaign context, workspace content and mobile navigation.

- **Properties:** Currently composed inside ConnectedStudio; no standalone shared layout API.
- **States:** Loading/error/empty workspace, selected campaign, menu open, compact viewport.
- **Usage/dependencies:** Active /mvp routes. Candidate AppShell slots: navigation, context, content, feedback.
- **Constraints:** Extract structure separately from API requests, authentication and campaign state. Existing components/AppShell.jsx belongs to the legacy app; it is not a drop-in replacement.

### TemplateLibrary page

**Feature-specific** · [Source](../../src/studio/TemplateLibrary.jsx)

A gallery page with category tabs, empty states and a choose action.

- **Properties:** templates, onChoose, canChoose; shared PillTabs/PillTabPanel and application buttons.
- **States:** Banners gallery, unimplemented-category empty state, no published templates, previews playing/paused.
- **Usage/dependencies:** Representative gallery page; potential GalleryTemplate only after another comparable page exists.
- **Constraints:** AnimatedBanner and banner template manifests describe campaign artwork. They are content objects, not reusable application page templates.

## Pages and examples

Realistic compositions and experiments; not reusable production APIs.

### Catalog specimens

**Examples only** · [Source](../../src/components/design-system/examples/)

ControlSpecimens, NavigationSpecimens, FeedbackSpecimens, DataSpecimens, ContentObjectSpecimens, MotionSpecimens and ResponsiveSpecimen.

- **Properties:** No production data contract. SpecimenCard(title, description, children, className) and SpecimenSection(index, title, description, children) are documentation helpers.
- **States:** Local demonstrations; responsive preview toggle, example data and interactive state showcases.
- **Usage/dependencies:** DesignSystemScreen is the catalog composition; ApplicationDesignSystemPage is its route wrapper.
- **Constraints:** Sample campaign names and metrics are illustrative. Render this catalog once per page because legacy specimens use fixed IDs. The live app is the authority for supported workflows.

### PromptInputBlock, SchedulingBlock, SettingsBlock

**Exploratory** · [Source](../../src/components/design-system/examples/UIBlocks.jsx)

Explore a command composer, review booking, and preferences in isolated local state.

- **Properties:** No external props; SelectMenu supplies the shared single-select interaction. Fixed availability and simulated completion.
- **States:** Slash-command selection, simulated busy/cancel, time selection, dirty/save/cancel preferences.
- **Usage/dependencies:** Optional examples only. Use PromptComposer for the actual brief workflow.
- **Constraints:** No real booking, AI model switching, persisted preferences, or application dark mode. The preview’s 25 MB contract and Enter-to-send do not apply to production.

## Native specimen coverage and extraction boundaries

These are local examples unless a shared API is explicitly named above. Label/help/validation composition belongs in FormField; browser-native states remain native props. This matrix identifies the component boundary instead of claiming each specimen is an exported production component.

| Component / specimen | Purpose and relevant properties | Shown states | Constraints / next work |
| --- | --- | --- | --- |
| Input / Textarea / NativeSelect | Text or one native option; value, onChange, required, disabled, readOnly | Blank, placeholder, disabled owner, objective validation | Input/textarea/select styling is repeated in Studio. Associate help/error IDs; add error/readonly to every relevant example. |
| Checkbox / Radio / Switch | Boolean or exclusive choice; checked/onChange, name, disabled | Animated format, square/portrait, autosave, disabled publish | Keep native grouping and labels; switch is a button with role=switch and aria-checked. No mixed checkbox specimen. |
| FileDrop | Select a local reference file; accept | PNG/JPG/MP4 picker | No advertised-size enforcement. Use the actual brief file policy when extracting an upload field. |
| SearchControl | Search by campaign name | Search input with icon and shortcut hint | The displayed ⌘K hint has no matching catalog shortcut. Do not imply the shortcut is implemented. Production sidebar search is separate. |
| PasswordField | Reveal a value; input type, toggle label | Hidden/visible sample token | Preserve value; link help text; use generated IDs; do not ship the fixed sample value. |
| CurrencyField / TimeField / ColorField / ReadOnlyField | Typed numeric/time/color/identifier values | $ + USD; time; color and hex synchronization; readonly ID | Native constraints only; invalid hex text is not a validated product error state. Budget/time/color needs are not established for the active workflow. |
| DateRange | Select start and end | Native dates with end minimum | Minimum end is a fixed example date, not synchronized state. Validate range semantics in a production extraction. |
| MarketCombobox | Filter a small list; query, active option, selected value | Keyboard search, results/no results | Fixed IDs, local options; needs unified focus/blur/outside click behavior and help association before reuse. |
| SelectMenu | Small single selection | Shared arrows/Home/End, open/selected/closed, Escape | Shared API above; no multi-select, form serialization, typeahead or asynchronous loading. |
| MultiSelect + removable chips | Select several channels | Open listbox, selected/unselected, removal | Independent demo implementation; keyboard roving and dismissal still need work. Chips are buttons, not status badges. |
| NumberStepper | Increase/decrease bounded variation count | 1–12 range | Pair editable numeric input and buttons; expose disabled-at-boundary in production contract. |
| Rating | Express 1–5 quality | Radio selection and readable “n of 5” | Optional product enhancement; no workflow evidence that ratings are needed. |
| Slider / Range | Adjust intensity or age bounds | Value output, 0–100 intensity, min/max age | Each handle has a label; define crossing and validation policy before using a range for real data. |
| ProgressBar / ProgressSteps / ProgressRing | Known or unknown task progress | Determinate, indeterminate, step 3 of 5, readiness | Label each progressbar. Match real work; never use these sample percentages for live AI requests. |
| NavigationItem | Select location | Sidebar specimen with current page and count | Specimen uses inert buttons. Production navigation uses routes/links; extract route-aware composition separately. |
| SegmentedControl | Change presentation density/view | Comfortable/compact, Table/Cards/Banners in production | State is aria-pressed; no tab panels. Shared extraction next. |
| Breadcrumb / Pagination | Hierarchy and local result movement | Current crumb/page, boundary arrows | Breadcrumb links are inert demonstrations. Native nav/list structure; no server pagination contract. |
| Metric / SummaryRows / DataTable | Compare structured information | Sample metrics, semantic rows/headers, horizontal scroll | DataTable is local markup, not reusable sorting/filtering/selection. Editable sample th has no save/error lifecycle. |
| CampaignCard / PromptCard / AssetTile / BannerPreview / ReviewItem | Present different creative objects | Sample labels, metadata, image placeholder and review-needed state | Keep purposes separate. Current preview graphics are illustrative, not generated production assets. |
| Menu / Tooltip / Toast | Contextual options/help/non-blocking state | Open menu, visible tooltip text, dismissible local toast | These demos do not constitute a global overlay or notification API. |
| InlineConfirmation / ModalConfirmation | Confirm one destructive choice | Cancel/delete, modal focus containment, Escape and restoration | Local only; no business mutation. Extraction must handle failures and pending work. |
| MotionCard / Disclosure / ResponsiveSpecimen | Explain physical feedback, details expansion, layout reflow | Hover/focus/press, open details, compact layout | Documentation-only. Preserve reduced-motion alternatives and do not import into product flows. |

## Retained legacy component sets

### WorkflowModuleFrame

Canonical workflow card organism at `organisms/WorkflowModuleFrame.jsx`, used by all six campaign modules and their isolated harness. Props: unique `id`, `title`, `busy`, `children`. It supplies a labelled section, one H2, white surface, rounded border and responsive spacing. It contains no domain logic or fetching. Module bodies must not repeat the frame heading. Desktop H2 uses `--v2-text-h2`; the existing compact rule uses 30px below 600px. The page controls spacing between frames and scroll positioning; the frame owns its internal appearance.

These files remain under `src/components/ui`. They depend on the legacy shadcn token stylesheet, utility classes and Radix; their presence is not evidence of active Studio adoption. All wrappers pass through underlying/native props in addition to the named options below. Existing tests and consumers remain intact.

| Set / exports | Responsibility and composition | Properties / states | Usage constraints |
| --- | --- | --- | --- |
| Button, buttonVariants | Action atom | variant default/destructive/outline/secondary/ghost/link; default/xs/sm/lg/icon sizes; asChild; native disabled/focus | Slot composition differs from AppButton; migrate callers individually. |
| Input, Textarea | Native text atoms | Native props; focus/invalid/disabled classes; textarea content sizing | Caller must supply labels/descriptions. Legacy Input defaults to 36px height, unlike the active 48px target. |
| Badge, badgeVariants | Metadata/status atom | default/secondary/destructive/outline/ghost/link; asChild | Do not map arbitrary metadata to campaign status automatically. |
| Alert, AlertTitle, AlertDescription | Feedback molecule | default/destructive; role=alert; native props | AlertTitle clamps to one line. Long error headings need verification before reuse. |
| RadioGroup, RadioGroupItem | Exclusive selection molecule/atom | Radix Root/Item props, checked/disabled/focus | Provide a group name and each option label; visual 16px radio may need a larger label target. |
| Separator | Structural atom | horizontal/vertical; decorative defaults true | Preserve decorative vs semantic intent. |
| Skeleton | Loading visual atom | className/dimensions; pulse | No automatic status announcement. Check reduced-motion stylesheet before adoption. |
| Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption | Table structural set | Native table props; selected-row styling; overflow wrapper | No data/sort/filter contract. Header scope, caption and keyboard scroll access are caller responsibilities. |
| ScrollArea, ScrollBar | Overflow molecule | Radix props; scrollbar orientation defaults vertical | Use native overflow when it suffices; preserve keyboard access and content sizing. |
| Tooltip, TooltipTrigger, TooltipContent, TooltipProvider | Supporting-help molecule | Radix open state; delayDuration=0, sideOffset=0; portal | Never hide essential instructions exclusively in a tooltip. |
| Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription | Dialog/drawer molecule | Radix state; content side right/left/top/bottom; showCloseButton | Content title/description, focus return, native/drawer behavior require browser checks; 300/500ms styles differ from active motion roles. |
| SidebarProvider, Sidebar, SidebarTrigger, SidebarRail, SidebarInset, SidebarInput, SidebarSeparator, useSidebar | Navigation organism and state | controlled/uncontrolled open, mobile open, side; sidebar/floating/inset; offcanvas/icon/none; Ctrl/⌘B | Depends on Button, Input, Sheet, Separator, Skeleton, Tooltip and useIsMobile. Writes sidebar_state cookie. Keep out of the active shell until intentionally migrated. |
| SidebarHeader, SidebarFooter, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupAction, SidebarGroupContent | Sidebar composition helpers | native props; optional Slot/asChild where implemented | Internal slots, not independent page templates. |
| SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuAction, SidebarMenuBadge, SidebarMenuSkeleton, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton | Sidebar navigation-item set | active, size, variant, tooltip and Slot props where implemented | Preserve route semantics, selected state, hover/focus access and collapsed/mobile behavior during any extraction. |
