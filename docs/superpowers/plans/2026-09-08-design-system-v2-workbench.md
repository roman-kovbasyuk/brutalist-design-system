# Design System v2 — Grouped Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development when delegation is selected, or execute inline task-by-task with review checkpoints. Complete A before B; track checkbox steps and review each task.

**Goal:** Let a developer compare related examples, adjust one in place and copy working code without losing context.

**Architecture:** A typed registry supplies families, examples, documentation and search. Query-based navigation selects a family; a session store retains example values and an optional shared details panel. The gallery uses the portable core and never reimplements controls.

**Tech Stack:** React/TypeScript, core Components, Vite, Vitest/Testing Library, Storybook React/Vite, Playwright and axe.

**Spec:** [v2 proposal](../../design-system/v2-assessment-and-proposal.md); [master plan](2026-09-08-design-system-v2-implementation.md); [core contracts](2026-09-08-design-system-v2-core.md).

## Global Constraints

- All master-plan Global Constraints apply.
- Exactly three library destinations: Basics, Components, UI Blocks. Families group examples; a component does not require its own screen.
- No click-to-inspect wrapper around an interactive preview. Code and Adjust are separate labelled actions.
- Only documented enum/boolean settings may enter a shared URL; text drafts and files remain local.
- Keep example identity independent of selected inspector tab, viewport width and selected example.

## B1 — Create the single registry and route contract

**Files:** Create `src/workbench/registry/types.ts`, `families.ts`, `metadata.ts`, `entries.ts`, `validateRegistry.ts`, `registry.test.ts`, `src/workbench/navigation/route.ts`, `route.test.ts`; read `examples/library-catalog.js` and `PreviewMetadata.jsx` for migration mapping.

**Consumes:** Core public exports and current inventory. **Produces:** `families`, `entries`, registry validation and route parser/formatter.

```ts
import type {ComponentType} from 'react'
export type Section = 'basics' | 'components' | 'ui-blocks'
export type Value = string | number | boolean
export type Values = Record<string, Value>
export type View = 'options' | 'code' | 'usage'
export type Control =
  | {key:string; label:string; type:'boolean'; shareable:boolean}
  | {key:string; label:string; type:'select'; choices:string[]; shareable:boolean}
  | {key:string; label:string; type:'text'; maxLength:number; shareable:false}
export type ExampleProps = {
  options: Values; draft: Values;
  onDraftChange(patch: Values): void
}
export type Example = {
  id:string; title:string; group:string; defaults:Values; initialDraft:Values;
  controls:Control[]; Component:ComponentType<ExampleProps>;
  getSource(options:Values):string
}
export type Entry = {
  id:string; familyId:string; name:string; purpose:string;
  maturity:'experimental'|'beta'|'stable'|'deprecated';
  source:string; exports:string[]; dependencies:string[]; tokens:string[];
  usage:string; keyboard:string; constraints:string[]; examples:Example[]
}
export type EntryMetadata = Omit<Entry, 'examples'> & {
  examples: Omit<Example, 'Component'>[]
}
export type Family = {
  id:string; section:Section; title:string;
  layout:'swatches'|'rows'|'grid'|'blocks'; groups:string[]
}
export type Route = {section:Section; family?:string; example?:string; view?:View}
// parseRoute(url: URL, families: Family[], entries: Entry[]): Route
// formatRoute(route: Route, base: URL): URL
// validateRegistry(families: Family[], entries: EntryMetadata[]): string[]
```

- [ ] Define Basics families color, typography, spacing, elevation, motion, layout, icons; Components families buttons, inputs, selection, navigation, overlays; UI Blocks settings. Use globally unique family IDs and example IDs unique within a family. Assign other existing entries to additional family records as they become available; do not fabricate implemented entries.
- [ ] Validate duplicate IDs, missing families/groups, absent source paths, undocumented exports, invalid defaults/options and empty examples. Keep filesystem existence checking in a Node test/script, not browser code. Reject a Stable record without its evidence record introduced in B6.
- [ ] Test routes using real registry fixtures:

```ts
const url = new URL('https://example.test/?section=components&family=buttons&example=primary&view=code')
expect(parseRoute(url, families, entries)).toEqual({section:'components', family:'buttons', example:'primary', view:'code'})
expect(validateRegistry(families, entries)).toEqual([])
```

- [ ] Ignore unknown query keys and invalid views; unknown family renders a useful family-selection message, not a blank screen. Invalid example leaves its valid family open with a notice. Encode values through URLSearchParams. Translate old known preview hashes and section links with an explicit mapping; unknown old anchors get the same recoverable notice.
- [ ] Exclude missing product source entries and catalog-only helpers from reusable component search. Keep legacy/experimental metadata accurate. Export only serializable documentation into agent-facing artifacts; renderer functions remain browser modules.
- [ ] `metadata.ts` imports only side-effect-free source/default definitions; `entries.ts` joins that metadata with React example components for the browser. Validation scripts import metadata, never CSS or renderer modules. Runtime `Entry[]` is structurally valid input to `validateRegistry`; pure metadata allows the same checks in Node.
- [ ] Run registry/route tests and typecheck. Commit as `feat: define family registry and shareable navigation`.

## B2 — Build the first family galleries from shared examples

**Files:** Create `src/workbench/gallery/FamilyGallery.tsx`, `ExampleTile.tsx`, `gallery.css`, `FamilyGallery.test.tsx`; create `components/actions/AppButton.examples.tsx` and `AppButton.source.ts`, `components/forms/Input.examples.tsx` and `Input.source.ts`, `components/forms/Selection.examples.tsx` and `Selection.source.ts`, `basics/Basics.examples.tsx` and `Basics.source.ts` under the design-system directory; update registry metadata, entries and families.

**Consumes:** B1 registry, A core. **Produces:** `FamilyGallery({family, entries, onInspect, state, onChange})` and independently controlled example components reused by stories.

- [ ] Build complete Basics sheets: swatches with role/value and copy; typography rows with readable samples; spacing/elevation scales; layout reflow specimens; motion replay. Icons use a curated list of actually imported Lucide exports with accessible-name guidance and name search; no import of every icon into the initial bundle.
- [ ] Buttons groups: Emphasis, Sizes, With icons, States. Inputs: Text inputs, Supporting elements, Validation and states. Selection: Checkbox, Radio, Switch, Select. Show one varying dimension per group. Busy/disabled specimens are separately labelled; preview buttons do not trigger network actions.
- [ ] Test that previews and inspector actions are separate:

```tsx
const inspect = vi.fn()
render(<ExampleTile title="Primary" onCode={() => inspect('code')} onAdjust={() => inspect('options')}>
  <AppButton>Save changes</AppButton>
</ExampleTile>)
await userEvent.click(screen.getByRole('button', {name:'Save changes'}))
expect(inspect).not.toHaveBeenCalled()
await userEvent.click(screen.getByRole('button', {name:'Code for Primary'}))
expect(inspect).toHaveBeenCalledWith('code')
```

- [ ] Use heading + preview + small action row rather than enclosing decorative cards. Define grid minimums through shared Grid; input previews need at least 280px where available and stack below that. Reserve lift/focus space without `overflow:hidden` on controls. Real overlays use the core portal layer.
- [ ] Keep `Example.Component` references at module scope. Never define new component functions during gallery rendering. Stable host key is `familyId/example.id`, never serialized options or screen size.
- [ ] Register new modules only after every example's source is usable. Keep unrelated local demos Experimental until they have real APIs and state coverage; retain their source files without presenting them as Stable entries.
- [ ] Run FamilyGallery tests, registry validation and typecheck. Commit as `feat: present related components in comparison galleries`.

## B3 — Add the workbench shell, navigation and search

**Files:** Create `src/workbench/Workbench.tsx`, `WorkbenchHome.tsx`, `navigation/useWorkbenchRoute.ts`, `search/search.ts`, `search/SearchPanel.tsx`, `search/search.test.ts`, `Workbench.test.tsx`, `workbench.css`; modify `src/screens/ApplicationDesignSystemPage.jsx` to select the new workbench under `?workbench=v2` during migration.

**Consumes:** B1 routes/registry, B2 galleries, A5 navigation and A6 drawers. **Produces:** Runnable v2 workbench alongside the existing catalog until B6 cutover.

- [ ] Primary navigation uses Basics/Components/UI Blocks. Family navigation comes only from registry data. Getting started and Changes are supporting links; family section-jump links point to actual rendered headings. Show a useful category overview when no family is selected.
- [ ] Implement `searchEntries(entries: Entry[], query: string, includeExperimental: boolean)` returning `{entryId:string, familyId:string, exampleId?:string, label:string, description:string}[]`. Search normalized names, purpose, constraints and curated synonyms such as “text field” → Inputs; no remote search. Default excludes experimental entries with a visible Include experimental toggle.
- [ ] Test no-results, matching across categories and hidden experimental results:

```ts
expect(searchEntries(entries, 'text field', false).some(hit => hit.familyId === 'inputs')).toBe(true)
expect(searchEntries(entries, 'no-such-library-item', false)).toEqual([])
```

- [ ] Use shared Input, links and Drawer for search. Focus input on open; Escape closes and restores the trigger. Display result count and a clear no-results message. Native links provide keyboard navigation; do not invent listbox semantics for page navigation. Search selection opens the family and reveals the matching example.
- [ ] `useWorkbenchRoute` handles pushState and popstate, preserving modifier clicks and query filters. Do not force reload or discard current draft on same-family navigation. Honor `BASE_URL` in URLs.
- [ ] Home shows available working groups immediately; when B5 settings is ready, feature it. Do not display dead “coming soon” cards as clickable examples.
- [ ] Extend `playwright.config.ts` with a second webServer running the workbench at port 5180 and a workbench Chromium project with baseURL `http://127.0.0.1:5180`. Match `core.spec.ts`/`overlays.spec.ts` only to consumer project, and `workbench*.spec.ts`/`accessibility.spec.ts` only to workbench project. During migration, workbench tests include `workbench=v2` in initial navigation; B6 removes that flag. This prevents gallery tests accidentally running against the consumer fixture.
- [ ] Run search/workbench/route tests and build. Commit as `feat: add searchable product-independent workbench`.

## B4 — Implement in-place options, source and persistent example state

**Files:** Create `src/workbench/state/exampleState.ts`, `ExampleStateProvider.tsx`, `exampleState.test.ts`, `details/ExampleDetails.tsx`, `details/OptionsForm.tsx`, `details/CodePanel.tsx`, `details/DetailsLayout.tsx`, `details/details.css`, `details/ExampleDetails.test.tsx`; modify Workbench/FamilyGallery and add `tests/browser/workbench-state.spec.ts`.

**Consumes:** Example/Values/Control types and A shared components. **Produces:** A single details panel and session state keyed by stable example identity.

```ts
type ExampleState = {options:Values; draft:Values; resetVersion:number}
type ExampleAction =
  | {type:'options'; key:string; patch:Values}
  | {type:'draft'; key:string; patch:Values}
  | {type:'reset'; key:string; initial:ExampleState}
// reduceExamples(state: Record<string, ExampleState>, action: ExampleAction)
// Only explicit reset may increment resetVersion to reset an example subtree.
```

- [ ] Test that two specimens remain independent and editing survives switching details. Options control configuration; draft holds entered preview values. Never derive live drafts anew from defaults during an inspector open/close.
- [ ] Implement one Options/Code/How to use panel with shared PillTabs and real labelled panels. Schema maps booleans to Switch, choices to SelectMenu, text to FormField/Input. Validate unknown options and enum values before applying. Text controls enforce maxLength and remain excluded from share URLs.
- [ ] Side/inline/sheet layout follows master-plan content-width thresholds. Keep preview nodes outside the inspector tree. If the inspector presentation remounts in a Drawer, its meaningful values come from the provider; preview components do not remount. Track the opener and restore focus on close. Modal sheets lock background interaction using shared Drawer.
- [ ] Build source from the selected example's deterministic `getSource(options)`. It returns complete imports and a runnable exported React example. Escape labels as JavaScript string literals, not raw JSX or HTML. Implement clipboard pending/success/failure with an explicit retry path; reuse TokenCopyTarget feedback behavior through a generic shared copy helper if extraction is needed.
- [ ] Browser regression:

```ts
await page.getByRole('textbox', {name:'Example name'}).fill('Retained draft')
await page.getByRole('button', {name:'Adjust for Name input'}).click()
await page.setViewportSize({width:390, height:844})
await page.keyboard.press('Escape')
await expect(page.getByRole('textbox', {name:'Example name'})).toHaveValue('Retained draft')
```

- [ ] Add per-example reset, visible selected-example marker, and share-link copy using only approved options. Reset clears that example only. Preserve scroll position during details selection; scroll just enough to reveal off-screen targets.
- [ ] Run state/details tests, browser-state test and typecheck. Commit as `feat: inspect and adjust examples without leaving galleries`.

## B5 — Prove adoption with a complete settings UI Block

**Files:** Create `src/components/design-system/ui-blocks/settings/SettingsForm.tsx`, `SettingsForm.examples.tsx`, `SettingsForm.source.ts`, `SettingsForm.test.tsx`, `settings-form.css`; move SettingsPanel/Row/Footer into `components/forms/SettingsPanel.tsx` with compatibility exports; create `scripts/check-example-source.ts`, `tsconfig.examples.json`, `docs/design-system/getting-started.md`; modify `.gitignore`, consumer Vite config/App and registry.

**Consumes:** A fields/actions/select, B example schema. **Produces:** Generic settings block and working source-copy validation.

```ts
export type SettingsValue = {name:string; language:string; notifications:boolean}
import type {SaveResult} from '../../basics/types'
// SettingsForm: initialValue: SettingsValue,
// onSave(value: SettingsValue): Promise<SaveResult>.
// Draft lives in SettingsForm; caller supplies persistence. No API calls internally.
```

- [ ] Preserve and render SettingsPanel/SettingsRow description props, currently accepted but omitted from JSX. Use visible labels and associations for controls. Settings example data is neutral: “Workspace name”, “Language”, “Notifications”.
- [ ] Write a rejected-save test: edit name; save rejects with a supplied message; alert is visible; draft remains; retry succeeds; cancel returns to the last successfully saved value. Empty trimmed name is invalid. Guard duplicate submits with pending state; no artificial success timers in production component.
- [ ] Implement four deterministic example scenarios using caller callbacks: unchanged, dirty, save error, save success. Gallery demo scenarios are explicitly local. Seed resets may remount only on explicit example reset.
- [ ] `getSource(options)` emits complete code with imports from the provisional consumer alias `@design-system` plus `@design-system/styles.css`. This alias is a local adoption proof, not a published package name. The example source includes `useState`/async callback wiring when required and labels fixture persistence as a demo.
- [ ] Add compatible `tsx` as a dev dependency and `check:examples: tsx scripts/check-example-source.ts`. The script generates each supported default/preset source into `.generated/examples/` and invokes `tsc -p tsconfig.examples.json --noEmit`. Map `@design-system` only to the public index and the CSS alias to the public stylesheet in TypeScript/Vite. Script execution must not import CSS: define serializable example-source metadata in side-effect-free `*.source.ts` modules and share it with renderer definitions. Fail on missing imports or errors; do not transpile-only. Ignore generated files in git. The script validates supported default and preset combinations; it does not claim to prove every arbitrary edited value.
- [ ] Copy the actual generated settings source into the consumer harness and render it. Consumer CSS imports only the public entry; compare appearance and keyboard/save behavior with the workbench. Document precise setup, stylesheet/root use and the local alias limitation.
- [ ] Run SettingsForm tests, `npm run check:examples`, typecheck and consumer browser tests. Commit as `feat: ship a portable settings block with runnable examples`.

## B6 — Add executable stories, cut over and verify the first release

**Files:** Create `.storybook/main.ts`, `.storybook/preview.ts`, `vitest.storybook.config.ts`, adjacent `*.stories.tsx` files for Buttons, Inputs, Selection, Basics and Settings; `tests/browser/workbench.spec.ts`, `tests/browser/accessibility.spec.ts`, `src/workbench/registry/evidence.ts`, `scripts/check-registry.ts`; modify package/lockfile, `src/App.jsx`, `src/main.jsx`, `ApplicationDesignSystemPage.jsx`, existing App/Screen tests, `.github/workflows/deploy-pages.yml`, `README.md`, `PRODUCT.md`, `DESIGN.md`, and `AGENTS.md`.

**Consumes:** B1–B5; A consumer harness. **Produces:** New workbench as default, shared story fixtures and automated quality gates.

- [ ] Install compatible Storybook React/Vite, Vitest addon and accessibility tooling; keep existing jsdom suite as-is in its own configuration. Add `storybook`, `build-storybook`, `test:stories`, `check:registry` scripts. `test:stories` explicitly selects the story configuration. The public workbench must not import Storybook runtime modules.
- [ ] Each story imports the same `Example.Component` and defaults used by the gallery; a thin controlled wrapper manages draft/options. Do not duplicate the specimen implementation. Story titles follow `Basics/Color`, `Components/Buttons`, `UI Blocks/Settings`.
- [ ] Store evidence separately from maturity: `{entryId, checkedRevision, checks: {typecheck, interaction, accessibility, visual}}`. Populate only from actual review/CI results; unknown is not passed. Registry tests check Stable eligibility and source/dependency existence. Add `check:registry: tsx scripts/check-registry.ts`; read the side-effect-free metadata and verify paths/exports without importing browser CSS.
- [ ] Update App to render the workbench by default; preserve old section URLs and recognized example hashes. Update root tests to assert a meaningful library start screen and the three categories. Remove the migration switch after equivalent routing is verified.
- [ ] Stop importing monolithic catalog/global styles from the new shell. Retain untouched legacy sources only if used by clearly labelled examples; do not claim removal of the stylesheet while a public component still imports it. Update product documentation and agent instructions to the independent system, removing obsolete campaign architecture guidance rather than altering any future consumer's workflow rules.
- [ ] Add browser coverage for all primary navigation, fresh direct links, reload/back/forward, no-results, gallery comparisons, copy failure/retry, state retention and reset. Example route assertion:

```ts
await page.goto('/?section=components&family=buttons&example=primary&view=code')
await expect(page.getByRole('heading', {name:'Buttons', exact:true})).toBeVisible()
await expect(page.getByRole('tab', {name:'Code', exact:true})).toHaveAttribute('aria-selected', 'true')
```

- [ ] Run axe against each initial family and an open drawer/dialog, then keyboard-check focus sequences manually. Capture reviewed visual baselines at 1440×1000 and 390×844, plus 768px state-retention checks; cover actual hover/focus and reduced motion. Disable animation for still screenshots only; separately test real transitions. Initial images require human visual review rather than automatic blind acceptance.
- [ ] Before the existing build/deploy step, run typecheck, tests, registry/example checks, Storybook build/story tests and browser checks. Add PR verification in `.github/workflows/verify.yml` without deployment permissions. Install the pinned browser tooling in CI. Preserve current deployment destination and trigger semantics.
- [ ] Complete B acceptance: `npm run typecheck`, `npm run test:run`, `npm run check:registry`, `npm run check:examples`, `npm run test:stories`, `npm run test:browser`, `npm run build-storybook`, `npm run build`. Record failures accurately; finish only when required gates pass. Commit as `feat: launch the verified grouped design system workbench`.

## Stage B completion

- [ ] Browsing uses three categories and family galleries; there is no required individual button/input page.
- [ ] Code/Adjust preserve context and input across responsive changes; direct links and static-host refresh work.
- [ ] Settings source compiles and runs with only public API/styles in the consumer harness.
- [ ] Basics, Buttons, Inputs, Selection and Settings have accurate support/maturity and executable examples.
- [ ] First release is reviewable independently of the Stage C expansion.
