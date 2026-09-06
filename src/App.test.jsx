import { render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import App from './App.jsx'

vi.mock('./studio/StudioApp.jsx', () => ({StudioApp: () => <main>Connected campaign workspace</main>}))
beforeEach(() => history.replaceState({}, '', '/mvp'))
test.each(['/design-system', '/design-system/'])('opens the standalone component reference at %s', async path => {
  history.replaceState({}, '', path)
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Application design system' })).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Foundations' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Back to Banner Studio' })).toHaveAttribute('href', '/mvp')
  expect(screen.queryByText('Connected campaign workspace')).not.toBeInTheDocument()
})
test('application entry renders the connected studio', () => {
  render(<App/> )
  expect(screen.getByRole('main')).toHaveTextContent('Connected campaign workspace')
})
test('development module route loads the isolated fixture playground', async () => {
  history.replaceState({}, '', '/mvp/dev/modules/brief?scenario=draft')
  render(<App />)
  expect(await screen.findByText('Fixture records — never production data')).toBeVisible()
  expect(screen.queryByText('Connected campaign workspace')).not.toBeInTheDocument()
})
