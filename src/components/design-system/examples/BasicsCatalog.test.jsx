import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import ApplicationDesignSystemPage from '../../../screens/ApplicationDesignSystemPage.jsx'
import { basicsManifest } from './BasicsCatalog.jsx'

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
  for (const name of ['Color', 'Typography', 'Spacing', 'Shape & sizing', 'Elevation', 'Motion', 'Layout', 'Icons']) {
    expect(screen.getByRole('heading', { name, exact: true })).toBeVisible()
  }
  expect(screen.getByRole('main').closest('.application-design-system')).toBeInTheDocument()
  expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  expect(screen.queryByText(/ready for its first/)).not.toBeInTheDocument()
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

test('copies typography recipes and layout and icon IDs that resolve in the reference', async () => {
  const user = userEvent.setup()
  render(<ApplicationDesignSystemPage />)
  await user.click(screen.getByRole('button', { name: 'Copy h1 typography', exact: true }))
  expect(await navigator.clipboard.readText()).toContain('var(--v2-text-h1) / var(--v2-line-h1)')
  await user.click(screen.getByRole('button', { name: 'Copy Stack component ID' }))
  expect(basicsManifest.components.find(item => item.id === 'Stack').source).toContain('/Stack.tsx')
  expect(await navigator.clipboard.readText()).toBe('Stack')
  await user.click(screen.getByRole('button', { name: 'Copy lucide:Search', exact: true }))
  expect(await navigator.clipboard.readText()).toBe('lucide:Search')
  expect(basicsManifest.icons.find(item => item.id === 'lucide:Search').import).toContain('lucide-react')
  expect(basicsManifest.tokens.find(item => item.id === '--v2-radius').resolved).toBe('4px')
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
  for (const [size, value] of [['xl', '32px'], ['xxl', '48px']]) {
    expect(basicsManifest.tokens.find(token => token.id === `--v2-icon-${size}`).resolved).toBe(value)
    await user.click(screen.getByRole('button', { name: `Copy --v2-icon-${size}`, exact: true }))
    expect(await navigator.clipboard.readText()).toBe(`--v2-icon-${size}`)
  }
  const search = screen.getByRole('searchbox', { name: 'Search icons' })
  expect(screen.queryByRole('button', { name: 'Copy lucide:AlarmClock', exact: true })).not.toBeInTheDocument()
  await user.type(search, 'alarm clock')
  await user.click(screen.getByRole('button', { name: 'Copy lucide:AlarmClock', exact: true }))
  expect(await navigator.clipboard.readText()).toBe('lucide:AlarmClock')
  expect(basicsManifest.icons.find(icon => icon.id === 'lucide:AlarmClock').import).toContain('AlarmClock')
  expect(screen.getByRole('heading', { name: 'Color', exact: true })).toBeVisible()
  await user.clear(search)
  await user.type(search, 'lucide:AlarmClock')
  expect(screen.getByRole('button', { name: 'Copy lucide:AlarmClock', exact: true })).toBeVisible()
  await user.clear(search)
  await user.type(search, 'no-such-icon-xyz')
  expect(screen.getByText('No icons found. Try another name.')).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.getByRole('button', { name: 'Copy lucide:Search', exact: true })).toBeVisible()
})
