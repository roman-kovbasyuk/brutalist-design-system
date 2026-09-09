# Design System v2 — Components and UI Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development when delegation is selected, or execute inline task-by-task with review checkpoints. Complete B first; track checkbox steps and review each task independently.

**Goal:** Expand the proven library into common application interactions, four complete UI Blocks and dependable distribution.

**Architecture:** Components own generic presentation and interactions; UI Blocks compose them around explicit caller-supplied data/callbacks. Registry examples feed both the workbench and stories; package and agent exports describe the same supported API.

**Tech Stack:** Stage A/B stack; use existing Radix behavior and native HTML. Add no table, chart, editor, authentication or AI-provider dependency in this stage.

**Spec:** [v2 proposal](../../design-system/v2-assessment-and-proposal.md); [master](2026-09-08-design-system-v2-implementation.md), [core](2026-09-08-design-system-v2-core.md), [workbench](2026-09-08-design-system-v2-workbench.md).

## Global Constraints

- All master-plan Global Constraints apply.
- Reuse the B1 Example/Entry types and public core API. Every task adds entries, controlled example modules and stories using the established machinery.
- Each component folder owns its CSS, behavior tests and examples. Update public `index.ts`/`styles.css` when an export becomes supported.
- For each named `Name.examples.tsx` below, also create adjacent `Name.source.ts` for defaults, allowed options and `getSource`; the examples module imports it. Node checks and exports use side-effect-free registry metadata, never React/CSS modules. Register stories against the existing B6 test setup.
- Caller owns requests, permissions, retry decisions and authoritative results. Demo scenarios use local fixtures and are visibly identified.
- Do not include the master plan's Later backlog as part of these tasks.

## C1 — Complete reusable selection controls

**Files:** Create `components/forms/Select.tsx`, `Combobox.tsx`, `MultiSelect.tsx`, `selection.css`, `SelectionControls.test.tsx`, `SelectionControls.examples.tsx`, `SelectionControls.stories.tsx`; update the B registry and retain old SelectMenu API.

**Consumes:** A4 Choice shape, fields and A6 Popover. **Produces:** Stable value/label selection controls, without changing the string-list SelectMenu contract.

```ts
export type Option = {value:string; label:string; disabled?:boolean}
// Select/Combobox: label, name?, value, options:Option[], onChange(value),
// disabled?, required?, id?, 'aria-describedby'?, 'aria-invalid'?.
// Combobox also: query?, onQueryChange?(query), loading?, emptyMessage?.
// MultiSelect uses value:string[] and onChange(values:string[]).
```

- [ ] Write tests for stable values despite label changes, hidden/native form values, field descriptions, no-results, disabled options and keyboard operation. Example:

```tsx
render(<Select label="Language" name="language" value="en" options={[{value:'en',label:'English'}]} onChange={vi.fn()} />)
expect(screen.getByLabelText('Language')).toBeInTheDocument()
expect(document.querySelector('input[name="language"], select[name="language"]')).toHaveValue('en')
```

- [ ] Build Select on Radix Select or native select, matching canonical styling. Build Combobox with input/listbox relationships, active descendant, Arrow/Home/End navigation, Enter selection and Escape dismissal. For asynchronous results, caller supplies options/loading; retain query and discard invalid active IDs when options change. No built-in fetching.
- [ ] MultiSelect keeps selected values stable while filtering; removable chips are named buttons; Backspace removal happens only on an empty query. Restore focus predictably after chip removal. Empty and loading messages do not become selectable options. Test IME composition before handling Enter.
- [ ] Reuse A5 SegmentedControl/PillTabs/WorkflowSteps in neutral navigation stories; distinguish tabs, single-value choices and route links in guidance.
- [ ] Run SelectionControls tests, story/browser keyboard checks and generated-source checks. Commit as `feat: add reusable value-based selection controls`.

## C2 — Complete feedback and confirmation

**Files:** Create `components/feedback/StatusBadge.tsx`, `Alert.tsx`, `Progress.tsx`, `Skeleton.tsx`, `ErrorState.tsx`, `ToastProvider.tsx`, `feedback.css`, `Feedback.test.tsx`, `Feedback.examples.tsx`, `Feedback.stories.tsx`; create `components/overlays/AlertDialog.tsx`, `AlertDialog.test.tsx`; port AsyncStatus/EmptyState with compatibility exports.

**Consumes:** Core overlays/actions and existing AsyncStatus/EmptyState. **Produces:** Explicit feedback APIs and controlled confirmation.

```ts
type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
// StatusBadge: tone?, children; not a live region by default.
// Alert: tone?, title?, children, onDismiss?; role matches urgency.
// Progress: label, value?:number, max?:number (100 default).
// ErrorState: title, message, onRetry?, busy?.
// ToastProvider children; useToast() -> {notify({id?, message, tone?, durationMs?}):string, dismiss(id):void}.
// AlertDialog: open, onOpenChange, title, description, confirmLabel,
// onConfirm():Promise<SaveResult>, busy?, returnFocusRef?.
// SaveResult is imported from basics/types.ts, established by A1.
```

- [ ] Test determinate values clamp to 0..max and invalid/nonpositive max is rejected; indeterminate progress omits a percentage. Test no success announcement before a callback resolves; failed confirmation stays open with its message and retry available.
- [ ] Build AlertDialog from shared Radix-backed infrastructure; initially focus Cancel. Keep the action pending and prevent duplicate confirmation. Escape/dismissal policy during pending is documented; dismissing UI does not imply cancelling an operation.
- [ ] Notification queue uses stable IDs, an explicit Dismiss action and cleanup on unmount. Default success/info duration is 6000ms; danger/action-required messages persist. Pause expiry during hover/focus; do not reannounce the whole queue. No toast should hide the only copy of a form validation error.
- [ ] Example test:

```tsx
render(<Progress label="Processing" />)
expect(screen.getByRole('progressbar', {name:'Processing'})).not.toHaveAttribute('aria-valuenow')
```

- [ ] Add error, empty, unavailable and loading examples; pair color with text/symbols. Run unit/story checks, modal browser checks and axe on visible feedback states. Commit as `feat: add canonical feedback and confirmation states`.

## C3 — Build ordinary tables, filters and bulk selection

**Files:** Create `components/data/Table.tsx`, `FilterToolbar.tsx`, `BulkActionBar.tsx`, `table.css`, `Table.test.tsx`, `Table.examples.tsx`, `Table.stories.tsx`.

**Consumes:** A navigation/selection, C1 select, C2 states. **Produces:** A native semantic table and controlled toolbar/action compositions, not an ARIA DataGrid.

```ts
import type {ReactNode} from 'react'
export type Column<T> = {id:string; header:string; cell(row:T):ReactNode; sortable?:boolean}
export type Sort = {columnId:string; direction:'asc'|'desc'}
// Table<T>: label, rows:T[], columns:Column<T>[], getRowId(row):string,
// sort?:Sort, onSortChange?(sort:Sort), selectedIds?:string[], onSelectionChange?(ids:string[]):void.
// FilterToolbar: query, onQueryChange(query), children (filter slots), onClear?;
// BulkActionBar: count, children (explicit action slots), onClear().
```

- [ ] Test sort callbacks and `aria-sort`, row identity after reorder, select-all scope and indeterminate state. Select-all affects only rows supplied to the current table; off-page selected IDs remain caller-owned.
- [ ] Use `<table>`, `<caption>` or accessible label, column header scopes and actual checkbox controls. Sorting changes requested sort only; caller supplies ordered data. Keyboard navigation remains normal tab order. Local ScrollArea contains wide tables; never force whole-document overflow.
- [ ] Test example:

```tsx
const change = vi.fn()
render(<Table label="Items" rows={[{id:'a',name:'Alpha'}]} columns={[{id:'name',header:'Name',cell:r=>r.name}]} getRowId={r=>r.id} selectedIds={[]} onSelectionChange={change} />)
await userEvent.click(screen.getByRole('checkbox', {name:'Select row a'}))
expect(change).toHaveBeenCalledWith(['a'])
```

- [ ] FilterToolbar composes shared Input/Select with clear labels. Announce result count at the block level rather than inside each filter. BulkActionBar offers selection count, clear and caller actions; it never performs destructive actions automatically.
- [ ] Run table tests and stories for zero, one, many, long labels, selected and sorting states. Verify 390px local scrolling and tab access. Commit as `feat: add reusable data browsing components`.

## C4 — Port content and editing components without changing their contracts

**Files:** Create typed implementations in `components/content/ActionCard.tsx`, `FactGrid.tsx`, `SelectionTile.tsx`, `MediaWorkflowCard.tsx`, `WorkflowModuleFrame.tsx`, `InlineText.tsx`, `UpdatedText.tsx`, `useExitPresence.ts`; colocate their existing CSS; create `Content.test.tsx`, `Content.examples.tsx`, `Content.stories.tsx`. Convert existing atom/molecule/organism source paths to re-exports.

**Consumes:** Existing APIs described in README and source; A actions/layout and C2 feedback. **Produces:** The same named APIs with portable styling, types and generic examples.

- [ ] Preserve all existing props and return contracts; do not replace cards with a generic variant mega-component. Preserve FactGrid semantic facts, SelectionTile no-nested-controls rule, ActionCard inert exit state, stable identity in UpdatedText and source-key capture in InlineText.
- [ ] Add the regression for stale input capture:

```tsx
const save = vi.fn().mockResolvedValue({ok:true})
const view = render(<InlineText label="Title" value="Original" sourceKey="one" onSave={save} />)
await userEvent.click(screen.getByRole('button', {name:'Edit title'}))
await userEvent.clear(screen.getByRole('textbox', {name:'Title'}))
await userEvent.type(screen.getByRole('textbox', {name:'Title'}), 'Draft')
view.rerender(<InlineText label="Title" value="External" sourceKey="two" onSave={save} />)
await userEvent.click(screen.getByRole('button', {name:'Save'}))
expect(save).toHaveBeenCalledWith('Draft', 'one')
```

- [ ] Replace default product-specific wording with neutral “saved value” language. Keep content/security/version-conflict decisions outside the component. Do not silently overwrite dirty input when caller data changes.
- [ ] Register examples for save success/failure, conflict, read-only, long content, selected content, exiting content and reduced motion. Preserve card-width container behavior when CSS moves.
- [ ] Run Content tests plus old SelectionTile/useExitPresence tests, generated-source checks and content browser geometry. Commit as `refactor: make content and editing components portable`.

## C5 — Add generic upload and AI-task components

**Files:** Create `components/files/FileDropzone.tsx`, `FileList.tsx`, `files.css`, `Files.test.tsx`, `Files.examples.tsx`; port `PromptComposer` into `components/ai/PromptComposer.tsx`; create `AITaskStatus.tsx`, `AIResult.tsx`, `ai.css`, `AI.test.tsx`, `AI.examples.tsx`, and stories for both families. Preserve the old PromptComposer path.

**Consumes:** A fields/actions/overlays, C2 feedback, C4 content. **Produces:** Caller-controlled transfer/task UI.

```ts
export type FileItem = {id:string; name:string; status:'ready'|'pending'|'failed'; error?:string}
// FileDropzone: label, accept?:string[], maxBytes?:number, multiple?:boolean,
// disabled?, onFiles(files:File[]):void, onRejected(items:{name:string;reason:string}[]):void.
// FileList: items:FileItem[], onRemove(id), onRetry?(id), disabled?.
export type TaskState = 'idle'|'running'|'waiting'|'partial'|'ready'|'cancelled'|'failed'
// AITaskStatus: state:TaskState, message:string, onCancel?, onRetry?.
// AIResult: title, children, sourceLabel?, onApply?, onRevise?, applying?.
```

- [ ] Validate both picker and drop paths using the same function. Explicitly specify accepted extensions/MIME patterns; reject oversize and unsupported files with named reasons. Passing `accept` to a native input is not validation. Keep upload URLs, transfer progress and persistence outside the components.
- [ ] Test a mixed drop keeps accepted files and reports rejected ones; disabled/busy drop does nothing; removal/retry emits IDs. Add tests for duplicate filenames with different IDs and file-input reset after selection.
- [ ] Preserve PromptComposer controlled values, readonly/busy semantics and Ctrl/Command+Enter handling. Default labels become “Prompt” and “Attachments”; caller can still supply labels and accepted formats. Do not add a model selector or slash-command API solely because the exploratory demo has one.
- [ ] AI components display supplied state and result; never synthesize percentages, tool progress or reasoning. Apply requires explicit user action; retry/cancel invoke callbacks once and do not mark completion themselves. Test:

```tsx
const apply = vi.fn()
render(<AIResult title="Draft result" onApply={apply}>Sample output</AIResult>)
expect(apply).not.toHaveBeenCalled()
await userEvent.click(screen.getByRole('button', {name:'Apply'}))
expect(apply).toHaveBeenCalledTimes(1)
```

- [ ] Register idle/running/waiting/partial/ready/cancelled/failed fixtures and real controls; caller drives transitions. Run file/AI tests, old composer contract tests and browser keyboard/drop checks. Commit as `feat: add generic upload and AI task controls`.

## C6 — Build an app layout and item-browser UI Block

**Files:** Create `ui-blocks/app-layout/AppLayout.tsx`, `app-layout.css`, `AppLayout.examples.tsx`; create `ui-blocks/item-browser/ItemBrowser.tsx`, `item-browser.css`, `ItemBrowser.test.tsx`, `ItemBrowser.examples.tsx`, `ItemBrowser.stories.tsx`.

**Consumes:** A navigation/layout, C1–C4 components. **Produces:** Generic layout slots and item browsing with caller-owned data.

```ts
export type Item = {id:string; title:string; description?:string; status?:string}
// AppLayout: navigation, header, children, inspector?, feedback?: ReactNode.
// ItemBrowser: items:Item[], total:number, query:string, onQueryChange,
// page:number, pageCount:number, onPageChange, view:'list'|'grid', onViewChange,
// selectedIds:string[], onSelectionChange, loading?, error?:string,
// onRetry?, onOpen(id), bulkActions?:ReactNode.
```

- [ ] Test query/page/view callbacks and stable selection while changing views. For selected visible rows, both list and grid use the same ID; no index-based selection. Test loading versus no-results versus no-items versus error with data retained.
- [ ] AppLayout composes SidebarNav/Drawer and layout helpers. The mobile menu controls only visibility; it contains the same links. ItemBrowser uses native Table for list view and SelectionTile/ActionCard for grid with no nested interactive controls inside a selection button. Put separate open actions outside selectable tile buttons when both are needed.
- [ ] Example callback test:

```tsx
await userEvent.type(screen.getByRole('searchbox', {name:'Search items'}), 'Guide')
expect(onQueryChange).toHaveBeenLastCalledWith('Guide')
```

Use a controlled test fixture that rerenders the typed query. Define callbacks with `vi.fn` in the test; do not make ItemBrowser fetch or filter remote data internally.
- [ ] Add deterministic fixtures for loading, empty library, no matches, failed request and populated results. Provide runnable source for list/grid and selection variants. Add Expand preview using B4's stable-host approach; retain state when returning.
- [ ] Verify desktop/mobile layout, local table scroll, navigation focus and source compilation. Commit as `feat: add app layout and item browser blocks`.

## C7 — Build the item-detail UI Block

**Files:** Create `ui-blocks/item-detail/ItemDetail.tsx`, `item-detail.css`, `ItemDetail.test.tsx`, `ItemDetail.examples.tsx`, `ItemDetail.stories.tsx`.

**Consumes:** C4 facts/editing/content, C2 feedback and A dialog. **Produces:** Detail page with explicit mutation callback and preview slots.

```ts
export type DetailItem = {id:string; revision:string; title:string; description:string}
// ItemDetail: item?:DetailItem, loading?, error?:string, onRetry?,
// onSave(patch:{title?:string;description?:string}, capturedRevision:string):Promise<SaveResult>,
// metadata?:ReactNode, preview?:ReactNode, actions?:ReactNode, readOnly?:boolean.
```

- [ ] Test missing/loading/error/ready/read-only states; edit rejection preserves draft; a new revision while editing still submits the captured revision. Reuse InlineText rather than duplicating editing logic.
- [ ] Compose page heading, description, FactGrid metadata, edit actions and optional preview. Selection, permissions and version decisions stay with caller. On narrow screens retain reading/action order and accessible headings.
- [ ] In a stateful example, implement the callback as:

```tsx
async function saveTitle(patch: {title?:string}, capturedRevision: string) {
  if (capturedRevision !== item.revision) return {ok:false as const, message:'This item changed. Your edit is preserved.'}
  setItem(current => ({...current, ...patch, revision:String(Number(current.revision) + 1)}))
  return {ok:true as const}
}
```

The fixture defines `item`/`setItem` with `useState<DetailItem>` and revision `'1'`. This demo callback shows concurrency handling; the block does not implement a versioning backend.
- [ ] Register complete fixtures and compiled examples, run ItemDetail tests plus InlineText regression and browser focus/preview checks. Commit as `feat: add reusable item detail block`.

## C8 — Build the AI-workspace UI Block

**Files:** Create `ui-blocks/ai-workspace/AIWorkspace.tsx`, `ai-workspace.css`, `AIWorkspace.test.tsx`, `AIWorkspace.examples.tsx`, `AIWorkspace.stories.tsx`.

**Consumes:** C5 task/file/composer APIs, C2 feedback and C4 result surfaces. **Produces:** Generic composition with externally controlled task state.

```ts
// AIWorkspace: prompt:string, onPromptChange(value), state:TaskState,
// message:string, result?:ReactNode, attachments?:ReactNode,
// onSubmit(), onCancel?(), onRetry?(), onApply?(), onRevise?(), readOnly?:boolean.
```

- [ ] Test that mount never submits or applies; busy blocks duplicate submit; cancel emits once; failed/partial states retain prompt and supplied result. Waiting state displays the actual requested user action.
- [ ] Implement input/context, task progress and result/review areas with shared components. Preview fixture state changes are deterministic through explicit scenario controls, not random timers or actual model calls. Do not show internal reasoning or invented task logs.
- [ ] Test controlled transition:

```tsx
const cancel = vi.fn()
render(<AIWorkspace prompt="Summarize these notes" onPromptChange={vi.fn()} state="running" message="Preparing summary" onSubmit={vi.fn()} onCancel={cancel} />)
await userEvent.click(screen.getByRole('button', {name:'Cancel'}))
expect(cancel).toHaveBeenCalledTimes(1)
expect(screen.getByRole('textbox', {name:'Prompt'})).toHaveValue('Summarize these notes')
```

- [ ] Provide idle, running, waiting, partial, ready, cancelled, failure and read-only examples. Do not label a synthetic streaming preview as a streaming API. Preserve prompt and result identity across expanded/compact preview layout.
- [ ] Run AIWorkspace tests, source compilation, story/browser tests for key states and one complete keyboard flow. Commit as `feat: add generic AI workspace block`.

## C9 — Validate distribution, export agent context and close the release

**Files:** Create `src/workbench/export/context.ts`, `context.test.ts`, `scripts/build-library.mjs`, `scripts/verify-package.mjs`, `vite.library.config.ts`, `tsconfig.library.json`, `docs/design-system/releases.md`, `docs/design-system/migration-v2.md`; modify `package.json`, public entries, registry, `.github/workflows/verify.yml`, consumer harness and Getting started. Update plan/spec inventory statuses only from verified work.

**Consumes:** All A/B/C public APIs and registry examples. **Produces:** Verified local package artifact and accurate agent context, without publishing.

```ts
// exportContext(entry:Entry, example:Example, options:Values, version:string):string
// Output Markdown: version, purpose, public imports, dependencies, tokens,
// complete getSource(options), usage, keyboard, limits and maturity.
```

- [ ] Implement context copy/download through shared copy feedback and a Markdown Blob. Example test:

```ts
const result = exportContext(entry, example, example.defaults, '0.1.0')
expect(result).toContain(example.getSource(example.defaults))
expect(result).toContain(entry.usage)
expect(result).not.toContain('src/studio')
```

Test actual records and reject unsupported options. Never describe an unavailable component as usable because it appears in an old catalog.
- [ ] Build a separate `dist-library/` using Vite library mode; externalize React, React DOM, jsx-runtime and declared runtime peer dependencies. Emit declarations with a declaration-only library tsconfig, excluding examples, stories, tests and workbench. Keep app `dist/` unchanged. Add `build:library` and `verify:package` scripts.
- [ ] Generate `dist-library/package.json` for a local-only `brutalist-design-system` artifact with `private:true`, explicit JS/types/CSS exports, runtime dependencies/peers and CSS side effects. This name is provisional and unclaimed; no registry publication occurs. If changing the name for publication is requested, regenerate snippets from that one source.
- [ ] Pack into a temporary directory, install the tarball in a fresh React/Vite fixture, rewrite supported sample imports from the B5 local alias to the artifact name, and run typecheck/build plus the settings interaction test against that fixture. No source aliases or repository-relative imports are allowed in this proof. Check React is not bundled twice and CSS imports resolve.
- [ ] Compare source exports, declarations, dependency manifest, registry imports and generated snippets; fail on unknown/missing names. Add the package check to verification CI before deployment. Generate a machine-readable JSON export with version and serializable contracts alongside Markdown context; omit renderer functions.
- [ ] Document install/import/style/root usage, copied-block ownership, compatibility paths and deprecation procedure. The current font stack and supported light mode must be stated accurately. Remove obsolete product consumer claims; keep historical audit findings explicitly dated rather than rewriting evidence as if it never existed.
- [ ] Run complete release gates once: typecheck, unit, registry/source checks, story tests, browser/a11y/visual checks, Storybook build, production build, library build and package proof. Review four blocks: Settings, Item browser, Item detail, AI workspace. Record the actual evidence revision for Stable entries and any unresolved limits.
- [ ] Commit only release task files as `feat: verify design system distribution and agent context`. Publication and consumer-app integration remain separate actions.

## Stage C completion

- [ ] Four UI Blocks work through generic APIs and local examples; none embeds an application backend.
- [ ] Every supported component is discoverable in a family, with complete source and current usage constraints.
- [ ] Agent context, registry, package exports and copied snippets agree.
- [ ] The isolated tarball consumer reproduces the intended styling and interactions.
- [ ] Later backlog remains clearly distinct from completed release scope.
