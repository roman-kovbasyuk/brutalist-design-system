# Banner Studio shadcn MVP Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace only the `/mvp` frontend with a real shadcn/ui shell, ChatGPT-like campaign sidebar, free-form campaign brief, and responsive editable copy table while preserving the existing workflow and gateway boundary.

**Architecture:** shadcn component source lives under `src/components/ui/` and is styled by a route-owned Tailwind v4 stylesheet that omits global Preflight. `/mvp` is lazy-loaded so the existing application does not import the new UI bundle eagerly. Campaign state remains authoritative in pure workflow rules and the asynchronous gateway; React components emit actions rather than assigning statuses.

**Tech Stack:** React 19, Vite 8, JavaScript, Tailwind CSS 4, shadcn/ui, Radix UI primitives, Zod, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-04-mvp-shadcn-freeform-copy-table-design.md`

## Global Constraints

- Change `/mvp` only; do not migrate existing screens or their CSS.
- Use repository-owned components generated from shadcn/ui, not a look-alike custom component set.
- Use a white, near-black, and neutral-grey visual system with one-pixel borders, compact spacing, small radii, and no decorative gradients or shadows.
- Keep the mock-provider label visible.
- Keep the existing canonical workflow states, asynchronous gateway, local persistence, and idempotency rules.
- `brief.text` is the only required user input; structured brief fields are optional derived data.
- Selecting a copy row atomically persists its current values and selects it.
- Desktop uses a table; mobile uses stacked row groups with identical behavior.
- Preserve all unrelated dirty-worktree changes.
- Use test-driven development for every behavior change.

---

### Task 1: Isolated shadcn/ui foundation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.js`
- Modify: `src/App.jsx`
- Create: `jsconfig.json`
- Create: `components.json`
- Create: `src/styles/shadcn.css`
- Create: `src/lib/utils.js`
- Create: `src/components/ui/button.jsx`
- Create: `src/components/ui/input.jsx`
- Create: `src/components/ui/textarea.jsx`
- Create: `src/components/ui/table.jsx`
- Create: `src/components/ui/radio-group.jsx`
- Create: `src/components/ui/badge.jsx`
- Create: `src/components/ui/alert.jsx`
- Create: `src/components/ui/separator.jsx`
- Create: `src/components/ui/scroll-area.jsx`
- Create: `src/components/ui/sheet.jsx`
- Create: `src/components/ui/tooltip.jsx`
- Create: `src/components/ui/sidebar.jsx`
- Create: `src/hooks/use-mobile.js`
- Test: `src/components/ui/button.test.jsx`
- Test: `src/App.test.jsx`

**Interfaces:**
- Produces: `cn(...inputs)` from `src/lib/utils.js`.
- Produces: standard shadcn named exports from each `src/components/ui/*.jsx` module.
- Produces: a lazy `/mvp` route whose CSS is owned by `MvpApp`.
- Consumes: no MVP domain modules.

- [ ] **Step 1: Write a failing shadcn primitive test**

Add `src/components/ui/button.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { Button } from './button.jsx'

describe('shadcn Button', () => {
  test('renders the repository-owned shadcn primitive', () => {
    render(<Button>New campaign</Button>)
    expect(screen.getByRole('button', { name: 'New campaign' })).toHaveAttribute('data-slot', 'button')
  })
})
```

- [ ] **Step 2: Run the primitive test and verify RED**

Run: `npm test -- --run src/components/ui/button.test.jsx`

Expected: FAIL because `src/components/ui/button.jsx` does not exist.

- [ ] **Step 3: Configure Vite, aliases, Tailwind, and shadcn**

Install the build dependencies:

```bash
npm install tailwindcss @tailwindcss/vite tw-animate-css class-variance-authority clsx tailwind-merge
```

Create `jsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Add the Vite plugin and alias in `vite.config.js`:

```js
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
```

Create `components.json` with JavaScript output and neutral tokens:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": false,
  "tailwind": {
    "config": "",
    "css": "src/styles/shadcn.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

Create `src/styles/shadcn.css` without Tailwind Preflight so the legacy app keeps its current base styles:

```css
@layer theme, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --radius-sm: calc(var(--radius) - 2px);
  --radius-md: var(--radius);
  --radius-lg: calc(var(--radius) + 2px);
}

.mvp-root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.145 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.55 0 0);
  --radius: 0.375rem;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.145 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.955 0 0);
  --sidebar-accent-foreground: oklch(0.145 0 0);
  --sidebar-border: oklch(0.91 0 0);
  --sidebar-ring: oklch(0.55 0 0);
  min-height: 100svh;
  background: var(--background);
  color: var(--foreground);
}

.mvp-root *,
.mvp-root *::before,
.mvp-root *::after { border-color: var(--border); }
```

- [ ] **Step 4: Generate the official shadcn component source**

Run:

```bash
npx shadcn@latest add button input textarea table radio-group badge alert separator scroll-area sheet tooltip sidebar -y
```

Inspect the generated files and keep their `data-slot` attributes and public exports unchanged. Do not hand-replace them with custom look-alikes.

- [ ] **Step 5: Lazy-load `/mvp` and import its route-owned CSS**

Change `src/App.jsx` to load the named export safely:

```jsx
import { lazy, Suspense, useEffect, useState } from 'react'

const MvpApp = lazy(() => import('./mvp/MvpApp.jsx').then((module) => ({ default: module.MvpApp })))

// Inside App, after hooks are declared:
if (route.view === 'mvp') {
  return (
    <Suspense fallback={<div role="status">Loading Banner Studio…</div>}>
      <MvpApp />
    </Suspense>
  )
}
```

Import `../styles/shadcn.css` from `src/mvp/MvpApp.jsx` before `./mvp.css` and give the route root the `mvp-root` class.

- [ ] **Step 6: Verify the foundation GREEN and legacy route isolation**

Run:

```bash
npm test -- --run src/components/ui/button.test.jsx src/App.test.jsx src/mvp/MvpApp.test.jsx
npm run build
```

Expected: all selected tests pass; both application and VitePress builds exit 0.

- [ ] **Step 7: Commit the shadcn foundation**

```bash
git add package.json package-lock.json vite.config.js jsconfig.json components.json src/App.jsx src/lib src/hooks src/components/ui src/styles/shadcn.css src/mvp/MvpApp.jsx
git commit -m "feat: add isolated shadcn MVP foundation"
```

---

### Task 2: Free-form brief contract and persisted-data migration

**Files:**
- Modify: `src/mvp/contracts.js`
- Modify: `src/mvp/contracts.test.js`
- Create: `src/mvp/migrations.js`
- Create: `src/mvp/migrations.test.js`
- Modify: `src/mvp/fixtures.js`
- Modify: `src/mvp/mockCampaignGateway.js`
- Modify: `src/mvp/mockCampaignGateway.test.js`
- Modify: `src/mvp/workflowRules.js`
- Modify: `src/mvp/workflowRules.test.js`

**Interfaces:**
- Produces: `briefSchema` with `{ text, product, audience, goal, offer }`.
- Produces: `migrateStoredCampaign(value)` that converts the previously persisted structured brief into the new shape.
- Produces: `createMockCopySet({ campaign, now, id })` using `campaign.brief.text`.
- Extends: `select_copy` input to accept `{ copyId, copy }` and persist the supplied candidate atomically.

- [ ] **Step 1: Write failing contract and migration tests**

Add these behaviors:

```js
test('accepts a draft with one free-form brief field', () => {
  const parsed = campaignSchema.parse(createCampaign({
    brief: { text: 'Launch an Oslo course for new arrivals.', product: '', audience: '', goal: '', offer: '' },
  }))
  expect(parsed.brief.text).toBe('Launch an Oslo course for new arrivals.')
})

test('migrates a persisted structured brief into readable free-form text', () => {
  const migrated = migrateStoredCampaign(createLegacyCampaign())
  expect(migrated.brief.text).toContain('Product: Norwegian course')
  expect(migrated.brief.text).toContain('Audience: New arrivals')
})
```

- [ ] **Step 2: Run the contract and migration tests and verify RED**

Run: `npm test -- --run src/mvp/contracts.test.js src/mvp/migrations.test.js`

Expected: FAIL because `brief.text` and `migrations.js` do not exist.

- [ ] **Step 3: Implement the new schema and deterministic migration**

Use this exact brief schema:

```js
export const briefSchema = z.object({
  text: z.string(),
  product: z.string(),
  audience: z.string(),
  goal: z.string(),
  offer: z.string(),
})
```

Implement `migrateStoredCampaign` without mutating its input:

```js
export function migrateStoredCampaign(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  if (!value.brief || typeof value.brief !== 'object' || Array.isArray(value.brief)) return value
  if (typeof value.brief.text === 'string') return value

  const labels = [
    ['Product', value.brief.product],
    ['Audience', value.brief.audience],
    ['Goal', value.brief.goal],
    ['Offer', value.brief.offer],
    ['Notes', value.brief.notes],
  ]
  const text = labels
    .filter(([, fieldValue]) => typeof fieldValue === 'string' && fieldValue.trim())
    .map(([label, fieldValue]) => `${label}: ${fieldValue.trim()}`)
    .join('\n')

  return {
    ...value,
    brief: {
      text,
      product: typeof value.brief.product === 'string' ? value.brief.product : '',
      audience: typeof value.brief.audience === 'string' ? value.brief.audience : '',
      goal: typeof value.brief.goal === 'string' ? value.brief.goal : '',
      offer: typeof value.brief.offer === 'string' ? value.brief.offer : '',
    },
  }
}
```

Call `migrateStoredCampaign` before `campaignSchema.safeParse` in `readState`.

- [ ] **Step 4: Write failing atomic-selection and text-generation tests**

```js
test('selecting a copy atomically persists its edited values', () => {
  const selected = transitionCampaign(generated, 'select_copy', marketer, {
    copyId: 'copy-2',
    copy: { headline: 'Move with confidence', body: 'Practical language.', offer: '15% off', cta: 'Start now' },
  })
  expect(selected.selectedCopyId).toBe('copy-2')
  expect(selected.copySets[0].candidates[1].headline).toBe('Move with confidence')
})

test('mock copy generation uses the free-form brief', () => {
  const copySet = createMockCopySet({ campaign: freeFormCampaign, now, id })
  expect(copySet.candidates).toHaveLength(3)
  expect(copySet.candidates[0].body).toContain('Oslo')
})
```

- [ ] **Step 5: Run the new workflow tests and verify RED**

Run: `npm test -- --run src/mvp/workflowRules.test.js src/mvp/mockCampaignGateway.test.js`

Expected: FAIL because selection ignores `input.copy` and fixtures still require structured input.

- [ ] **Step 6: Implement fixtures, mock generation, and atomic selection**

Update `createDraftCampaignFixture`:

```js
brief: { text: '', product: '', audience: '', goal: '', offer: '' },
```

In `select_copy`, parse and assign the supplied copy before selecting it:

```js
if (action === 'select_copy') {
  const candidate = findCopy(next, input.copyId)
  if (!candidate) throw new Error('copy_not_found')
  if (input.copy) {
    Object.assign(candidate, copyCandidateSchema.parse({ ...candidate, ...input.copy, id: candidate.id }))
  }
  next.selectedCopyId = candidate.id
  next.status = 'copy_ready'
  next.selectedDirectionId = null
  next.composition = null
}
```

Generate deterministic mock copy from the first sentence or first 120 characters of `brief.text`; retain three stable headline/CTA patterns and do not invent structured campaign facts.

- [ ] **Step 7: Verify Task 2 GREEN and commit**

Run:

```bash
npm test -- --run src/mvp/contracts.test.js src/mvp/migrations.test.js src/mvp/workflowRules.test.js src/mvp/mockCampaignGateway.test.js
```

Then commit:

```bash
git add src/mvp/contracts.js src/mvp/contracts.test.js src/mvp/migrations.js src/mvp/migrations.test.js src/mvp/fixtures.js src/mvp/mockCampaignGateway.js src/mvp/mockCampaignGateway.test.js src/mvp/workflowRules.js src/mvp/workflowRules.test.js
git commit -m "feat: add free-form MVP brief contract"
```

---

### Task 3: ChatGPT-like shadcn campaign sidebar and shell

**Files:**
- Create: `src/mvp/CampaignSidebar.jsx`
- Create: `src/mvp/CampaignSidebar.test.jsx`
- Modify: `src/mvp/MvpShell.jsx`
- Modify: `src/mvp/MvpShell.test.jsx`
- Modify: `src/mvp/mvp.css`

**Interfaces:**
- Produces: `CampaignSidebar({ campaigns, activeCampaign, actor, onSelectCampaign, onCreateCampaign })`.
- Consumes: shadcn `Sidebar*`, `Button`, `Badge`, `Separator`, `Tooltip` primitives.
- Preserves: `MvpShell` public props used by `MvpApp`.

- [ ] **Step 1: Write failing sidebar behavior tests**

```jsx
test('shows new campaign, recent campaigns, active state, and user footer', () => {
  render(<ShellHarness />)
  expect(screen.getByRole('button', { name: 'New campaign' })).toBeVisible()
  expect(screen.getByText('Recent campaigns')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Autumn launch' })).toHaveAttribute('data-active', 'true')
  expect(screen.getByText('Maya Chen')).toBeVisible()
  expect(screen.getByText('Marketer')).toBeVisible()
})

test('selects a campaign from the sidebar', async () => {
  const user = userEvent.setup()
  const onSelectCampaign = vi.fn()
  render(<ShellHarness onSelectCampaign={onSelectCampaign} />)
  await user.click(screen.getByRole('button', { name: 'Winter launch' }))
  expect(onSelectCampaign).toHaveBeenCalledWith('campaign-winter')
})
```

Set `window.matchMedia` to the mobile query in a separate test, open the sidebar trigger, choose a campaign, and assert the mobile sheet content closes after selection.

- [ ] **Step 2: Run the sidebar tests and verify RED**

Run: `npm test -- --run src/mvp/CampaignSidebar.test.jsx src/mvp/MvpShell.test.jsx`

Expected: FAIL because `CampaignSidebar.jsx` does not exist and the old shell lacks the required navigation.

- [ ] **Step 3: Implement CampaignSidebar from shadcn composition**

Use this structure:

```jsx
<Sidebar collapsible="icon" variant="sidebar">
  <SidebarHeader>{/* Banner Studio + SidebarTrigger */}</SidebarHeader>
  <SidebarContent>
    <SidebarGroup>
      <Button onClick={onCreateCampaign}><Plus />New campaign</Button>
    </SidebarGroup>
    <SidebarSeparator />
    <SidebarGroup>
      <SidebarGroupLabel>Recent campaigns</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>{/* campaign buttons with isActive */}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  </SidebarContent>
  <SidebarFooter>{/* actor name + role */}</SidebarFooter>
  <SidebarRail />
</Sidebar>
```

Use `SidebarMenuButton`'s `isActive` prop and also set `data-active="true"` for the testable public state. Put full campaign names in `aria-label` and `title`; truncate visible text.

Inside `CampaignSidebar`, call `useSidebar()`. When a campaign is selected, invoke `onSelectCampaign(campaignId)` and then call `setOpenMobile(false)` when `isMobile` is true. Supply the full campaign name through the `tooltip` prop so the collapsed icon rail remains understandable.

- [ ] **Step 4: Recompose MvpShell and replace legacy shell styling**

Wrap the shell with `TooltipProvider` and `SidebarProvider`, then use `SidebarInset` for the workspace. Keep the provider badge, phase navigation, and version summary. The main content layout is:

```jsx
<div className="mvp-root">
  <TooltipProvider>
    <SidebarProvider>
      <CampaignSidebar {...sidebarProps} />
      <SidebarInset>
        <header>{/* mobile/desktop trigger, campaign title, provider badge */}</header>
        <nav aria-label="Campaign phases">...</nav>
        <div className="mvp-content-grid">
          <main>{children}</main>
          <aside aria-label="Version summary">...</aside>
        </div>
      </SidebarInset>
    </SidebarProvider>
  </TooltipProvider>
</div>
```

Set the sidebar widths through provider variables: `--sidebar-width: 17rem` and `--sidebar-width-icon: 3.5rem`. Use neutral fills, one-pixel borders, radius no larger than `0.5rem`, and no box shadow.

- [ ] **Step 5: Verify Task 3 GREEN and commit**

Run:

```bash
npm test -- --run src/mvp/CampaignSidebar.test.jsx src/mvp/MvpShell.test.jsx src/mvp/MvpApp.test.jsx
```

Then commit:

```bash
git add src/mvp/CampaignSidebar.jsx src/mvp/CampaignSidebar.test.jsx src/mvp/MvpShell.jsx src/mvp/MvpShell.test.jsx src/mvp/mvp.css
git commit -m "feat: add shadcn campaign sidebar"
```

---

### Task 4: Free-form BriefStage

**Files:**
- Modify: `src/mvp/stages/BriefStage.jsx`
- Modify: `src/mvp/stages/BriefStage.test.jsx`
- Modify: `src/mvp/MvpApp.jsx`
- Modify: `src/mvp/MvpApp.test.jsx`

**Interfaces:**
- `BriefStage` emits `onSave({ text, product: '', audience: '', goal: '', offer: '' })`.
- `MvpApp` treats `campaign.brief.text.trim()` as the copy-stage gate.
- Consumes: shadcn `Textarea`, `Button`, `Alert`.

- [ ] **Step 1: Replace the structured-form tests with failing free-form tests**

```jsx
test('requires one free-form campaign brief before analysis', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn()
  render(<BriefStage campaign={campaign()} pendingAction="" onSave={onSave} />)
  expect(screen.getByRole('button', { name: 'Analyze brief' })).toBeDisabled()
  await user.type(screen.getByLabelText('Campaign brief'), 'Launch an Oslo course for new arrivals.')
  expect(screen.getByText('39 characters')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Analyze brief' })).toBeEnabled()
})

test('submits the canonical free-form brief shape', async () => {
  // type text, click Analyze brief
  expect(onSave).toHaveBeenCalledWith({
    text: 'Launch an Oslo course for new arrivals.',
    product: '', audience: '', goal: '', offer: '',
  })
})
```

Keep the existing downstream-reset warning test and update its button copy.

- [ ] **Step 2: Run BriefStage tests and verify RED**

Run: `npm test -- --run src/mvp/stages/BriefStage.test.jsx src/mvp/MvpApp.test.jsx`

Expected: FAIL because the UI still renders five structured controls and `MvpApp` gates on three structured fields.

- [ ] **Step 3: Implement the free-form stage**

Use controlled text state reset by campaign ID or persisted text. Render one shadcn `Textarea` with `rows={8}`, a live character counter using `text.length`, an example hint, and a shadcn `Button` labelled **Analyze brief**. Keep the reset warning in a shadcn `Alert`.

Update the app gate:

```js
const briefComplete = Boolean(activeCampaign?.brief.text.trim())
```

Preserve the gateway action:

```jsx
onSave={(brief) => performAction('save_brief', { brief })}
```

- [ ] **Step 4: Verify Task 4 GREEN and commit**

Run:

```bash
npm test -- --run src/mvp/stages/BriefStage.test.jsx src/mvp/MvpApp.test.jsx src/mvp/workflowRules.test.js
```

Then commit:

```bash
git add src/mvp/stages/BriefStage.jsx src/mvp/stages/BriefStage.test.jsx src/mvp/MvpApp.jsx src/mvp/MvpApp.test.jsx
git commit -m "feat: add free-form campaign brief"
```

---

### Task 5: Responsive editable copy table

**Files:**
- Create: `src/mvp/stages/CopyRowFields.jsx`
- Create: `src/mvp/stages/CopyRowFields.test.jsx`
- Modify: `src/mvp/stages/CopyStage.jsx`
- Modify: `src/mvp/stages/CopyStage.test.jsx`
- Modify: `src/mvp/MvpApp.jsx`
- Modify: `src/mvp/mvp.css`

**Interfaces:**
- Produces: `CopyRowFields({ candidate, optionNumber, layout, disabled, onChange })`, where `layout` is `table` or `stacked` and `onChange(field, value)` updates controlled row state.
- `CopyStage` emits `onSelect(copyId, copy)` and `onEdit(copyId, copy)`.
- `MvpApp` maps selection to `select_copy` with `{ copyId, copy }`.
- Consumes: shadcn `Table*`, `Input`, `Textarea`, `RadioGroup`, `RadioGroupItem`, `Button`, `Badge`.

- [ ] **Step 1: Write failing table-semantics and controlled-edit tests**

```jsx
test('renders generated copy in a five-column table', () => {
  render(<CopyStageHarness />)
  const table = screen.getByRole('table', { name: 'Generated copy options' })
  expect(within(table).getByRole('columnheader', { name: 'Select' })).toBeVisible()
  expect(within(table).getByRole('columnheader', { name: 'Headline' })).toBeVisible()
  expect(within(table).getByRole('columnheader', { name: 'Body' })).toBeVisible()
  expect(within(table).getByRole('columnheader', { name: 'Offer' })).toBeVisible()
  expect(within(table).getByRole('columnheader', { name: 'CTA' })).toBeVisible()
})

test('atomically sends edited row values when selected', async () => {
  const user = userEvent.setup()
  const onSelect = vi.fn()
  render(<CopyStageHarness onSelect={onSelect} />)
  await user.clear(screen.getByLabelText('Headline for option 2'))
  await user.type(screen.getByLabelText('Headline for option 2'), 'Move with confidence')
  await user.click(screen.getByRole('radio', { name: 'Select option 2' }))
  expect(onSelect).toHaveBeenCalledWith('copy-2', expect.objectContaining({ headline: 'Move with confidence' }))
})

test('renders labelled stacked row groups for mobile CSS', () => {
  render(<CopyStageHarness />)
  expect(screen.getByTestId('copy-mobile-list')).toBeInTheDocument()
  expect(within(screen.getByTestId('copy-mobile-list')).getAllByRole('group')).toHaveLength(3)
})
```

- [ ] **Step 2: Run CopyStage tests and verify RED**

Run: `npm test -- --run src/mvp/stages/CopyRowFields.test.jsx src/mvp/stages/CopyStage.test.jsx`

Expected: FAIL because `CopyRowFields.jsx` and the table do not exist.

- [ ] **Step 3: Implement shared controlled row fields**

Define field metadata once:

```js
const fields = [
  { key: 'headline', label: 'Headline', multiline: false },
  { key: 'body', label: 'Body', multiline: true },
  { key: 'offer', label: 'Offer', multiline: false },
  { key: 'cta', label: 'CTA', multiline: false },
]
```

For `layout="table"`, return a fragment of four `TableCell` elements. For `layout="stacked"`, return four labelled field wrappers. Use `Input` for single-line fields and `Textarea rows={3}` for body. Every accessible label includes the one-based option number supplied as `optionNumber`.

- [ ] **Step 4: Implement CopyStage table, mobile groups, and atomic selection**

Maintain drafts by candidate ID:

```js
const [drafts, setDrafts] = useState(() => Object.fromEntries(candidates.map((item) => [item.id, item])))

function updateCandidate(copyId, field, value) {
  setDrafts((current) => ({
    ...current,
    [copyId]: { ...current[copyId], [field]: value },
  }))
}
```

Reset drafts only when the latest copy-set ID changes. Render one desktop `Table` inside a `hidden md:block` wrapper and one mobile list inside an `md:hidden` wrapper. Both representations use the same `drafts` object and handlers.

When a row radio changes:

```js
function selectCandidate(copyId) {
  const copy = drafts[copyId]
  if (!copy.headline.trim() || !copy.cta.trim() || busy) return
  onSelect(copyId, copy)
}
```

Show validation text beside a row with an empty headline or CTA. Keep **Save copy changes** for the selected row and pass its current draft to `onEdit`.

Update `MvpApp`:

```jsx
onSelect={(copyId, copy) => performAction('select_copy', { copyId, copy })}
```

- [ ] **Step 5: Verify Task 5 GREEN and commit**

Run:

```bash
npm test -- --run src/mvp/stages/CopyRowFields.test.jsx src/mvp/stages/CopyStage.test.jsx src/mvp/MvpApp.test.jsx src/mvp/workflowRules.test.js
```

Then commit:

```bash
git add src/mvp/stages/CopyRowFields.jsx src/mvp/stages/CopyRowFields.test.jsx src/mvp/stages/CopyStage.jsx src/mvp/stages/CopyStage.test.jsx src/mvp/MvpApp.jsx src/mvp/mvp.css
git commit -m "feat: add responsive copy table"
```

---

### Task 6: Integrated frontend verification and review checkpoint

**Files:**
- Modify: `docs/superpowers/plans/2026-09-04-mvp-shadcn-freeform-copy-table.md`
- Modify only if a verified defect requires it: files changed in Tasks 1–5

**Interfaces:**
- Consumes: the complete `/mvp` route.
- Produces: a reviewable local build with documented automated and visual evidence.

- [ ] **Step 1: Run the complete MVP and primitive test suites**

Run:

```bash
npm test -- --run src/mvp src/components/ui src/App.test.jsx
```

Expected: every selected test file passes with zero failures.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: Vite application and VitePress documentation builds both exit 0.

- [ ] **Step 3: Perform one bounded browser QA pass**

Run the local server:

```bash
npm run dev -- --host 127.0.0.1
```

Verify once at desktop and once at a mobile viewport:

- desktop sidebar expands and collapses without covering the workspace;
- active and long campaign names remain readable;
- provider badge and phase rail remain visible;
- one free-form brief unlocks copy generation;
- generated copy uses a true desktop table;
- editing then selecting a row persists the edited values;
- mobile opens the sidebar as an overlay and shows stacked copy groups;
- no horizontal page overflow or console error occurs.

Fix all defects found in one batch, rerun the affected tests and build once, then stop polishing.

- [ ] **Step 4: Mark the plan complete and commit verification notes**

Check the completed boxes in this plan and commit only the plan update plus any verified fixes:

```bash
git add docs/superpowers/plans/2026-09-04-mvp-shadcn-freeform-copy-table.md
git commit -m "docs: complete shadcn MVP review checkpoint"
```

- [ ] **Step 5: Present the modular review boundary**

Report the local `/mvp` URL, commit IDs, exact test totals, build result, and the intentionally deferred backend integrations. Do not begin visual directions or backend work until the user reviews this frontend checkpoint.
