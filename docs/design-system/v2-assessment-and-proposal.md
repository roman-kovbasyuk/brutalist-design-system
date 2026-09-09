# Design system v2: assessment and proposal

Date: 8 September 2026. Status: proposal for discussion, not an approved implementation specification.

Execution sequence: [v2 implementation plan](../superpowers/plans/2026-09-08-design-system-v2-implementation.md), with separate Core, Workbench, and Components/UI Blocks task plans. The plan incorporates the agreed category, product-independence and grouped-gallery decisions; Later inventory items remain a separate backlog.

## Direction

Build an opinionated neobrutalist application UI system for design engineers: designers who code with AI and developers who want attractive, dependable UI immediately. The main journey is **find → try → adapt → use**.

The system is independent of any product. Banner Studio is a future consumer, not an architectural model or organizing principle. Use three understandable categories throughout the library and workbench: **Basics, Components, UI Blocks**. Design for people who may not know design-system or software architecture terminology.

Preserve solid color, black structural rules, hard elevation, and tactile microinteractions. Invest in reliable composition and distribution alongside visual craft. A component workbench should make the system usable without requiring its users to understand the repository first.

## Evidence and scope

Assessed the current working tree, supplied architecture reference, tokens, shared APIs, example implementations, catalog routing, documentation, package configuration, and deployment workflow. Inspected the running catalog at `/design-system`, including its landing page, foundations, components, and UI blocks. A 390px viewport check found no document-level horizontal overflow on the inspected UI-blocks page; this is not a complete responsive or accessibility audit.

The working tree contains historical references to a former campaign product whose files are now absent. Treat these as cleanup findings, not requirements to restore a product connection. Existing changes were not reverted or modified.

Baseline verification: `npm run build` passed; `npm run test:run` passed, 60 tests across 9 files. These tests establish the current baseline, not comprehensive accessibility, visual-regression, or package-consumption coverage.

### What is worth keeping

- A coherent visual foundation: off-white canvas, white surfaces, black ink, cyan action color, teal success, red danger, Avenir-family typography, 4px standard corners, and hard interactive shadows.
- Primitive-to-semantic CSS variables already exist. Motion has 150ms feedback and 200ms disclosure timings, with reduced-motion handling.
- Useful shared APIs already exist: AppButton, Switch, FormField, PillTabs, SelectMenu, InlineText, FactGrid, SelectionTile, ActionCard, PreviewDialog, PromptComposer, SettingsPanel, and others.
- Several components already handle difficult details: retained inline-edit drafts, keyboard selection, modal focus restoration, busy actions, and local container reflow.
- Source documentation distinguishes generic presentation from product rules. Preserve this boundary.

### Architecture and catalog gaps

| Finding | Evidence | Consequence |
| --- | --- | --- |
| Atomic categories do not match rendered sections | `LibraryIndex.jsx` groups atoms under Basics; `DesignSystemScreen.jsx` renders button examples under Components and several atom previews under UI blocks | On Basics, 9 of 10 sidebar item anchors had no matching target in the rendered document |
| Inventory overstates usable breadth | `library-catalog.js` has 29 entries: 18 Shared, 5 Examples only, 1 Legacy, 4 Feature-specific, 1 Exploratory. These are entries, not a count of production components | A rich-looking catalog is not yet a complete reusable app toolkit |
| Inventory and product context are stale | All four Feature-specific source paths are missing in the working tree; CampaignTimeline still documents eight stages | Humans and coding agents receive contradictory guidance |
| Rich contracts are hidden | Catalog records contain purpose, properties, states, usage, and constraints; `PreviewMetadata.jsx` displays source paths and a small token selection | Users cannot judge whether a component fits without reading source |
| Copying does not mean copying implementation | Button specimen copy controls copy labels such as “Create campaign” | A visual exploration ends before adoption begins |
| Components depend on host CSS | AppButton rules are scoped to `.system-screen--v2` or `.bs-root`; legacy globals remain loaded | Importing a component into a fresh app may not reproduce the preview |
| Competing styling systems remain | Atomic components, flat compatibility exports, `src/components/ui`, legacy tokens, and product selectors coexist | Ownership and required styling are hard to infer |
| Distribution is undeveloped | Private application package; no library exports or typed public API; source is JSX | External adoption requires repository knowledge and manual assembly |
| Tests do not protect the entire delivery path | Vitest/Testing Library coverage exists, but Pages deployment runs build without tests; no Storybook/browser visual test setup is configured | Passing unit tests can coexist with broken navigation and host-dependent visuals |

`src/styles/design-system.css` is 3,073 lines and contains component rules alongside catalog layout. File length is a symptom; the architectural issue is that a consumer cannot easily separate library requirements from documentation styling.

## What exists and what needs development

Inventory checked against the current source on 8 September 2026. **Shared** means reusable implementation exists, not that it has met the proposed v2 Stable criteria. **Partial** means useful pieces exist but the complete capability does not. **Demo / legacy** means a local example or older implementation exists without the intended canonical v2 API. **Missing** means no complete implementation was found in the current library.

Suggested order: **First** establishes a dependable library and proves grouped browsing; **Next** completes common application needs; **Later** is a candidate backlog to validate through use. These are development recommendations, not authorization to implement every row. Workbench and Engineering below are supporting work, not additional categories in the library navigation.

| Area | Group / capability | What we have now | What needs to be developed | Order |
| --- | --- | --- | --- | --- |
| Basics | Colors | **Shared:** palette and semantic `--v2-*` variables in `foundations/tokens.css`; copyable swatches | Complete action/status/selected/disabled role pairs; document approved text/background combinations; reconcile legacy tokens | First |
| Basics | Typography | **Shared:** heading, lead, body and small-text tokens and specimens | Clarify label, numeric and code roles; align Body specimen and intended weight; establish consistent font delivery; present as comparison rows | First |
| Basics | Icons | **Partial:** Lucide icons used throughout; 16/20/24px sizing tokens | Searchable icon gallery, naming/copy guidance and consistent decorative versus labelled usage | Next |
| Basics | Spacing and sizing | **Shared:** 4px spacing scale, 44/48px control heights and spacing specimens | Complete rules for fields, rows, toolbars and panel spacing; show ordered comparisons | First |
| Basics | Borders, corners and elevation | **Partial:** border/radius tokens and hard shadows; several offsets live directly in CSS | Name elevation roles; consolidate values; document flat, lifted, selected and floating states in one gallery | First |
| Basics | Motion and interaction | **Partial:** feedback/disclosure timings, lift/press demos, `UpdatedText` and `useExitPresence`; reduced-motion CSS | Consistent interaction rules and replayable examples for focus, updates, disclosure and removal; retain state cues with reduced motion | First |
| Basics | Layout | **Demo / legacy:** local flex/grid compositions; legacy Separator and ScrollArea | Canonical row, column, grid, container, surface, divider and scroll helpers with responsive examples | First |
| Basics | Accessibility | **Partial:** focus styles, keyboard handling and label/help associations in several shared controls | Document a consistent baseline; audit missing states and associations; test keyboard, focus restoration, contrast and forced colors | First |
| Basics | Themes and density | **Partial:** light theme, two button sizes and a local dark/density settings preview | System-wide compact/comfortable rules and a verified dark theme; expose only modes actually supported | Later |
| Components | Buttons and text actions | **Shared:** `AppButton`, icon-only mode, busy/disabled behavior and `TextAction` | Remove host-wrapper styling dependencies; document action/link behavior; present emphasis, sizes, icons and states together with working code | First |
| Components | Inputs and field structure | **Partial:** shared `FormField`; native field demos; legacy Input/Textarea | Canonical Input/Textarea and composable labels, hints, errors, prefix/suffix; grouped input examples with consistent states | First |
| Components | Checkbox, radio and switch | **Partial:** shared `Switch`; checkbox/radio demos and legacy RadioGroup | Canonical Checkbox and RadioGroup; common group labels, error/disabled handling and comparison examples | First |
| Components | Select, combobox and multiselect | **Partial:** shared `SelectMenu` for small single-selection lists; searchable/multiselect demos | Stable value/label option contracts and form associations; reusable searchable and multiple-selection controls with complete keyboard behavior | Next |
| Components | Specialized inputs | **Demo / legacy:** password visibility, number stepper, currency, date/time, color, rating and sliders in specimens | Promote only needed controls into reusable APIs; define bounds, validation, localization and keyboard behavior per control | Later |
| Components | Tabs, view switching and steps | **Partial:** shared `PillTabs`/`PillTabPanel` and `WorkflowSteps`; local density/view switches | Shared SegmentedControl; clarify tabs versus routes versus view options; document current limits and add neutral examples | Next |
| Components | Sidebar, breadcrumbs and pagination | **Demo / legacy:** catalog-specific navigation, local specimens and legacy Sidebar | Canonical navigation components with current-page, disabled and responsive behavior; use them in the workbench | First |
| Components | Dialogs and confirmations | **Partial:** shared `PreviewDialog`; local confirmation examples | General Dialog and AlertDialog APIs with content/action slots, initial focus, dismissal and restoration rules | Next |
| Components | Menus, popovers, tooltips and drawers | **Demo / legacy:** local menu/tooltip demos, SelectMenu popup, legacy Tooltip/Sheet | Canonical overlay components with positioning, keyboard navigation, dismissal and stacking; a shared drawer/sheet for workbench details | First |
| Components | Status, alerts and notifications | **Partial:** shared `AsyncStatus`; local badges/alerts/toasts and legacy Badge/Alert | Shared StatusBadge, Alert and notification handling; clear severity, announcement, dismissal and retry guidance | Next |
| Components | Loading and empty/error states | **Partial:** shared `EmptyState`, busy spinner and AsyncStatus; progress demos and legacy Skeleton | Canonical Progress/Skeleton; reusable error/retry and unavailable-state compositions; meaningful determinate versus indeterminate examples | Next |
| Components | Cards, facts and selection | **Shared:** `ActionCard`, `FactGrid`, `SelectionTile`, `MediaWorkflowCard` and `WorkflowModuleFrame` | Neutral examples, discoverable APIs and layout/state coverage; document boundaries before adding a generic card abstraction | Next |
| Components | Inline editing | **Shared:** `InlineText` retains drafts on failed saves and handles source changes | Expose editing/saving/error/conflict examples and callback contracts; add code that demonstrates recovery without product dependencies | Next |
| Components | Tables, filtering and bulk actions | **Demo / legacy:** table/search examples, legacy Table, selection building pieces | Canonical Table and reusable search/filter/selection controls; compose sorting, pagination and bulk actions where needed | Next |
| Components | File upload | **Partial:** attachment/drop handling in `PromptComposer`; local upload examples | Standalone FileDropzone/file list with configurable validation and pending/error/retry presentation; caller owns transfer requests | Next |
| Components | AI input and results | **Partial:** shared `PromptComposer` plus an exploratory command composer; status/result-card building pieces | Neutral composer defaults; reusable task progress, results, cancellation/failure, review and apply/revise controls | Next |
| Components | Advanced data and collaboration | **Missing as complete shared APIs:** interactive DataGrid, charts, rich-text editor, tree, comments and presence | Add only after concrete demand; define independent APIs and choose specialist behavior/rendering engines where appropriate | Later |
| UI Blocks | Settings / edit form | **Partial:** shared `SettingsPanel`/`SettingsRow`/`SettingsFooter`; local `SettingsBlock` with save/cancel | Configurable, copyable block using canonical fields; demonstrate validation, saving, failure and unsaved changes with neutral data | First |
| UI Blocks | App layout | **Demo / legacy:** responsive workspace specimen and legacy sidebar pieces; no standalone shared page template | Ready-to-use navigation/header/content/optional-inspector layout; responsive navigation; no data-fetching or product state | Next |
| UI Blocks | Item browser | **Partial:** table, card and filter specimens; no complete reusable block | List/grid browsing page with shared toolbar, selection, pagination and loading/empty/error/populated examples | Next |
| UI Blocks | Item detail | **Partial:** facts, editing, action cards and preview dialog; no complete detail page | Detail block with header, metadata, editing/actions and optional preview; narrow-screen behavior and complete state examples | Next |
| UI Blocks | AI workspace | **Partial:** prompt-input demo and shared composer/result building pieces; no complete generic workspace | Compose context/input, progress, result and user review; replay cancellation, partial completion and recovery with fixtures | Next |
| UI Blocks | Dashboard and sign-in | **Partial / missing:** KPI/data specimens exist; complete dashboard and sign-in blocks are absent | Generic dashboard and authentication-form starting points when needed; consumer supplies actual data and authentication | Later |
| UI Blocks | Scheduling | **Demo / legacy:** `SchedulingBlock` with fixed dates and simulated confirmation | If retained, make availability/timezone/content configurable and show pending/error states; no implied booking service | Later |
| Workbench | Grouped galleries | **Partial:** Basics/Components/UI blocks navigation and specimen grids; category-to-content mismatch | Correct membership; build family pages with appropriate rows/grids, comparison sections, stable links and shared registry data | First |
| Workbench | Search and navigation | **Partial:** sidebar name/purpose filter and hash links | Search across all families; useful no-results state, keyboard operation and deep links that reveal the correct specimen | First |
| Workbench | Code and Adjust | **Partial:** token-copy controls and source references; button copies contain labels; no shared inspector | Copy runnable examples; open code/options in place using one responsive details panel; preserve preview behavior and local values | First |
| Workbench | State and responsive previews | **Partial:** isolated motion/responsive demos and some busy/read-only toggles | Per-example presets, independent configuration, reset and preview sizing; optional expanded canvas for complex components/blocks | First |
| Workbench | Usage guidance and readiness | **Partial:** rich metadata in `library-catalog.js`, mostly hidden by the current UI; stale entries | Visible How to use/Options/Examples; accurate maturity and support limits; verify source paths and example targets | First |
| Workbench | Coding-agent context | **Missing:** no generated selection-specific context bundle | Copy/download the chosen example plus current imports, contracts, token rules, dependencies and version | Next |
| Engineering | Public API and styling portability | **Partial:** shared JSX modules and compatibility exports; private app package; legacy/global CSS dependencies | Typed public exports, intentional stylesheet entry, separated library/workbench styles and a fresh-app consumption example | First |
| Engineering | Automated quality checks | **Partial:** existing Vitest/Testing Library tests; deployment builds without tests | Run tests before deployment; add registry/link checks and isolated browser, accessibility and visual coverage for shared examples | First |
| Engineering | Distribution and maintenance | **Partial:** repository documentation and source imports; no complete consumer/release workflow | Installation guide, versioned core, copyable UI Block recipes, migration notes and explicit deprecation policy | Next |

Reuse and improve existing shared implementations first. A grouped catalog is a presentation layer over these independent APIs; it does not require combining unrelated controls into one component.

### Visual and interaction gaps

1. **The identity works, but its rules are incomplete.** Hard shadows vary between 2px, 4px, 6px and 8px; these differences need named roles. Define flat structure, interactive lift, selected state and floating surfaces separately. Reserve strong movement for controls and selectable surfaces.
2. **Color needs role pairs.** Preserve the palette while adding explicit surface/text/border roles for action, selected, warning, danger, success and disabled states. Specify approved foreground/background pairs. A palette swatch alone is not guidance for an error message or a button.
3. **Density needs a complete contract.** The existing 44/48px control sizes do not establish table rows, toolbars, field spacing or panel density. Keep comfortable interaction targets as the default; make compact mode an intentional desktop option.
4. **Typography needs interface roles and reproducibility.** Add clear label, body, metadata, numeric and code roles. Align the existing 500-weight Body specimen with the intended body-weight contract. Decide on a consistently available font strategy before promising identical cross-platform rendering.
5. **Reduced motion should retain state meaning.** Remove movement and animated shadow changes while retaining static selected, focus, pending and elevation cues. Do not make the reduced-motion variant visually ambiguous.
6. **The catalog spends space on presentation that could support use.** Large specimen cells and long mixed pages show appearance well, but hide API differences, readiness and context. Use a focused preview canvas with adjacent controls and a state matrix.
7. **Modes need honest support labels.** Light mode exists. Dark mode is only a local example. Make reduced motion, responsive behavior and forced-color compatibility baseline concerns; stage full dark theme and density support as explicit deliverables rather than cosmetic toggles.

## Proposed v2 architecture

Use the same three-category model for navigation, documentation and source organization. Each category answers a practical question. Do not require users to distinguish foundations from primitives, components from patterns, or templates from blocks. A source component does not imply a dedicated screen: related items are presented together in a family gallery, while their code and contracts remain independently maintained.

| Category | User question | Includes |
| --- | --- | --- |
| Basics | What gives this system its look and feel, and how do I arrange things? | Colors, typography, icons, spacing, borders, elevation, motion, responsive behavior, accessibility and layout helpers |
| Components | What reusable UI element or interaction do I need? | Buttons, fields, selects, tabs, dialogs, menus, tables, search/filter controls, uploaders and editable content |
| UI Blocks | What complete section or page can I start from? | Sign-in, settings, dashboard, item browser, detail page and AI workspace |

Basics includes the visual foundations and small layout helpers formerly described as primitives. Present these as **Layout** with familiar explanations such as rows, columns, grids, containers and dividers. Technical API names can be shown alongside those explanations.

Components combines individual controls and composed interactions. Group them by purpose: Actions, Forms, Navigation, Overlays, Feedback, Data and AI. A search-and-filter toolbar belongs here because it is a reusable interaction that fits into many layouts. UI Blocks combines complete sections and page templates: an item browser combines the toolbar, results, empty/error states and page layout into a ready-to-use starting point. Use **Section** and **Page** filters if needed rather than adding another category.

Components use Basics and may compose other Components; UI Blocks use both. Basics and Components do not import UI Blocks or the workbench. No library category imports a consumer application's code. Useful internal helpers stay private rather than becoming public merely because they are small.

Near-term source organization:

```text
src/components/design-system/
  basics/            visual rules, tokens, typography, icons and layout helpers
  components/        controls and composed interactions, grouped by purpose
  ui-blocks/         complete sections and page starting points
  index.ts           intentional public API
src/workbench/       navigation, search, preview, controls, source inspection
src/examples/        runnable applications that consume the public API
docs/design-system/  guidance, migration and release notes
```

Keep compatibility exports during migration. Introduce TypeScript incrementally at public contracts. Establish an installable core with a documented stylesheet entry; distribute customizable UI Blocks as source recipes importing that core. Validate both in a fresh consumer app. A later package/workspace split is useful only when the publishing boundary needs it. Package setup is an implementation detail, not another browsing category.

Continue with Radix as the primary complex-interaction foundation because it is already present. Use native elements where sufficient and keep the system's own styling above them. Radix supplies focus, keyboard and ARIA behavior; composition and accessible labels still require care. Avoid rewriting working shared controls solely to adopt a new dependency. See [Radix accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility).

Keep data tables distinct from interactive grids: their keyboard contracts differ. See [WAI table guidance](https://www.w3.org/WAI/ARIA/apg/patterns/table/).

### One contract for humans, examples and coding agents

Each public entry should define: stable ID, purpose, supported import, typed props, composition slots, supported variants/states, keyboard behavior, responsive limits, dependencies, token use, examples and maturity. Use **Experimental / Beta / Stable / Deprecated** for maturity; store adoption separately. “Shared” is not a quality guarantee.

Generate API tables and prop controls from typed metadata where practical. Explicitly author behavioral constraints and slot examples; type extraction alone cannot explain them. Use the same example modules for the workbench and tests. Validate source paths, route targets and example imports during CI.

For AI-assisted building, provide a copyable context bundle: selected recipe, version, imports, component contracts, token rules, dependencies, and instructions to reuse shared APIs. The bundle should identify unsupported capabilities. Start with generated Markdown/JSON and ordinary copy/download; a hosted agent service is unnecessary for the first release.

## Design-system UI: a workbench

### Approaches considered

| Approach | Advantage | Cost / limit |
| --- | --- | --- |
| Improve the current documentation catalog | Smallest change; familiar layout | Still makes adaptation and state testing secondary |
| Purpose-built workbench with shared stories — recommended | Visual discovery, reliable code, and interaction testing in one workflow | Requires a registry, family galleries and preview/control infrastructure |
| Full visual page builder | Direct canvas composition | Introduces editing, serialization and code-generation products before the library is ready |

Use Storybook for isolated component development and testing, with a distinctive workbench as the user-facing surface. Maintain one set of example modules. Storybook supports treating stories as component state/configuration test cases and integrating with Vite/Vitest. The custom workbench integration is engineering work, not an automatic Storybook capability. See [Storybook testing documentation](https://storybook.js.org/docs/writing-tests).

### Navigation and screen structure

Primary navigation: **Basics · Components · UI Blocks**. The home/logo link opens the starting page; Getting started and Changes are supporting links. Search across all three categories by component name, task, synonym and supported state. “Upload a file” should find the relevant component and any complete UI Block using it. Make Experimental items opt-in when searching for production-ready UI.

The landing page should show working examples immediately: a settings form, a resource browser and an AI result/review composition. Offer a direct setup path and a way to browse component families. This establishes what a real application will look like.

The default browsing unit is a **family gallery**, not an individual component page. Navigation leads to Buttons, Inputs, Selection controls, Color, Typography and similar understandable groups. Each gallery presents related examples together for comparison. Keep groups bounded; do not return to one enormous page containing the whole library.

### Presentation by family

| Family | Presentation | Reason |
| --- | --- | --- |
| Colors | Swatch grid grouped by use, with role and value visible | Makes palette relationships easy to scan |
| Typography | Full-width specimen rows with size, weight and usage | Text needs its natural reading width |
| Spacing, borders, elevation | Ordered visual scales and side-by-side samples | The differences between values are the subject |
| Icons | Searchable grid with consistent optical size and names | Users browse a set rather than isolated pages |
| Layout | Small diagrams and live row, column and grid examples | Shows arrangement and reflow directly |
| Buttons | Compact labelled rows or a grid of related examples | Supports comparison of emphasis, size and icon placement |
| Inputs | Aligned two-column examples, stacking on narrow screens | Gives text fields enough width and makes labels/errors comparable |
| Selection controls | Separate rows for checkbox, radio, switch and select | Compares distinct purposes without implying identical behavior |
| Overlays | A gallery of labelled triggers that open working examples | Interactions need to be exercised rather than represented as static cards |
| UI Blocks | Large previews, with an optional expanded workspace | Complete sections and pages need more space and realistic content |

Use spacing, alignment and headings to group specimens. Reserve enclosing borders and hard shadows for the specimen itself or for a meaningful selection/overlay boundary. Avoid putting every tiny control inside a large decorative card. Stable preview areas should reserve space for focus rings, lift and expanded content.

Within Buttons, show **Emphasis**, **Sizes**, **With icons**, and **States** as distinct comparison sections. Within Inputs, show common input types first and **Help and validation**, **Read-only**, and **Disabled** below. Vary one dimension at a time. Do not generate every size × variant × state combination in the default gallery.

Illustrative Buttons family page, with details closed:

```text
┌───────────────────────────────────────────────────────────────────────┐
│ Design System       Search the library…                       Version │
├────────────────┬──────────────────────────────────────────────────────┤
│ Basics         │ Buttons                                              │
│ Components     │ Actions with clear emphasis and physical feedback.   │
│   Buttons      │                                                      │
│   Inputs       │ Emphasis                                             │
│   Selection    │ Primary          Secondary         Quiet             │
│   Navigation   │ [Save changes]   [Cancel]          Learn more        │
│   Overlays     │ Code · Adjust    Code · Adjust     Code · Adjust     │
│   Feedback     │                                                      │
│ UI Blocks      │ Sizes                                                │
│                │ [Default]        [Compact]                           │
│                │                                                      │
│ Getting started│ States                                               │
│ Changes        │ Default   Focus   Pressed   Busy   Disabled          │
└────────────────┴──────────────────────────────────────────────────────┘
```

### Details without leaving the gallery

Each specimen has a short label, a working preview and explicit **Code** / **Adjust** actions, available on keyboard and touch as well as mouse. Clicking a preview exercises that component; it must not unexpectedly select a specimen or open documentation. For noninteractive Basics specimens, clicking may copy a token, with a clear affordance and confirmation.

Code or Adjust opens one shared details panel alongside the gallery when sufficient width is available. It identifies the selected example and provides **Options**, **Code**, and **How to use**. The panel is closed by default so comparison gets the full content width. Keep the selected specimen identifiable and visible; retain gallery scroll position and edited values while switching examples. Provide a per-example reset. Closing the panel restores focus to its opener when that opener remains present.

On medium widths, expand details immediately beneath the selected specimen's row. On small screens, use a labelled sheet with predictable focus restoration. Do not shrink previews into unusable columns to accommodate an inspector. Change the details presentation without remounting examples or discarding their local state.

Each example has a stable shareable target inside its family route, for example `/components/buttons?example=primary&view=code`. Direct navigation and search reveal the relevant example and details rather than forcing a separate page. These paths are proposed routes, not currently implemented URLs. Grouping is a registry/presentation concern; a family page does not merge the APIs of unrelated controls.

Offer **Expand preview** when a complex table, editor, AI workspace or UI Block needs an isolated canvas. Preserve its configuration and provide a clear return to the gallery. A dedicated page is warranted by the size and complexity of the interaction, not by the existence of a component file.

The preview is the focal point. Keep the surrounding chrome flat and restrained so component color and elevation remain legible. Reuse canonical shared controls for the workbench itself. Introduce missing shared interactions in Components before using them here. Use plain labels such as **How to use**, **Options**, and **Examples** in the UI; explain technical API terms where needed.

### Essential interactions

- **Configure:** Change supported props, slots and realistic example data for the selected specimen. Other specimens retain their own values. Start with structured controls and presets; unrestricted live JSX editing can follow later.
- **Exercise states:** Show default, hover, keyboard focus, pressed, selected, busy, disabled and error examples where applicable. Distinguish a static state specimen from an actual interaction test. Replay meaningful sequences such as edit → saving → failed → retry.
- **Inspect code:** Show complete imports and necessary state/callback wiring. Copy the configured example, not a label. Include dependency/setup requirements and identify fixture data.
- **Explore composition:** UI Block pages show their constituent components and which sections can be replaced. “Components used” connects a complete example to its reusable parts. Composed Components can expose the same information when useful.
- **Test constraints:** Resize the preview, enter long content, switch density, and enable reduced-motion simulation inside the preview. Document whole-window versus container-responsive behavior.
- **Share:** Store component ID, example and supported serializable options in a URL. Reset restores a known example. Keep arbitrary pasted content out of URLs.
- **Inspect quality:** Show maturity and actual test evidence with version/date. Do not manufacture an “accessible” badge from the presence of ARIA attributes.
- **Use with an agent:** Copy the same example plus its contract and tokens. The agent receives the same current source of truth the human sees.

On narrow screens, collapse navigation into a drawer and stack specimen groups in their reading order. Keep the family heading and a compact section-jump control available for long galleries. Use the details behavior above; preserve accessible names, focus restoration and shareable navigation.

Basics includes an interactive visual lab: show color roles, approved color pairings, elevation states, type hierarchy, layout examples and motion replay. Initially offer curated presets and local preview adjustments. Do not turn every CSS variable into an unrestricted visual-design control.

## Delivery sequence and proof

1. **Restore trust and portability.** Correct the inventory and navigation; expose readiness/contracts; reconcile tokens and CSS ownership; establish a public API and isolated consumer example. Preserve current exports until migration is verified.
2. **Prove grouped browsing and adoption.** Build the Buttons and Inputs family galleries with comparison sections and in-place Code/Adjust panels. Use Button, FormField, Switch, SelectMenu and SettingsPanel in a configurable settings UI Block. Copy its working implementation into a fresh app and reproduce its appearance and behavior without hidden catalog classes.
3. **Complete the core families.** Forms, overlays, navigation and feedback. Add browser interaction, accessibility and visual checks to representative stories; run tests before deployment.
4. **Deliver attractive UI Blocks.** Item browsing, detail/editing, settings and AI workspaces, supported by reusable upload, filtering and review Components. Develop four strong starting points before expanding toward a large block catalog.
5. **Expand modes and distribution.** Add verified dark/density variants, release documentation, generated agent context and broader recipes as adoption warrants.

Proposed acceptance targets: every Stable entry has a working deep link within its family gallery, valid public import, typed contract and tested examples; related variants can be compared without navigating away; preview interactions remain independent from Code/Adjust actions; a fresh-app adoption exercise takes roughly ten minutes; copied examples compile and reproduce their preview; important states can be reached without manually modifying source. Validate the time target with actual users.

Use neutral example data and generic application tasks throughout the workbench. Remove obsolete product-specific catalog entries and consumer claims. Banner Studio and any other future app consume the same public components and UI Blocks; they supply their own data, business logic, permissions and workflows. Product integrations are separate work and do not define the design system's categories or priorities.

The first implementation decision should be the workbench and portability proof. A broader component expansion should follow once that small path demonstrates the intended experience.
