# Full application review

Reviewed against the public `brutalist-design-system` repository on 9 September 2026. The repository is intentionally design-system-only; it does not contain the legacy Banner Studio product screens that were removed before this release. This review therefore covers every runtime route, component family, UI block, example, and exported token in the repository that a consumer application can adopt.

## Scope and runtime surface

The runtime has one React entrypoint and two supported catalog modes:

| Surface | Route | Responsibility |
| --- | --- | --- |
| Foundations catalog | `/design-system?section=basics` | Tokens, color, typography, spacing, layout, icons, elevation, and motion references. |
| Component workbench | `/design-system?mode=workbench&section=components&family=buttons` | Searchable family navigation, live examples, source details, options, and copyable usage. |
| UI-block workbench | `/design-system?mode=workbench&section=ui-blocks&family=app-layout` | Composed application patterns built from shared components. |

The application shell is `App → ApplicationDesignSystemPage → DesignSystemScreen` for the foundations route and `App → ApplicationDesignSystemPage → DesignSystemWorkbench` for workbench routes. The current registry contains 20 entries across 22 families and three sections (`basics`, `components`, and `ui-blocks`).

## Component inventory

Foundations are owned by `src/components/design-system/basics/`, including the semantic token file, base styles, layout primitives, and the `DesignSystemRoot` wrapper. Public component families are registered under `src/components/design-system/components/`:

- Actions: `AppButton`, `TextAction`
- Forms: `TextField`, `TextArea`, `CheckboxField`, `RadioGroup`, `SelectField`, `SwitchField`, and `FieldSupport`
- Selection: `Combobox`, `MultiSelect`
- Navigation: `Breadcrumbs`, `Pagination`, `SegmentedControl`, `Stepper`, and `Tabs`
- Overlays: `Dialog`, `Popover`, and menu primitives
- Feedback: `Alert`, `ErrorState`, `Progress`, `Skeleton`, `StatusBadge`, and `ToastProvider`
- Files: `FileDropzone` and `FileList`
- AI: `AITaskStatus` and `AIResult`
- Content: `ActionCard`, `FactGrid`, `InlineText`, and `SelectionTile`
- Data: `Table`, `FilterToolbar`, and `BulkActionBar`

Composed UI blocks live under `src/components/design-system/ui-blocks/`: `SettingsForm`, `AIWorkspace`, `AppLayout`, `ItemBrowser`, and `ItemDetail`. Reference-only compositions live under `src/components/design-system/examples/`; compatibility exports remain under the older flat paths and are covered by tests.

## Baseline evidence

- `src/` contains 255 files and 51 CSS files.
- `npm run test:run`: 41 files and 172 tests passed after harmonization.
- `npm run build`: succeeds with the existing Vite chunk-size warning for the design-system page bundle.
- `npm ls --depth=0 --omit=optional`: resolves the installed package tree.
- The source contained a second legacy palette in `src/styles/tokens.css`, while the active catalog uses `--v2-*` tokens from `src/components/design-system/basics/tokens.css`.
- The source scan found raw fallback colors and undeclared semantic names (`--v2-focus`, `--v2-surface-muted`, `--v2-warning`, `--v2-muted-ink`, and `--v2-shadow`) in component CSS. These were the primary harmonization targets because they could bypass or silently fall back from the canonical token contract.

## Findings and decisions

### P1 — Two token palettes could produce different application chrome

`src/styles/tokens.css` defined independent canvas, ink, accent, success, typography, radius, shadow, and motion values. `src/styles/global.css` consumed those aliases while the design-system components consumed `--v2-*`. A consumer importing both entries could therefore render one surface with two visual systems.

Decision: keep compatibility names, but make them aliases of the v2 semantic roles. No consumer-facing behavior changes; the old names stop defining a competing palette.

### P1 — Several semantic names used by shipped CSS were not declared

The component CSS referenced `--v2-focus`, `--v2-surface-muted`, `--v2-warning`, `--v2-muted-ink`, and `--v2-shadow` with hard-coded fallbacks. That hides missing token coverage and makes the same component vary depending on load order.

Decision: define these roles in the foundation token file, alias them to the existing light theme, and remove fallback literals from the shared component styles as those files are touched.

### P2 — Registry metadata is broad but must remain verifiable

The current registry has 20 entries and 22 families. Every metadata source path currently resolves, but registry tests must continue to assert source existence and renderer coverage as the catalog grows.

Decision: keep the registry as the source of catalog truth and strengthen its tests rather than maintaining a second hand-written inventory.

### P2 — Example-only content must remain scoped

Dark preference previews, artwork swatches, and speculative blocks are useful reference material but do not represent supported application themes or product capabilities.

Decision: preserve them as examples, label their scope, and keep application tokens light-only.

### P2 — Full consumer-app adoption is outside this repository

The legacy product screens were removed before this commit. A complete migration of an external consuming application cannot be claimed from this checkout alone.

Decision: finish the library-level harmonization here and retain an explicit adoption checklist for the next consumer repository: replace local primitives, import semantic tokens, test every route at narrow widths, and delete duplicate styles only after usage is migrated.

## Harmonization completed

- Compatibility names in `src/styles/tokens.css` now alias the semantic v2 roles; the canonical light palette remains in `basics/tokens.css`.
- Missing semantic roles are declared once and consumed without application-color or typography fallbacks. The token test guards both files and the alias contract.
- Registry metadata now exposes family-specific semantic tokens, and registry tests enforce source existence, renderer coverage, and v2 token references.
- Shared progress styles animate `transform` instead of layout width; segmented controls, tab panels, toasts, and reduced-motion notes use the structural border tokens without decorative side-tab hacks.
- Foundations and component workbench routes were inspected in the browser. At a 390px viewport, both foundations and inputs workbench measured equal client and scroll widths with no horizontal overflow.

## Acceptance checklist

- [x] Foundations and workbench routes are represented in the catalog.
- [x] Public component families and UI blocks are represented in the registry.
- [x] Legacy aliases resolve only to semantic v2 roles.
- [x] Every semantic token referenced by shared CSS is declared.
- [x] Registry source and renderer coverage are enforced by tests.
- [x] Shared CSS has no unresolved token fallbacks for application colors or typography.
- [x] Desktop, narrow viewport, keyboard focus, reduced motion, and production build checks pass.
- [x] The next consuming application has a documented migration path.

## Final verification

- `npm run test:run`: 41 files and 172 tests passed.
- `npm run typecheck`, `npm run build`, `npm run build:library`, `npm run verify:package`, and `npm run verify:consumer`: all passed. The application build retains the existing non-blocking large-chunk warning for the design-system page.
- Impeccable detector: no findings for `src/components/design-system`, `src/screens`, `src/workbench`, and `src/styles`.
- Browser checks: foundations and inputs workbench routes loaded; desktop and 390px measurements showed no horizontal overflow. The live browser verification used local development only and did not invoke external providers or destructive actions.
