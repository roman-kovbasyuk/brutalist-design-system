import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { ModulePlayground } from './ModulePlayground.jsx'

afterEach(cleanup)

test.each([
  ['brief', 'Campaign description'], ['copy', 'Copy module'], ['visuals', 'Soft daylight image'],
  ['banners', 'Banners module'], ['review', 'Review module'], ['distribute', 'Distribute module'],
])('renders the real %s module from fixture records', async (moduleId, label) => {
  history.replaceState({}, '', `/mvp/dev/modules/${moduleId}?scenario=${moduleId === 'brief' ? 'draft' : moduleId === 'copy' ? 'copy-ready' : moduleId === 'visuals' ? 'visuals-ready' : moduleId === 'banners' ? 'composed' : moduleId === 'review' ? 'in-review' : 'approved'}`)
  render(<ModulePlayground />)
  expect(await screen.findByLabelText(label)).toBeInTheDocument()
  expect(screen.getByText('Fixture records — never production data')).toBeVisible()
})

test.each([
  ['running', 'Working on visuals…'],
  ['failed', 'Fixture failed operation.'],
  ['uncertain', 'Fixture uncertain operation.'],
])('shows %s operation metadata and real module feedback', async (kind, feedback) => {
  history.replaceState({}, '', '/mvp/dev/modules/visuals?scenario=visuals-ready')
  render(<ModulePlayground />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /Operation state/ }))
  await user.click(screen.getByRole('option', { name: kind }))
  const diagnostics = screen.getByRole('region', { name: 'Fixture diagnostics' })
  expect(within(diagnostics).getByText(kind)).toBeVisible()
  expect(within(diagnostics).getByText('prepare-prompts')).toBeVisible()
  expect(within(diagnostics).getByText('fixture-job')).toBeVisible()
  expect(within(diagnostics).getByText('fixture-request')).toBeVisible()
  expect(await screen.findByText(feedback)).toBeVisible()
  if (kind !== 'running') expect(screen.getByRole('button', { name: 'Retry prompt request' })).toBeVisible()
})

test('a module retry records the action selected by its fixture overlay', async () => {
  history.replaceState({}, '', '/mvp/dev/modules/visuals?scenario=visuals-ready')
  render(<ModulePlayground />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /Operation state/ }))
  await user.click(screen.getByRole('option', { name: 'uncertain' }))
  await user.click(await screen.findByRole('button', { name: 'Retry prompt request' }))
  expect(screen.getByRole('log', { name: 'Fixture event log' })).toHaveTextContent('preparePrompts')
})

test('records named command arguments and dirty and navigation events', async () => {
  history.replaceState({}, '', '/mvp/dev/modules/brief?scenario=copy-ready')
  render(<ModulePlayground />)
  const user = userEvent.setup()
  await user.type(await screen.findByRole('textbox', { name: 'Refine brief' }), 'Use a calmer tone')
  await user.click(screen.getByRole('button', { name: 'Update brief' }))
  const log = screen.getByRole('log', { name: 'Fixture event log' })
  expect(log).toHaveTextContent('dirty')
  expect(log).toHaveTextContent('refine')
  expect(log).toHaveTextContent('Use a calmer tone')
})

test('role control recomputes access state', async () => {
  history.replaceState({}, '', '/mvp/dev/modules/review?scenario=in-review')
  render(<ModulePlayground />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /Fixture role/ }))
  await user.click(screen.getByRole('option', { name: 'designer' }))
  expect(screen.getByRole('region', { name: 'Fixture diagnostics' })).toHaveTextContent('editable')
})

test('module control updates the semantic playground URL', async () => {
  history.replaceState({}, '', '/mvp/dev/modules/brief?scenario=draft')
  render(<ModulePlayground />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /Fixture module/ }))
  await user.click(screen.getByRole('option', { name: 'copy' }))
  expect(location.pathname).toBe('/mvp/dev/modules/copy')
})

test('records navigation from a real module continuation control', async () => {
  history.replaceState({}, '', '/mvp/dev/modules/visuals?scenario=visuals-ready')
  render(<ModulePlayground />)
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Continue to banners' }))
  const log = screen.getByRole('log', { name: 'Fixture event log' })
  expect(log).toHaveTextContent('navigate')
  expect(log).toHaveTextContent('banners')
})
