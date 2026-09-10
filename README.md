# Brutalist Design System

This repository is now a **design-system-only workspace**.

It keeps only the UI foundations and component blocks in `src/`:

- `src/components/design-system/` (atoms / molecules / organisms / templates / examples)
- `src/components/ui/` (shared UI primitives used by examples)
- `src/screens/` (design-system shell and catalog view)
- `src/styles/` and `src/lib/` utilities used by the design system

Everything else from the legacy product app has been removed.

## Getting started

```bash
npm install
npm run dev
```

Use this URL for the running app:

- `http://127.0.0.1:5177/design-system`

## Verification

- `npm run build`
- `npm run test:run`

If you want to run this as a reusable design-system package in the future,
keep the design system screen as the only route and add your consumer app
on top as a separate entrypoint.

## Tab

`Tab` is the horizontal pill-style category control used for Ads, Web,
Presentations, and Other. It includes a raised selected pill, keyboard focus,
disabled items, horizontal overflow on narrow screens, and reduced-motion styling.

```tsx
import { useState } from 'react'
import { DesignSystemRoot, Tab, TabPanel } from 'brutalist-design-system'
import 'brutalist-design-system/styles.css'

const items = [
  { value: 'ads', label: 'Ads' },
  { value: 'web', label: 'Web' },
  { value: 'presentations', label: 'Presentations' },
  { value: 'other', label: 'Other' },
]

export function TemplateCategories() {
  const [value, setValue] = useState('ads')
  return <DesignSystemRoot>
    <Tab items={items} value={value} onValueChange={setValue}
      ariaLabel="Template categories" idPrefix="template-categories" />
    {items.map(item => <TabPanel key={item.value} value={item.value}
      activeValue={value} idPrefix="template-categories">
      <p>{item.label} templates</p>
    </TabPanel>)}
  </DesignSystemRoot>
}
```

Use unique item values and a unique `idPrefix` for each tab group. Match the prefix
on every panel and keep one panel mounted per item. Selection belongs to the caller;
keep `value` set to an enabled item when updating the list. Labels may repeat or be
translated because relationships use values, not labels. `TabPanel` hides inactive
content without discarding its state.

Left/Right arrows wrap and activate tabs; Home/End select the first/last enabled
tab. Tab leaves the tablist after its single focus stop. Disabled items remain
visible and cannot be selected. Use this control for immediately available local
panels, links for navigation, and `SegmentedControl` for settings.

`Tabs` remains a compatibility wrapper with its original outer `className` placement;
`TabsProps` remains a type alias for `TabProps`. New consumers should use `Tab`,
whose `className` is applied directly to the tablist.
The catalog includes an interactive example under **Tabs and view controls**.
Run `npm run build:library`, `npm run verify:package`, and `npm run verify:consumer`
to validate the JavaScript, type declarations, stylesheet, and packed consumer.
