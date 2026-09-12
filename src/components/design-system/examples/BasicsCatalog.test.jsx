import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import ApplicationDesignSystemPage from '../../../screens/ApplicationDesignSystemPage.jsx'
import { basicsManifest } from './BasicsCatalog.jsx'

const componentCopy = reference => `Use this component ${reference} from the app design system (brutalist design system)`

// Vitest stubs CSS imports; this reference deliberately consumes the stylesheet as data.
vi.mock('../basics/tokens.css?raw', async () => {
  const { readFileSync } = await import('node:fs')
  return { default: readFileSync('src/components/design-system/basics/tokens.css', 'utf8') }
})

beforeEach(() => history.replaceState({}, '', '/design-system?section=basics'))

test('shows the complete Basics catalog through the existing shell, including old workbench links', () => {
  history.replaceState({}, '', '/?mode=workbench&section=basics&family=elevation')
  render(<ApplicationDesignSystemPage />)
  expect(screen.getByRole('heading', { name: 'Basics' })).toBeVisible()
  for (const name of ['Color', 'Typography', 'Spacing', 'Shape & sizing', 'Elevation', 'Motion', 'Layout', 'Icons (Lucide Icons)']) {
    expect(screen.getByRole('heading', { name, exact: true })).toBeVisible()
  }
  expect(screen.getByText('H7')).toBeVisible()
  expect(screen.getByRole('main').closest('.application-design-system')).toBeInTheDocument()
  expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  expect(screen.queryByText(/ready for its first/)).not.toBeInTheDocument()
})

test('uses the supplied explanatory copy for the annotated typography roles', () => {
  render(<ApplicationDesignSystemPage />)
  const copy = 'Applicable practically for any use case, where you have repetitive similar design templates and tasks. We ensure control quality on both generation and tweaking phases'

  for (const key of ['lead-large', 'lead-medium', 'body', 'small']) {
    expect(screen.getByRole('button', { name: `Copy ${key} typography`, exact: true })).toHaveTextContent(copy)
  }
  expect(screen.getByRole('button', { name: 'Copy h1 typography', exact: true })).toHaveTextContent('Avenir')
})

test('explains that elevation is reserved for wrapper panels and icon tiles', () => {
  render(<ApplicationDesignSystemPage />)
  expect(screen.getByText('Elevation is reserved for wrapper panels; icon tiles retain lift to signal interaction.')).toBeVisible()
})

test('searches actual specimens by token, copies the exact ID, and clears search with Escape', async () => {
  const user = userEvent.setup()
  render(<ApplicationDesignSystemPage />)
  await user.click(screen.getByRole('button', { name: 'Search library' }))
  const search = screen.getByPlaceholderText('Find a name or token')
  expect(search).toHaveFocus()
  await user.type(search, '--v2-shadow-interactive')
  expect(screen.queryByRole('heading', { name: 'Color' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Copy --v2-shadow-interactive', exact: true }))
  expect(await navigator.clipboard.readText()).toBe('--v2-shadow-interactive')
  expect(screen.getByText('Copied')).toBeVisible()
  await user.click(search)
  await user.clear(search)
  await user.type(search, 'nonexistent-foundation')
  expect(screen.getByRole('status')).toHaveTextContent('No matches')
  await user.keyboard('{Escape}')
  expect(screen.getByRole('heading', { name: 'Color' })).toBeVisible()
})

test('uses the shared Sidebar search button behavior for the library index', async () => {
  const user = userEvent.setup()
  render(<ApplicationDesignSystemPage />)

  const trigger = screen.getByRole('button', { name: 'Search library' })
  expect(trigger).toHaveClass('ds-button', 'ds-button--secondary', 'ds-button--icon')
  expect(trigger).toHaveAttribute('data-size', 'small')

  await user.click(trigger)
  const search = screen.getByRole('searchbox', { name: 'Search components' })
  expect(search).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('searchbox', { name: 'Search components' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()

  await user.click(trigger)
  await user.type(screen.getByRole('searchbox', { name: 'Search components' }), 'shadow')
  await user.tab()
  expect(screen.getByRole('searchbox', { name: 'Search components' })).toHaveValue('shadow')
})

test('filters the sidebar tree for sections that provide grouped navigation items', async () => {
  const user = userEvent.setup()
  history.replaceState({}, '', '/design-system?section=data-visualization')
  render(<ApplicationDesignSystemPage />)
  await user.click(screen.getByRole('button', { name: 'Search library' }))
  await user.type(screen.getByPlaceholderText('Find a name or token'), 'token burn')
  expect(screen.getByRole('link', { name: 'Hourly token burn' })).toBeVisible()
  expect(screen.queryByRole('link', { name: 'Area chart' })).not.toBeInTheDocument()
})

test('copies typography recipes and layout and icon IDs that resolve in the reference', async () => {
  const user = userEvent.setup()
  render(<ApplicationDesignSystemPage />)
  await user.click(screen.getByRole('button', { name: 'Copy h1 typography', exact: true }))
  expect(await navigator.clipboard.readText()).toContain('var(--v2-text-h1) / var(--v2-line-h1)')
  await user.click(screen.getByRole('button', { name: 'Copy Stack component ID' }))
  expect(basicsManifest.components.find(item => item.id === 'Stack').source).toContain('/Stack.tsx')
  expect(await navigator.clipboard.readText()).toBe(componentCopy('Stack'))
  await user.click(screen.getByRole('button', { name: 'Copy lucide:Search and --v2-icon-md', exact: true }))
  expect(await navigator.clipboard.readText()).toBe('lucide:Search\n--v2-icon-md')
  expect(basicsManifest.icons.find(item => item.id === 'lucide:Search').import).toContain('lucide-react')
  expect(basicsManifest.tokens.find(item => item.id === '--v2-radius').resolved).toBe('4px')
})

test('publishes Small typography at weight 500', async () => {
  const user = userEvent.setup()
  render(<ApplicationDesignSystemPage />)
  const small = screen.getByRole('button', { name: 'Copy small typography', exact: true })
  expect(small).toHaveTextContent('500')
  await user.click(small)
  expect(await navigator.clipboard.readText()).toContain('var(--v2-weight-heading)')
})

test('publishes H4 at regular heading weight and H5/H6 at strong heading weight', async () => {
  const user = userEvent.setup()
  render(<ApplicationDesignSystemPage />)

  for (const key of ['h4', 'h5', 'h6']) {
    const sample = screen.getByRole('button', { name: `Copy ${key} typography`, exact: true })
    expect(sample).toHaveTextContent(key === 'h4' ? '500' : '600')
    await user.click(sample)
    expect(await navigator.clipboard.readText()).toContain(key === 'h4' ? 'var(--v2-weight-heading)' : 'var(--v2-weight-heading-strong)')
  }

  expect(screen.getByRole('button', { name: 'Copy h6 typography', exact: true })).toHaveTextContent('16px / 22px · 600')
})

test('copies canonical tokens from both visible names and token labels', async () => {
  const user = userEvent.setup()
  render(<ApplicationDesignSystemPage />)
  await user.click(screen.getByText('Accent', { exact: true }))
  expect(await navigator.clipboard.readText()).toBe('--v2-accent')
  await user.click(screen.getByText('--v2-surface', { exact: true }))
  expect(await navigator.clipboard.readText()).toBe('--v2-surface')
  await user.click(screen.getByText('Large corners', { exact: true }))
  expect(await navigator.clipboard.readText()).toBe('--v2-radius-large')
})

test('provides larger icon tokens and searches and copies icons outside the common set', async () => {
  const user = userEvent.setup()
  render(<ApplicationDesignSystemPage />)
  for (const [size, value, label] of [['xl', '32px', '32'], ['xxl', '48px', '48']]) {
    expect(basicsManifest.tokens.find(token => token.id === `--v2-icon-${size}`).resolved).toBe(value)
    await user.click(screen.getByRole('radio', { name: label, exact: true }))
    await user.click(screen.getByRole('button', { name: `Copy lucide:Search and --v2-icon-${size}`, exact: true }))
    expect(await navigator.clipboard.readText()).toBe(`lucide:Search\n--v2-icon-${size}`)
  }
  const search = screen.getByRole('searchbox', { name: 'Search icons' })
  expect(screen.queryByRole('button', { name: 'Copy lucide:AlarmClock and --v2-icon-xxl', exact: true })).not.toBeInTheDocument()
  await user.type(search, 'alarm clock')
  await user.click(screen.getByRole('button', { name: 'Copy lucide:AlarmClock and --v2-icon-xxl', exact: true }))
  expect(await navigator.clipboard.readText()).toBe('lucide:AlarmClock\n--v2-icon-xxl')
  expect(basicsManifest.icons.find(icon => icon.id === 'lucide:AlarmClock').import).toContain('AlarmClock')
  expect(screen.getByRole('heading', { name: 'Color', exact: true })).toBeVisible()
  await user.clear(search)
  await user.type(search, 'lucide:AlarmClock')
  expect(screen.getByRole('button', { name: 'Copy lucide:AlarmClock and --v2-icon-xxl', exact: true })).toBeVisible()
  await user.clear(search)
  await user.type(search, 'no-such-icon-xyz')
  expect(screen.getByText('No icons found. Try another name.')).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.getByRole('button', { name: 'Copy lucide:Search and --v2-icon-xxl', exact: true })).toBeVisible()
})

test('publishes the small control height in Shape & sizing', () => {
  render(<ApplicationDesignSystemPage />)
  expect(basicsManifest.tokens.find(token => token.id === '--v2-control-height-small').resolved).toBe('32px')
  expect(screen.getByRole('heading', { name: 'Shape & sizing', exact: true })).toBeVisible()
  expect(screen.getByText('--v2-control-height-small', { exact: true })).toBeVisible()
})
