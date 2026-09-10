# Component contracts

Local catalog inventory, grouped by responsibility. “Shared” means reusable in this source tree, not necessarily a public package export. The [package entry](../../src/components/design-system/index.ts) is the authoritative public API; see [getting started](getting-started.md). Examples and compatibility paths are identified separately.

## Foundations

Shared visual values and assets; no application behavior.

### Application tokens

Shared · [Source](../../src/components/design-system/foundations/tokens.css)

The light application palette, typography, spacing, shape, dimensions, and motion.

- Properties: Primitive palette → semantic --v2-* roles. Typography: H1–H5, Lead Large, Lead Medium, Body, Small text. Control height: 48px default / 44px compact. Icons: 16 / 20 / 24px.
- States: Light theme; reduced motion through component CSS. Dark mode is not supported by the application.
- Usage: Consumed by the catalog and shared components. Use semantic roles in components; primitives only define the palette.
- Constraints: --v2-muted is a palette sample, not body text. Use --v2-text-secondary. Legacy --accent/--ink remain compatibility tokens. Lucide icons are decorative unless given an accessible name.

## Atoms

One control or visual responsibility.

### Switch

Shared · [Source](../../src/components/design-system/atoms/Switch.jsx)

Toggle a single boolean preference with canonical UI-control styling.

- Properties: label, checked, onChange, disabled, native button props.
- States: On, off, hover, keyboard focus and disabled.
- Usage: Settings UI block and deferred notification preferences.
- Constraints: Use a visible label and native disabled semantics. Caller owns persistence; Enter and Space toggle.

### UpdatedText

Shared · [Source](../../src/components/design-system/atoms/UpdatedText.jsx)

Briefly acknowledge a saved text change within the same entity.

- Properties: value, identity; also exports useTextUpdate(value, identity) for an existing element.
- States: Initial and identity-change values remain static; same-identity changes set a 200ms updated flag. Reduced motion removes the CSS animation.
- Usage: Use in an application shell to acknowledge saved titles.
- Constraints: Pass a stable entity identity. Visual acknowledgement only; does not persist text, manage editing or announce updates through a live region.

### TextAction

Shared · [Source](../../src/components/design-system/components/actions/TextAction.tsx)

A low-emphasis text action beneath related content.

- Properties: AppButton props and children; quiet, compact, underlined label.
- States: Default, hover, focus, disabled, busy; native keyboard activation.
- Usage: Catalog upload and copy actions. The caller owns file handling and clipboard feedback.
- Constraints: Keeps a 44px touch target despite its small label. Use as="a" with href for navigation.

### AppButton

Shared · [Source](../../src/components/design-system/components/actions/AppButton.tsx)

Trigger an application action, including a pending operation.

- Properties: variant: primary | secondary (default) | danger | quiet; size: default | compact; iconOnly, busy, disabled: booleans; native button props and ref.
- States: Default, hover, focus-visible, pressed, disabled, busy. Native states are not separate variants.
- Usage: Used by catalog specimens and PromptComposer. Place decorative icon children before or after the label.
- Constraints: Icon-only buttons require aria-label. Busy blocks repeated activation; the caller supplies a meaningful label. type defaults to button. Legacy variant="icon" maps to secondary + iconOnly.

### TokenChip

Shared · [Source](../../src/components/design-system/atoms/TokenChip.jsx)

Display a CSS token as a chip and copy its name to the clipboard.

- Properties: token: CSS custom-property name, such as --v2-accent. Composes AppButton.
- States: Idle, hover, focus, copying, copied confirmation, failure with retry. Enter/Space activate.
- Usage: Typography and color values in the catalog. Documentation helper, not a package export.
- Constraints: Copies the exact token name, without var() or the resolved value. Requires browser clipboard access; confirms only after a successful write. Minimum 44px target.

### TokenCopyTarget

Shared · [Source](../../src/components/design-system/atoms/TokenCopyTarget.jsx)

Make a rendered value copyable while keeping the token name out of the specimen layout.

- Properties: copyValue: exact clipboard value; label: accessible copy description; children: rendered visual; className?.
- States: Idle, hover, focus-visible, copying, copied confirmation, failure with retry. Enter/Space activate.
- Usage: Foundations uses this for color swatches, typography samples, and spacing markers.
- Constraints: The visual target remains a keyboard-operable 44px button. Copy feedback is exposed in a status region; the caller owns the displayed value and semantic token mapping.

### Native inputs and selection controls

Examples only · [Source](../../src/components/design-system/examples/ControlSpecimens.jsx)

Text input, textarea, native select, checkbox, radio, switch, file input, and disabled controls.

- Properties: Native value/defaultValue, checked, required, disabled, readOnly, min/max. These specimens do not export reusable control components.
- States: Objective validation and disabled examples exist; full state coverage varies by control.
- Usage: Use FormField and shared controls when promoting an example to a product surface.
- Constraints: Labels must remain associated with controls; help/error IDs must be in aria-describedby. The file specimen advertises 25 MB but does not enforce it. Do not copy it as an uploader.

### StatusLabel and progress

Examples only · [Source](../../src/components/design-system/examples/DataSpecimens.jsx)

Communicate state with text plus a symbol; communicate known or unknown progress.

- Properties: Local StatusLabel: tone neutral | success | warning | danger, icon, children. Progress uses native ARIA values.
- States: Draft, ready, review due, blocked; determinate and indeterminate examples.
- Usage: Promote a shared StatusBadge when a product needs a durable status contract.
- Constraints: A status badge is not an action or live region by default. Do not invent progress percentages for unknown generation work.

## Molecules

Related controls with one shared interaction contract.

### FormField

Shared · [Source](../../src/components/design-system/molecules/FormField.jsx)

Keep labels and validation adjacent to native fields or shared selection controls.

- Properties: label, hint, error, id, native input props; optional children({id, describedBy}) control slot.
- States: Default, hover, focus, disabled, required, help and error.
- Usage: Settings names, email, API keys and labelled SelectMenu controls.
- Constraints: Caller owns value and validation. Associate custom controls with the supplied ID. Never prefill stored credentials.

### SelectionTile

Shared · [Source](../../src/components/design-system/components/content/SelectionTile.tsx)

Select or deselect one visual item through its entire surface.

- Properties: label, selected, onChange, disabled, children, caption, className.
- States: Unselected, selected, hover, focus-visible and disabled. Native button with aria-pressed; Enter and Space toggle.
- Usage: Catalog visual-choice previews. The caller owns selection identities and persistence.
- Constraints: Children and captions must not contain interactive controls. Indicator reveals on hover, focus and touch, and remains visible when selected. Container layout belongs to the consumer.

### InlineText

Shared · [Source](../../src/components/design-system/components/content/InlineText.tsx)

Edit a saved text value in place while retaining drafts on failure.

- Properties: label, value, sourceKey, onSave(value, capturedSourceKey), onDirty, readOnly, maxLength (500), required, multiline.
- States: Display, editing, saving, validation/error, changed-source notice, read-only. Enter saves; Shift+Enter adds a line; Escape cancels when idle.
- Usage: Catalog text-editing examples; the consumer owns parsing, validation and persistence.
- Constraints: Trims saved text. Return {ok:false,message} or throw to retain a failed draft. Captures sourceKey on edit entry; caller handles stale saves. Editable display target is at least 44px high.

### FactGrid

Shared · [Source](../../src/components/design-system/components/content/FactGrid.tsx)

Present ordered labelled facts with optional cell emphasis.

- Properties: items: [{id, label, value, emphasis?}]; label defaults to Details.
- States: Default and accent-emphasized cells; content can be text or a shared editor.
- Usage: Catalog detail examples use a semantic definition list.
- Constraints: Unique item IDs and readable labels required. Two equal columns above 480px container width; one column at or below it, in source order. No domain validation or actions.

### AsyncStatus

Shared · [Source](../../src/components/design-system/molecules/AsyncStatus.jsx)

Describe ongoing indeterminate work with a status region and decorative loading icon.

- Properties: children: meaningful stage text supplied by the caller.
- States: Mounted while work is pending; no internal request, completion or error state.
- Usage: Use for pending save, analysis or refinement operations supplied by a consumer.
- Constraints: Use actual stage wording; never simulated percentages. Caller owns timing, busy controls, requests and recovery.

### PillTabs + PillTabPanel

Shared · [Source](../../src/components/design-system/molecules/PillTabs.jsx)

Choose one content panel with keyboard navigation and stable relationships.

- Properties: tabs: unique string labels; value; onChange(label); ariaLabel; idPrefix. Panel: tab, value, same idPrefix, children, className.
- States: Selected/unselected, hover, focus; ArrowLeft/Right wrap; Home/End; automatic activation.
- Usage: Navigation specimens and product tab groups. Provide one panel per tab and a unique idPrefix per tab group.
- Constraints: For local content with immediate updates. No disabled/vertical/dynamic-tab support yet. Do not use tabs for routes or table density; use links or a segmented control.

### SelectMenu

Shared · [Source](../../src/components/design-system/molecules/SelectMenu.jsx)

Choose one value from a small list with consistent focus and dismissal.

- Properties: label, value, options: unique strings, onChange(value), triggerLabel?, triggerId?, disabled?.
- States: Open/closed, selected, focus, disabled; arrows wrap, Home/End, Enter/Space, Escape, outside click and blur.
- Usage: Used in prompt model/effort and language specimens, and Settings provider/model fields.
- Constraints: Controlled small-list selection; the consumer owns form persistence. No hidden form value, typeahead, multiple selection or async search. Keep options stable while open.

### WorkflowSteps

Shared · [Source](../../src/components/design-system/molecules/WorkflowSteps.jsx)

Expose an ordered workflow, its current step, and completion.

- Properties: items: label, context, complete, current, href?, disabled?; ariaLabel; onNavigate(index)?.
- States: Complete/current/upcoming; optional disabled navigation; aria-current="step".
- Usage: Workflow examples map product state to steps. The component does not decide whether work is complete.
- Constraints: Classified as molecule because it owns only the ordered step interaction. The timeline with workflow rules is a feature organism. Disabled links prevent activation but remain discoverable.

### Search, pickers and value controls

Examples only · [Source](../../src/components/design-system/examples/AdvancedControlSpecimens.jsx)

Search, password visibility, currency, date range, combobox, single/multi-select, stepper, rating, and sliders.

- Properties: Local state and fixed example values; no reusable props contract. Native input constraints where shown.
- States: Market filtering, no results, selected channels, bounded values, determinate/indeterminate progress.
- Usage: Use as isolated interaction examples until a shared contract is established.
- Constraints: Multi-select and searchable-combobox focus/dismissal still require extraction. Help text is not consistently associated. Do not treat every displayed control as production-ready.

### Overlays and feedback

Examples only · [Source](../../src/components/design-system/examples/MotionSpecimens.jsx)

Menu, tooltip, toast, inline confirmation and modal confirmation demonstrations.

- Properties: Internal open/closed state. Modal uses native dialog; local refs restore focus.
- States: Open/closed; initial cancel focus, trapped modal focus, Escape and trigger restoration.
- Usage: Extract a shared menu or confirmation contract before using these patterns in a product.
- Constraints: Specimen modal is not a reusable Dialog API. Menu uses a group of buttons, not menu roles. Toast is local-only; there is no global notification queue.

## Organisms

Complete task sections composed from smaller controls.

### SettingsPanel

Shared · [Source](../../src/components/design-system/organisms/SettingsPanel.jsx)

Compose settings sections from divided description/control rows and a save footer.

- Properties: title, description, titleId, as, children, footer. SettingsRow: label, description, compact. SettingsFooter: message, error, children.
- States: Responsive rows, status and error footer, consumer-supplied empty and deferred controls.
- Usage: Settings UI block examples; persistence is supplied by the consuming application.
- Constraints: Persistence belongs to the consumer. Rows stack below 600px container width; compact switch rows retain side-by-side layout.

### MediaWorkflowCard

Shared · [Source](../../src/components/design-system/organisms/MediaWorkflowCard.jsx)

Present a labelled result with three ordered content areas.

- Properties: title, context, status, selected; columns: [{id, label, content, actions}].
- States: Default and selected; source, loading, error and ready content is supplied by the caller.
- Usage: Catalog media-workflow examples; asset loading and generation stay in the consuming application.
- Constraints: Three columns at a card width of 720px; stacks in source order below it. Unique column IDs and readable labels required.

### PromptComposer

Shared · [Source](../../src/components/design-system/organisms/PromptComposer.jsx)

Write a structured prompt, attach documents, and submit one request.

- Properties: value, onChange, files [{id,name}], onAttach(FileList), onRemove(id), onSubmit, canSubmit, busy, disabled, readOnly, hint, placeholder, submitLabel.
- States: Empty/ready, attachment list, drag-over, busy/disabled, readable read-only. Ctrl/⌘+Enter submits; plain Enter adds a line.
- Usage: Catalog prompt examples. AppButton handles submission; the caller owns validation, extraction, errors, and requests.
- Constraints: Accepts TXT/MD/PDF/DOCX. The caller must enforce its own file-size and content limits. No model selector or slash commands. Never starts generation merely by mounting.

## Pages and examples

Realistic compositions and experiments; not reusable production APIs.

### Catalog specimens

Examples only · [Source](../../src/components/design-system/examples/)

ControlSpecimens, NavigationSpecimens, FeedbackSpecimens, DataSpecimens, ContentObjectSpecimens, MotionSpecimens and ResponsiveSpecimen.

- Properties: No production data contract. SpecimenCard(title, description, children, className) and SpecimenSection(index, title, description, children) are documentation helpers.
- States: Local demonstrations; responsive preview toggle, example data and interactive state showcases.
- Usage: DesignSystemScreen is the catalog composition; ApplicationDesignSystemPage is its route wrapper.
- Constraints: Sample names and metrics are illustrative. Render this catalog once per page because legacy specimens use fixed IDs. Examples do not establish production workflow support.

### PromptInputBlock, SchedulingBlock, SettingsBlock

Exploratory · [Source](../../src/components/design-system/examples/UIBlocks.jsx)

Explore a command composer, review booking, and preferences in isolated local state.

- Properties: No external props; SelectMenu supplies the shared single-select interaction. Fixed availability and simulated completion.
- States: Slash-command selection, simulated busy/cancel, time selection, dirty/save/cancel preferences.
- Usage: Optional examples only. Use PromptComposer when a structured prompt workflow is needed.
- Constraints: No real booking, AI model switching, persisted preferences, or application dark mode. The preview’s 25 MB contract and Enter-to-send do not apply to production.
