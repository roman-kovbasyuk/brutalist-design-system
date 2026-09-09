# Design System v2 — Portable Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development when delegation is selected, or execute inline task-by-task with review checkpoints. Track the checkbox steps; do not dispatch agents during plan review.

**Goal:** Make the visual foundation and the controls needed by the workbench portable, typed and independently testable.

**Architecture:** Move one family at a time into Basics or Components. Preserve old paths as re-exports, and expose an intentional `index.ts` plus `styles.css`. The workbench must not supply component behavior or required styles.

**Tech Stack:** React, TypeScript added incrementally, CSS variables, existing Radix/Lucide, Vitest/Testing Library, a small Playwright consumer harness.

**Spec:** [v2 proposal](../../design-system/v2-assessment-and-proposal.md); [master plan and constraints](2026-09-08-design-system-v2-implementation.md).

## Global Constraints

- All master-plan Global Constraints apply; read them before execution.
- Keep existing tests running while JSX and TypeScript coexist. Preserve compatibility imports and callback signatures.
- Shared CSS is namespaced by component class; no `.bs-root`, `.system-screen--v2` or workbench ancestor may be required for new public components.
- No repo-wide reset replacement, dependency upgrade, product restoration or unrelated cleanup.
- Add each task's public exports to `src/components/design-system/index.ts` and stylesheet imports to `src/components/design-system/styles.css`.

## A1 — Establish typed token and style entry points

**Files:** Create `tsconfig.json`, `src/vite-env.d.ts`, `src/components/design-system/index.ts`, `src/components/design-system/styles.css`, `src/components/design-system/basics/types.ts`, `src/components/design-system/basics/tokens.css`, `src/components/design-system/basics/base.css`, `src/components/design-system/basics/DesignSystemRoot.tsx`, `src/components/design-system/basics/tokens.test.ts`; modify `package.json`, lockfile, `src/components/design-system/foundations/tokens.css`, `docs/design-system/typography.md`.

**Consumes:** Existing values in `foundations/tokens.css` and typography specimens. **Produces:** `DesignSystemRoot` with native div props, one public stylesheet, unchanged existing `--v2-*` variables, and role additions.

- [ ] Add TypeScript and matching React type packages as dev dependencies; retain React itself. Add `typecheck: tsc --noEmit`. Use `strict: true`, `jsx: react-jsx`, `moduleResolution: bundler`, `module: ESNext`, `target: ES2022`, `allowJs: true`, `checkJs: false`, `noEmit: true`; include `src` and exclude build outputs.
- [ ] Move canonical token declarations into Basics; the old foundations path becomes a CSS import. Keep legacy unprefixed values until their consumers are migrated. Public styles import Basics and component-owned CSS only.
- [ ] Define `export type SaveResult = {ok:true} | {ok:false; message:string}` in `basics/types.ts` and re-export it publicly. Components and UI Blocks import this shared callback result rather than importing types from each other in the wrong direction. Put `/// <reference types="vite/client" />` in `src/vite-env.d.ts` for stylesheet and raw-source imports.
- [ ] Add semantic aliases and exact elevation roles; keep hard edges:

```css
--v2-action: var(--v2-accent);
--v2-on-action: var(--v2-ink);
--v2-on-danger: var(--v2-surface);
--v2-on-success: var(--v2-ink);
--v2-warning-text: var(--v2-ink);
--v2-warning-surface: var(--v2-canvas);
--v2-warning-border: var(--v2-ink);
--v2-shadow-small: 2px 2px 0 var(--v2-ink);
--v2-shadow-interactive: 4px 4px 0 var(--v2-ink);
--v2-shadow-floating: 8px 8px 0 var(--v2-ink);
--v2-z-popover: 20;
--v2-z-modal: 40;
--v2-z-toast: 60;
```

The initial warning treatment uses a label/icon with black text on the existing canvas; it does not introduce another brand hue. Verify this pair with the others. Keep body at 16/22 and weight 400; headings at 500. Document the current Avenir-family fallback stack as an overridable font token; do not promise identical glyphs across operating systems.
- [ ] Scope typography and box sizing to `.ds-root`; do not style consumer `body`, links or all buttons. Implement:

```tsx
import type { ComponentProps } from 'react'
export function DesignSystemRoot({className = '', ...props}: ComponentProps<'div'>) {
  return <div {...props} className={`ds-root ${className}`} />
}
```

- [ ] Test approved text/background pairs by calculating WCAG contrast from their resolved palette values, with 4.5:1 for ordinary text. In `tokens.test.ts`, use the standard sRGB conversion `v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4`; compute luminance with `.2126/.7152/.0722`, then `(lighter + .05)/(darker + .05)`. Assert the actual pair matrix including secondary text and error text, rather than checking CSS strings. A browser check in A3 verifies the resolved styles agree with these values.
- [ ] Run `npx vitest run src/components/design-system/basics/tokens.test.ts`, `npm run typecheck`, and the existing build. Review token drift and commit only this task's files as `feat: establish portable design system foundations`.

## A2 — Add shared layout helpers

**Files:** Create `basics/layout/Stack.tsx`, `Inline.tsx`, `Grid.tsx`, `Container.tsx`, `Surface.tsx`, `Divider.tsx`, `ScrollArea.tsx`, `layout.css`, `Layout.test.tsx` beneath the design-system directory; update public entries.

**Consumes:** A1 tokens and root. **Produces:** Layout helpers with native element attributes and a small typed spacing vocabulary:

```ts
type Space = 1 | 2 | 3 | 4 | 6 | 8 | 12 | 16
// Stack/Inline: gap?: Space, children, className, native div attributes.
// Grid: minItemWidth?: number (default 280 CSS px), gap?: Space.
// Container: maxWidth?: number (default 1200 CSS px).
// Surface: tone?: 'canvas' | 'surface', children, native div attributes.
// Divider: native hr attributes. ScrollArea: label + native div attributes.
```

- [ ] Test semantic props and content order. For example:

```tsx
import {render, screen} from '@testing-library/react'
import {expect, test} from 'vitest'
import {ScrollArea} from './ScrollArea'
test('names the scrollable region', () => {
  render(<ScrollArea label="Results"><p>Item one</p></ScrollArea>)
  expect(screen.getByRole('region', {name:'Results'})).toHaveTextContent('Item one')
})
```

- [ ] Implement Grid with `repeat(auto-fit, minmax(min(100%, var(--ds-grid-min)), 1fr))`, `min-width: 0` on grid children; map numeric spacing to token names. Inline wraps; Stack preserves document order. ScrollArea owns local overflow and a keyboard-focusable named region, not global page clipping.
- [ ] Leave layout primitives free of product fetching, state, control styling and arbitrary breakpoint props. Keep custom values limited to sizing/composition.
- [ ] Run `npx vitest run src/components/design-system/basics/layout/Layout.test.tsx` and `npm run typecheck`; verify 320px container reflow in the A3 harness. Commit as `feat: add shared layout helpers`.

## A3 — Port buttons and prove standalone rendering

**Files:** Create `components/actions/AppButton.tsx`, `TextAction.tsx`, `actions.css`, `AppButton.test.tsx`; modify existing `atoms/AppButton.jsx`, `atoms/TextAction.jsx`, `src/styles/app-controls.css`; create `src/examples/consumer/index.html`, `main.tsx`, `App.tsx`, `vite.consumer.config.ts`, `playwright.config.ts`, `tests/browser/core.spec.ts`; modify package scripts/dev dependencies and public entries.

**Consumes:** A1 root/styles and A2 layout. **Produces:** Same AppButton variants and callbacks with typed native button/anchor support; standalone consumer at port 5181; `test:browser` and `dev:consumer` scripts.

- [ ] Port implementation with existing `primary/secondary/danger/quiet`, default/compact, iconOnly, busy and legacy `variant="icon"` behavior. Type the public button/anchor alternatives. Audit actual `as` callers before narrowing old compatibility behavior; adapters preserve any supported caller.
- [ ] Add a real disabled-anchor regression:

```tsx
import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {expect, test, vi} from 'vitest'
import {AppButton} from './AppButton'
test('busy links cannot activate their callback', async () => {
  const onClick = vi.fn()
  render(<AppButton as="a" href="#next" busy onClick={onClick}>Continue</AppButton>)
  await userEvent.click(screen.getByRole('link', {name:'Continue'}))
  expect(onClick).not.toHaveBeenCalled()
})
```

- [ ] Block navigation and callbacks for busy/disabled anchor activation; keep native disabled on buttons. Match disabled styling through both native and ARIA states. Preserve form type defaults, refs, accessible icon labels and busy text. Do not invent a loading timeout.
- [ ] Move button CSS out of app-controls into actions.css; compatibility selectors must not override the new canonical states. Remove only migrated rules after checking imports. Keep 4px lift, reset on press, visible focus and static reduced-motion feedback.
- [ ] Install compatible Playwright test tooling. Configure `testDir: './tests/browser'`, a Chromium consumer project with baseURL `http://127.0.0.1:5181`, and `webServer` for `npm run dev:consumer -- --host 127.0.0.1 --port 5181 --strictPort`. Configure `vite.consumer.config.ts` with root `src/examples/consumer/`, React plugin, filesystem access to the repository's `src/`, and output `dist-consumer/`. The dev script is `vite --config vite.consumer.config.ts`. Consumer imports only public index/styles, never global.css/design-system.css or `.bs-root`. Each browser test navigates to `/` before interaction.
- [ ] Browser test renders primary/default/disabled buttons, compares resolved accent/border/control height with tokens, clicks a real action, tabs to visible focus, checks 320px reflow and emulates reduced motion. Capture one portable control sheet baseline. Example assertion: `await expect(page.getByRole('button', {name:'Save'})).toHaveCSS('min-height', '48px')`.
- [ ] Run the new unit file, legacy AppButton tests, `npm run test:browser -- tests/browser/core.spec.ts`, typecheck and build. Commit as `refactor: make shared action controls portable`.

## A4 — Complete field and basic selection APIs

**Files:** Create `components/forms/Input.tsx`, `Textarea.tsx`, `FormField.tsx`, `Checkbox.tsx`, `RadioGroup.tsx`, `Switch.tsx`, `types.ts`, `forms.css`, `Forms.test.tsx`; convert old FormField/Switch paths to compatibility exports; modify consumer App and public entries. Export FieldControl and Choice from forms/types.ts and the public API.

**Consumes:** A1–A3. **Produces:** Native Input/Textarea props with no embedded validation policy; FormField retaining default-input and render-child modes; controlled Checkbox, RadioGroup and Switch.

```ts
type FieldControl = {
  id: string; describedBy?: string; invalid?: true
}
type Choice = {value: string; label: string; disabled?: boolean}
// Checkbox/Switch: label, checked, onChange(checked), disabled?, name?, value?.
// RadioGroup: label, name?, value, options: Choice[], onChange(value), disabled?.
// FormField: label, hint?, error?, id?, children?: (control: FieldControl) => ReactNode;
// default rendering continues to accept native input props.
```

- [ ] Write tests for label/control links, multiple generated IDs, hint/error descriptions, invalid forwarding to custom controls, native form values, radio arrow navigation, disabled controls and read-only text selection. Keep existing callbacks unchanged.
- [ ] Example failure case:

```tsx
render(<FormField label="Summary" error="Add a summary">
  {({id, describedBy, invalid}) => <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} />}
</FormField>)
expect(screen.getByRole('textbox', {name:'Summary'})).toHaveAccessibleDescription('Add a summary')
expect(screen.getByRole('textbox', {name:'Summary'})).toHaveAttribute('aria-invalid', 'true')
```

- [ ] Implement selection with native checkbox/radio semantics; keep Switch keyboard behavior and add form integration without duplicate values. Merge caller `aria-describedby` with field help/error IDs. Prefix/suffix composition must not replace the accessible label. Do not display errors on every keystroke by default: validation timing belongs to the caller.
- [ ] Add input/selection rows to the consumer sheet and verify long labels, help/error text, required/read-only and disabled states. Keep focus/lift space outside inputs.
- [ ] Run `npx vitest run src/components/design-system/components/forms/Forms.test.tsx`, existing AtomicContracts tests, browser core tests and typecheck. Commit as `feat: establish canonical fields and selection controls`.

## A5 — Share navigation and retain existing select/tabs

**Files:** Create `components/navigation/SidebarNav.tsx`, `Breadcrumbs.tsx`, `Pagination.tsx`, `SegmentedControl.tsx`, `navigation.css`, `Navigation.test.tsx`; create typed implementations `components/navigation/PillTabs.tsx`, `WorkflowSteps.tsx`, `components/forms/SelectMenu.tsx` with their owned CSS; modify old molecule files into compatibility exports and public entries.

**Consumes:** A2 layout, A3 actions, A4 fields. **Produces:** Navigation independent of router/product; existing select/tabs remain supported.

```ts
type NavItem = {id: string; label: string; href: string; disabled?: boolean}
// SidebarNav: label, items: NavItem[], currentId?, onNavigate?(event, item).
// Breadcrumbs: items: {label: string; href?: string}[]; final item is current.
// Pagination: page, pageCount, onChange(page); 1-based, bounded, hidden for zero pages.
// SegmentedControl: label, value, options: Choice[], onChange(value).
```

- [ ] Test actual links with `aria-current`, browser modifier-click preservation, disabled navigation, bounded pagination, exclusive segmented selection and distinct IDs for multiple tab groups. Retain SelectMenu's small-string-list contract for compatibility.
- [ ] Implement navigation links with native anchors; intercept only unmodified primary clicks when `onNavigate` is supplied. SegmentedControl uses a single-choice group; do not use tab roles without matching panels. Use unique generated IDs rather than the current default `tab` collision.
- [ ] Add this pagination contract test with Testing Library/userEvent:

```tsx
const change = vi.fn()
render(<Pagination page={1} pageCount={3} onChange={change} />)
expect(screen.getByRole('button', {name:'Previous page'})).toBeDisabled()
await userEvent.click(screen.getByRole('button', {name:'Next page'}))
expect(change).toHaveBeenCalledWith(2)
```

- [ ] Neutralize default “Campaign workflow” wording and other generic-component copy while preserving explicit caller labels. Remove ancestor requirements from moved styles.
- [ ] Run navigation tests plus existing AtomicContracts/DesignSystemScreen tests; confirm keyboard tabs/select behavior in browser. Commit as `feat: share navigation and selection building blocks`.

## A6 — Provide accessible details and overlay infrastructure

**Files:** Create `components/overlays/Dialog.tsx`, `Drawer.tsx`, `Popover.tsx`, `Tooltip.tsx`, `Menu.tsx`, `overlays.css`, `Overlays.test.tsx`; create `tests/browser/overlays.spec.ts`; update consumer sheet/public entries.

**Consumes:** Existing installed Radix package and A1–A5 controls. **Produces:** Styled overlay wrappers and a controlled Drawer suitable for mobile navigation/details.

```ts
// Dialog/Drawer: open, onOpenChange(open), title, description?, children,
// trigger?: ReactNode, returnFocusRef?: RefObject<HTMLElement | null>.
// Drawer adds side?: 'left' | 'right' | 'bottom'.
// Popover: trigger, open?, onOpenChange?, children.
// Tooltip: label, children (one focusable trigger).
type MenuItem = {id: string; label: string; disabled?: boolean; onSelect(): void}
// Menu: label, trigger, items: MenuItem[].
```

- [ ] Test controlled open/close and disabled menu actions; add browser tests for Escape, click-outside policy, focus containment, return focus and nested popover dismissal. Opening a second overlay must not close the wrong layer.
- [ ] Compose Radix Root/Trigger/Portal/Content/Title/Description/Close from `radix-ui`; preserve its keyboard and focus mechanisms. Put styles on the portal content itself so portals do not require a `.ds-root` ancestor. Share typography through CSS variables. Use a real close button with an accessible name.
- [ ] Browser test core sequence:

```ts
const opener = page.getByRole('button', {name:'Open details'})
await opener.click()
await expect(page.getByRole('dialog', {name:'Example details'})).toBeVisible()
await page.keyboard.press('Escape')
await expect(opener).toBeFocused()
```

- [ ] For modal initial focus, use the close control or first meaningful action; document destructive confirmation as C2. If the opener unmounts, use a supplied stable fallback. Do not forcibly focus a detached element.
- [ ] Run unit/browser overlay tests, then A-stage `typecheck`, existing suite, consumer browser tests and production build. Inspect desktop and narrow control sheets once. Commit as `feat: add shared overlay and drawer behavior`.

## Stage A completion

- [ ] Public components work with only public styles and DesignSystemRoot; portal controls work outside that root.
- [ ] Old import paths continue to render the same canonical implementation.
- [ ] No product data or workbench import is reachable from the public component graph.
- [ ] Record actual verification results before beginning Stage B; do not mark unchanged legacy entries Stable automatically.
