# Base UI Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Lingu Studio's hand-written select and dialog behavior with Base UI while preserving the existing visual design and component contracts.

**Architecture:** Add Base UI as the only runtime dependency and use its unstyled Select and Dialog primitives directly inside the existing feature components. Keep product state and callbacks in their current owners; Base UI owns focus, keyboard, dismissal, portal, and positioning behavior, while existing CSS classes retain the Lingu Studio appearance.

**Tech Stack:** React 19, Vite 8, plain CSS, `@base-ui-components/react`, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-09-03-base-ui-adoption-design.md`

## Global Constraints

- Base UI is the only new runtime dependency.
- Preserve the existing design tokens, class-based styling, responsive layout, and reduced-motion behavior.
- Preserve native `<select>` controls where custom presentation is unnecessary.
- Do not add Tailwind, global state, routes, or unrelated component abstractions.
- Each behavior change follows red-green-refactor and retains existing public props.

---

### Task 1: Base UI format selector

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/components/BannerWorkspace.jsx:1-370`
- Modify: `src/components/BannerWorkspace.test.jsx:60-120`
- Modify: `src/styles/app.css:1697-1764`

**Interfaces:**
- Consumes: `FormatSelect({ value: string, onChange: (value: string) => void })` and the existing `formatOptions` tuples.
- Produces: The same `FormatSelect` contract, rendered with `Select.Root`, `Select.Trigger`, `Select.Portal`, `Select.Positioner`, `Select.Popup`, and `Select.Item`.

- [ ] **Step 1: Write a failing typeahead test**

Extend the existing `uses an icon-led custom menu for every banner format` test with a distinct behavior test. The production change that makes this fail is removing Base UI's typeahead handling or reverting to the current manual listbox.

```jsx
test('supports typeahead selection in the format menu', async () => {
  const user = userEvent.setup()
  render(<BannerWorkspaceHarness />)

  const trigger = screen.getByRole('button', { name: 'Format: Vertical' })
  await user.click(trigger)
  await user.keyboard('s')
  await user.keyboard('{Enter}')

  expect(screen.getByRole('button', { name: 'Format: Square' })).toHaveFocus()
  expect(screen.getByTestId('banner-candidate')).toHaveAttribute('data-banner-id', 'banner-static-square')
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- --run src/components/BannerWorkspace.test.jsx -t "supports typeahead selection"
```

Expected: FAIL because the current manual listbox ignores printable-key typeahead and retains the Vertical format.

- [ ] **Step 3: Install Base UI**

Run:

```bash
npm install @base-ui-components/react
```

Verify that `@base-ui-components/react` is the only new direct dependency in `package.json`.

- [ ] **Step 4: Replace the manual listbox with Base UI Select**

Add the import and replace the state, refs, effects, and event handlers inside `FormatSelect` with this structure:

```jsx
import { Select } from '@base-ui-components/react/select'

function FormatSelect({ value, onChange }) {
  const selectedLabel = formatOptions.find(([optionValue]) => optionValue === value)?.[1] ?? formatOptions[0][1]

  return (
    <Select.Root value={value} onValueChange={onChange}>
      <div className="format-select">
        <Select.Trigger className="format-select__trigger" aria-label={`Format: ${selectedLabel}`}>
          <FormatIcon format={value} />
          <Select.Value>{selectedLabel}</Select.Value>
          <Select.Icon className="format-select__chevron"><ChevronDown size={15} aria-hidden="true" /></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner className="format-select__positioner" sideOffset={6} align="start">
            <Select.Popup className="format-select__menu" aria-label="Format options">
              {formatOptions.map(([optionValue, label]) => (
                <Select.Item className="format-select__option" key={optionValue} value={optionValue}>
                  <FormatIcon format={optionValue} />
                  <Select.ItemText>{label}</Select.ItemText>
                  <Select.ItemIndicator><Check size={15} aria-hidden="true" /></Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </div>
    </Select.Root>
  )
}
```

Confirm these public part names against `node_modules/@base-ui-components/react/select/index.d.ts` immediately after installation. Stop the task if the installed package does not expose this API; do not invent compatibility wrappers.

- [ ] **Step 5: Adapt existing CSS selectors**

Keep all dimensions and visual tokens. Move positional responsibility to the Base UI positioner and map interaction selectors:

```css
.format-select__positioner { z-index: 30; }
.format-select__trigger[data-popup-open] .format-select__chevron { transform: rotate(180deg); }
.format-select__menu { width: 188px; padding: 5px; margin: 0; }
.format-select__option[data-highlighted] { background: var(--surface-subtle); color: var(--ink); }
.format-select__option[data-selected] { color: var(--accent); }
```

Remove only the obsolete absolute positioning, `data-active`, and descendant-role selectors created by the manual implementation.

- [ ] **Step 6: Run the component tests and verify GREEN**

Run:

```bash
npm test -- --run src/components/BannerWorkspace.test.jsx
```

Expected: all BannerWorkspace tests PASS, including pointer selection, arrow navigation, Escape focus restoration, and the new typeahead test.

- [ ] **Step 7: Commit the selector migration**

```bash
git add package.json package-lock.json src/components/BannerWorkspace.jsx src/components/BannerWorkspace.test.jsx src/styles/app.css
git commit -m "refactor: adopt Base UI select"
```

---

### Task 2: Cost and banner-detail dialogs

**Files:**
- Modify: `src/components/CostDialog.jsx`
- Modify: `src/components/BannerWorkspace.jsx:180-242`
- Modify: `src/App.test.jsx:404-433`
- Modify: `src/components/BannerWorkspace.test.jsx:150-200`
- Modify: `src/styles/app.css:1345-1388`
- Modify: `src/styles/app.css:1838-1882`

**Interfaces:**
- Consumes: `CostDialog({ estimate, onCancel, onConfirm })` and `BannerDetailDialog({ candidate, template, visual, content, motion, onClose, onMotionChange, onReplayMotion })`.
- Produces: The same callback contracts using controlled-open `Dialog.Root` components.

- [ ] **Step 1: Write failing backdrop-dismissal tests**

In the existing cost-dialog test, remove the `HTMLDialogElement.prototype.showModal` spy and native `cancel` event, then assert real backdrop interaction:

```jsx
const dialog = screen.getByRole('dialog', { name: 'Confirm video generation cost' })
expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
await user.click(document.querySelector('.cost-dialog__backdrop'))
expect(bulkAction).toHaveFocus()
expect(screen.queryByRole('dialog', { name: 'Confirm video generation cost' })).not.toBeInTheDocument()
```

Add a banner-detail backdrop assertion after opening the detail dialog:

```jsx
await user.click(document.querySelector('.banner-detail-dialog__backdrop'))
expect(screen.queryByRole('dialog', { name: 'Banner detail preview' })).not.toBeInTheDocument()
expect(opener).toHaveFocus()
```

The production change that makes these tests fail is removing Base UI's backdrop/dismiss layer; the current native implementations do not render these interactive backdrops.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- --run src/App.test.jsx src/components/BannerWorkspace.test.jsx -t "cost|banner details"
```

Expected: FAIL because `.cost-dialog__backdrop` and `.banner-detail-dialog__backdrop` do not exist.

- [ ] **Step 3: Migrate CostDialog**

Replace `useEffect`, `useRef`, and native `<dialog>` with Base UI. Use a cancel-button ref as the popup's initial focus target:

```jsx
import { Dialog } from '@base-ui-components/react/dialog'
import { useRef } from 'react'

export function CostDialog({ estimate, onCancel, onConfirm }) {
  const cancelButtonRef = useRef(null)
  const imageLabel = `${estimate.count} eligible image${estimate.count === 1 ? '' : 's'}`
  const confirmLabel = `Generate ${estimate.count} video${estimate.count === 1 ? '' : 's'} for ${formatCurrency(estimate.totalCost)}`

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onCancel() }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="cost-dialog__backdrop" />
        <Dialog.Popup className="cost-dialog" initialFocus={cancelButtonRef}>
          <div className="cost-dialog__content">
            <header className="cost-dialog__header">
              <div className="cost-dialog__warning" aria-hidden="true">!</div>
              <div>
                <p className="cost-dialog__eyebrow">High-cost simulated generation</p>
                <Dialog.Title id="video-cost-title">Confirm video generation cost</Dialog.Title>
              </div>
            </header>
            <p>Each motion asset is locally simulated, but this estimate models the higher production cost before you continue.</p>
            <dl className="cost-dialog__estimate">
              <div><dt>Eligible images</dt><dd>{imageLabel}</dd></div>
              <div><dt>Unit cost</dt><dd>{formatCurrency(estimate.unitCost)} per video</dd></div>
              <div><dt>Total</dt><dd>{formatCurrency(estimate.totalCost)} total estimated cost</dd></div>
            </dl>
            <div className="cost-dialog__actions">
              <Dialog.Close ref={cancelButtonRef} className="button button--secondary">Cancel</Dialog.Close>
              <button type="button" className="button button--primary" onClick={onConfirm}>{confirmLabel}</button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

Confirm `initialFocus={cancelButtonRef}` against `node_modules/@base-ui-components/react/dialog/index.d.ts` before editing. Stop the task if the installed API is incompatible rather than guessing.

- [ ] **Step 4: Migrate BannerDetailDialog**

Use the same controlled root with the complete existing header, preview, metadata, and motion controls:

```jsx
<Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
  <Dialog.Portal>
    <Dialog.Backdrop className="banner-detail-dialog__backdrop" />
    <Dialog.Popup className="banner-detail-dialog" aria-label="Banner detail preview">
      <header className="banner-detail-dialog__header">
        <div><span>Banner detail</span><Dialog.Title>Preview &amp; motion</Dialog.Title></div>
        <Dialog.Close className="banner-detail-dialog__close" aria-label="Close banner preview"><X size={18} aria-hidden="true" /></Dialog.Close>
      </header>
      <div className="banner-detail">
        <div className="banner-detail__preview">
          <BannerPreview template={template} visual={visual} content={content} ratio={ratio} motionPreset={motion} motionVersion={motion.replayVersion} />
        </div>
        <div className="banner-detail__controls">
          <dl className="banner-detail__metadata">
            <DetailItem label="Template" value={candidate.templateName} />
            <DetailItem label="Dimensions" value={candidate.dimensions} />
            <DetailItem label="Format" value={candidate.format} />
            <DetailItem label="Platform" value={candidate.platform} />
            <DetailItem label="Media type" value={candidate.mediaType === 'video' ? 'Video' : 'Static'} />
            <DetailItem label="Source visual" value={visual?.name ?? 'Generated source visual'} />
          </dl>
          <div className="banner-motion-controls">
            <MotionSelect label="Text motion" channel="text" value={motion.text} onChange={(value) => onMotionChange(candidate.id, 'text', value)} />
            <MotionSelect label="Image motion" channel="image" value={motion.image} onChange={(value) => onMotionChange(candidate.id, 'image', value)} />
            <MotionSelect label="CTA motion" channel="cta" value={motion.cta} onChange={(value) => onMotionChange(candidate.id, 'cta', value)} />
            <button type="button" className="button button--secondary banner-motion-replay" onClick={() => onReplayMotion(candidate.id)}>Replay motion</button>
          </div>
        </div>
      </div>
    </Dialog.Popup>
  </Dialog.Portal>
</Dialog.Root>
```

Remove only the native-dialog refs, effects, and cancel handlers that Base UI replaces.

- [ ] **Step 5: Move backdrop styling to Base UI elements**

Replace native `::backdrop` rules with fixed backdrop classes:

```css
.cost-dialog__backdrop,
.banner-detail-dialog__backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(21, 30, 44, 0.42);
}

.cost-dialog,
.banner-detail-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 41;
  transform: translate(-50%, -50%);
}
```

Retain each popup's existing size, overflow, border, radius, surface, and shadow rules.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npm test -- --run src/App.test.jsx src/components/BannerWorkspace.test.jsx
```

Expected: all tests PASS with cost confirmation, cancel, banner motion controls, dismissal, and focus restoration intact.

- [ ] **Step 7: Commit the dialog migration**

```bash
git add src/components/CostDialog.jsx src/components/BannerWorkspace.jsx src/App.test.jsx src/components/BannerWorkspace.test.jsx src/styles/app.css
git commit -m "refactor: adopt Base UI dialogs"
```

---

### Task 3: Asset-preview dialog and complete verification

**Files:**
- Modify: `src/components/AssetWorkspace.jsx:250-270`
- Modify: `src/App.test.jsx`
- Modify: `src/styles/app.css:987-991`

**Interfaces:**
- Consumes: existing `previewAsset` state and `setPreviewAsset` setter inside `AssetWorkspace`.
- Produces: a Base UI asset-preview dialog with the existing accessible name, artwork, name, media label, and close action.

- [ ] **Step 1: Write a failing Escape-and-focus test**

Extend the existing asset preview flow in `App.test.jsx`:

```jsx
const previewTrigger = screen.getByRole('button', { name: /Preview image/ })
await user.click(previewTrigger)
expect(screen.getByRole('dialog', { name: 'Asset preview' })).toBeVisible()
await user.keyboard('{Escape}')
expect(screen.queryByRole('dialog', { name: 'Asset preview' })).not.toBeInTheDocument()
expect(previewTrigger).toHaveFocus()
```

Use the exact accessible name already exposed by the relevant preview trigger. The production change that makes this fail is removing Base UI dismissal/focus restoration; the current non-modal `open` dialog does not implement that contract.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- --run src/App.test.jsx -t "asset preview"
```

Expected: FAIL because Escape does not close the current always-open native dialog and restore trigger focus.

- [ ] **Step 3: Replace the asset native dialog**

Import `Dialog` and replace the inline native dialog with:

```jsx
{previewAsset && (
  <Dialog.Root open onOpenChange={(open) => { if (!open) setPreviewAsset(null) }}>
    <Dialog.Portal>
      <Dialog.Backdrop className="asset-preview-dialog__backdrop" />
      <Dialog.Popup className="asset-preview-dialog" aria-label="Asset preview">
        <div className="asset-preview-dialog__content">
          <Dialog.Close className="asset-preview-dialog__close" aria-label="Close preview"><X size={18} aria-hidden="true" /></Dialog.Close>
          <div className="asset-preview-dialog__art"><VisualArtwork visual={previewAsset} /></div>
          <strong>{previewAsset.name}</strong>
          <span>{previewAsset.mediaType === 'video' ? 'Video preview' : 'Static visual preview'}</span>
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
)}
```

- [ ] **Step 4: Split popup and backdrop styling**

```css
.asset-preview-dialog__backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(21, 30, 44, 0.46);
}
.asset-preview-dialog {
  position: fixed;
  inset: 0;
  z-index: 41;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  padding: 24px;
  border: 0;
  background: transparent;
}
```

Preserve the existing content-card and artwork rules.

- [ ] **Step 5: Run the full test suite**

Run:

```bash
npm test -- --run
```

Expected: the complete Vitest suite PASS with no new warnings.

- [ ] **Step 6: Run the production build**

Run:

```bash
npm run build
```

Expected: Vite exits successfully and writes the static site to `dist`.

- [ ] **Step 7: Commit the asset dialog and verification state**

```bash
git add src/components/AssetWorkspace.jsx src/App.test.jsx src/styles/app.css
git commit -m "refactor: standardize asset preview dialog"
```

- [ ] **Step 8: Publish the verified static build**

Use the existing Sites project in `.openai/hosting.json` and the `sites-hosting` workflow to save and deploy the verified `dist` output. Do not alter the hosting project ID or static directory.
