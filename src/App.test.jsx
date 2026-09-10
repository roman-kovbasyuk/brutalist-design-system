import { render, screen } from '@testing-library/react'
import { beforeEach, expect, test } from 'vitest'
import App from './App.jsx'

beforeEach(() => history.replaceState({}, '', '/'))

test.each(['/design-system', '/design-system/', '/'])('renders the design-system foundation at %s', async (path) => {
  history.replaceState({}, '', path)
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Design system' }, { timeout: 10000 })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Open v2 workbench' })).toHaveAttribute('href', '/design-system?mode=workbench')
  expect(screen.queryByText(/Connected campaign workspace/i)).not.toBeInTheDocument()
}, 15000)

test('opens the additive workbench only when explicitly requested', async () => {
  history.replaceState({}, '', '/design-system?mode=workbench')
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Buttons' }, { timeout: 10000 })).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'Choose a section to explore' })).not.toBeInTheDocument()
}, 15000)
