# Application component library

Browse `/design-system` → Library structure. Search by component, responsibility or constraint, then check adoption status. Current library imports:

```jsx
import { AppButton } from './atoms/AppButton.jsx'
import { TokenChip } from './atoms/TokenChip.jsx'
import { TokenCopyTarget } from './atoms/TokenCopyTarget.jsx'
import { PillTabs, PillTabPanel } from './molecules/PillTabs.jsx'
import { WorkflowSteps } from './molecules/WorkflowSteps.jsx'
import { SelectMenu } from './molecules/SelectMenu.jsx'
import { SelectionTile } from './molecules/SelectionTile.jsx'
import { PromptComposer } from './organisms/PromptComposer.jsx'
import { WorkflowModuleFrame } from './organisms/WorkflowModuleFrame.jsx'
```

Paths above are relative to this directory. Old flat modules are compatibility exports. Do not remove them until all consumers migrate. `examples/` contains documentation helpers, local demos and experiments; production screens must not import it. Domain-aware components stay in `src/studio`.

`TokenChip` is the explicit token-name reference used in Library detail panels. `TokenCopyTarget` is the hidden-token interaction used by visual foundation specimens: it keeps the layout readable while exposing a labelled, keyboard-operable copy target.

- [Component contracts](../../../docs/design-system/components.md)
- [Audit and hierarchy](../../../docs/design-system/audit.md)
- [Migration and rollback](../../../docs/design-system/migration.md)
- [Prioritized roadmap](../../../docs/design-system/roadmap.md)
- [Validation and remaining risks](../../../docs/design-system/validation.md)

Primitive palette values feed semantic `--v2-*` tokens in `foundations/tokens.css`; consumers import the existing `styles/tokens.css` entry. The only supported application theme is light. Use `--v2-text-secondary` for secondary text, not the decorative muted swatch.

New components need a responsibility, explicit props, supported states, constraints, an actual consumer, and appropriate keyboard/interaction verification. Classify by responsibility; do not force domain logic into lower atomic levels or create one variant set for different kinds of content.

## Banner-selection shared patterns

- `molecules/SelectionTile.jsx`: one selectable visual item, with `label`, `selected`, `onChange`, `disabled`, `children`, `caption`, and optional `className`. The entire tile is a native pressed button; Enter and Space toggle it. The selection indicator appears on hover, keyboard focus, touch, and whenever selected. Children and captions must not contain interactive elements. Selection state and persistence belong to the caller.

Consumer: `src/studio/campaign/modules/banners/BannersView.jsx` uses SelectionTile for artwork and size choices, canonical PillTabs for Design / Sizes & formats, SelectMenu for filters, and PreviewDialog for final verification. Module grids use their container width: one column below 480px, two from 480px, and three from 800px. Selection identities, template manifests, asset loading, totals, and review preparation remain in the Banners module. Tests live beside SelectionTile and in `BannersSelection.test.jsx`.

## Visuals-module shared patterns

- `atoms/TextAction.jsx`: underlined, low-emphasis AppButton with compact 44px target. Native button props, keyboard activation, disabled and busy states remain canonical. The caller owns clipboard/upload behavior and feedback.
- `organisms/MediaWorkflowCard.jsx`: labelled result card with `title`, `context`, `status`, `selected`, and ordered `columns: [{id, label, content, actions}]`. Three columns at a **card width** of 720px; narrow containers stack in the same order. Uses semantic heading, color, spacing and border tokens; no domain state or requests.

Consumer: `src/studio/campaign/modules/visuals/VisualsView.jsx`. `ActionCard`, `EmptyState`, `SelectMenu`, `AppButton`, and `WorkflowModuleFrame` remain shared dependencies. Interaction tests live in `VisualsModule.test.jsx`; desktop/mobile geometry is checked in the browser. Both new APIs are discoverable in the live Library structure catalog.

## Copy-module shared patterns

- `molecules/ActionCard.jsx`: generic content surface, with `label`, `status`, `actions`, `persistentAction`, `highlighted`, `dismissing`, `exiting`, and content slots. Hover actions also reveal on focus and touch. Exiting cards are inert and hidden from assistive technology. Metadata wraps independently of controls on small screens.
- `molecules/EmptyState.jsx`: centered decorative `icon` and guidance `children`. It owns presentation, never generation or retry logic.
- `organisms/PreviewDialog.jsx`: mount to open, with `title`, `onClose`, and content. Native modal focus containment, Escape/close control, focus restoration and viewport-bounded scrolling; no fetching or domain actions.
- `molecules/useExitPresence.js`: retains removed keyed items for the shared 200ms disclosure window. Pass an immutable, stable array of unique IDs; render returned exits as inert display-only content. Reduced motion skips the animation window and timers clean up on unmount.

Consumer: `src/studio/campaign/modules/copy/CopyView.jsx`. Copy content, approval semantics, limits, API calls, and asset loading remain outside the design system. Tests live beside the presence hook and in `CopyCards.test.jsx`/`CopyModule.test.jsx`; preview focus and responsive geometry are also checked in the browser.

## Brief-module shared patterns

- `molecules/InlineText.jsx`: text-first editing with `label`, `value`, `sourceKey`, `onSave(value, capturedSourceKey)`, `onDirty`, `readOnly`, `maxLength` (500 by default), `required`, and `multiline`. Saves trim the value; failed saves retain the draft. Enter saves, Shift+Enter inserts a line, and Escape cancels when idle. A changed source key produces a retained-draft notice; the caller owns conflict resolution and validation beyond required text. Editable display targets are at least 44px high; read-only values render as text.
- `molecules/FactGrid.jsx`: semantic labelled facts with `items: [{id, label, content, emphasis?}]` and an optional accessible `label` (default `Details`). Truthy emphasis gives a cell the accent background. Two columns become one at a container width of 480px or less, preserving item order. Supply unique IDs and readable labels; values may contain shared editors.
- `molecules/AsyncStatus.jsx`: caller-supplied `children` in a status region with a decorative loading icon. It describes indeterminate work; requests, timing, failure recovery, and progress wording belong to the caller.
- `atoms/UpdatedText.jsx`: `value` and stable `identity` acknowledge a saved text change for 200ms. The exported `useTextUpdate(value, identity)` supplies the same flag for an existing element. Initial values and identity changes do not animate; reduced motion disables the CSS animation. It is visual feedback, not a save operation or live announcement.

Consumers: `src/studio/campaign/modules/brief/BriefModule.jsx` uses InlineText, FactGrid, AsyncStatus, and PromptComposer; `BriefView.jsx` also uses AsyncStatus. `src/studio/StudioApp.jsx` uses UpdatedText and useTextUpdate for campaign titles. Schema validation, permissions, source keys, and campaign mutation behavior remain in Studio. The [Brief surface record](../../../.impeccable/surfaces/src-studio-campaign-modules-brief-briefmodule-jsx.md) describes composition and review evidence.

## Settings shared patterns

Extracted from UI blocks → Settings form; the example and `SettingsScreen` now share these components.

- `organisms/SettingsPanel.jsx`: `SettingsPanel` renders the section heading, description, content, and footer; `as="form"` accepts submit props. `titleId` preserves direct section links.
- `SettingsRow` places `label` and `description` beside a control slot, with a divider and 24px spacing. Rows stack below 600px container width; `compact` keeps a switch beside its label. `SettingsFooter` pairs `message` (live status, or alert with `error`) with action children.
- `molecules/FormField.jsx`: native input props, persistent `label`, optional `hint`/`error`, and generated IDs. A render-function child can compose `SelectMenu` using its `triggerId`. Password fields never receive stored secrets.
- `atoms/Switch.jsx`: controlled `checked`, `onChange`, `label`, and `disabled`. Native button provides Enter/Space activation; `role="switch"` and `aria-checked` expose state. Disabled controls remain off and legible without hover effects.
- `SelectMenu` owns provider/model selection and keyboard navigation; opening a list with no saved selection focuses its first option. `AppButton` owns all actions and busy/disabled states.

Product CSS only sizes the single column and paired fields. Provider catalogs, credentials, saves, errors, permissions, and deferred-feature decisions stay in SettingsScreen. No product imports from examples; no backend changes in this alignment pass.

### Specimen layout sizing

Component example grids reflow using their available content width: 280px minimum columns, or 260px for button cells, each capped at 100% for narrow containers. Buttons retain natural widths; text may wrap only when space is insufficient. Keep focus rings and intentional overlay layers visible; do not hide overflow to mask sizing issues. Data tables retain their own scroll containers.

### Catalog presentation

The catalog uses one white content surface with flat sections and consistent 24px specimen gaps. Section and specimen wrappers have no card background or enclosing border. Input boundaries, interactive component previews, and raised popovers retain their own functional styling. Control grids use the available width with a 280px minimum column and stack when narrower. Source paths and relevant token chips are available in each heading's Reference disclosure; repeated descriptive prose is omitted. Sidebar anchors remain on the visible headings.


## Brand parameters for banner templates

Brand systems are separate from the application UI tokens. Each template version can reference one published brand; many template layouts can share that system. `shared/resolveTemplateBrand.js` maps semantic palette and typography roles into the existing geometry and saves an immutable resolved manifest. Primary logo graphics are verified raster snapshots with contained scaling and a white backing. Layouts retain their sizes, safe areas and motion.

`AnimatedBanner`, standalone animation HTML and the PNG renderer consume these resolved parameters. Registered rendering families are Inter and OFL-licensed Arimo, at weights 400/600/700. Arimo is the Arial-compatible substitute for the supplied MSD reference; that publisher's typography is not presented as official MSD guidance. Logo teal is sampled from the supplied asset; the pale teal is a derived tint. Original source/license metadata remains in the MSD record.

Admin-only `POST /api/v1/brand-design-systems/:brandId/templates` accepts `{ templateIds: [...] }` and publishes new versions into the shared catalog. Brand publication/restoration atomically refreshes assigned templates. Existing template and campaign snapshots remain unchanged. Returning to Templates reloads the catalog. No template creation UI is introduced. To reproduce the local demo fixture, run `node scripts/setup-msd-templates.mjs` with the demo API's database and asset-store configuration; the script is idempotent and blocked in production.
