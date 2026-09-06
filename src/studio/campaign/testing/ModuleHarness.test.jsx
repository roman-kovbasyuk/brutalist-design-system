import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ModuleHarness } from './ModuleHarness.jsx'
import { makeScenario } from './workspaceFixtures.js'

afterEach(cleanup)
it.each([
  ['brief', 'draft', 'Campaign description'], ['copy', 'copy-ready', 'Copy module'],
  ['visuals', 'visuals-ready', 'Soft daylight image'], ['banners', 'composed', 'Banners module'],
  ['review', 'in-review', 'Review module'], ['distribute', 'approved', 'Distribute module'],
])('renders %s independently without a shell or real API', async (moduleId, scenario, label) => {
  render(<ModuleHarness moduleId={moduleId} scenario={makeScenario(scenario)} />)
  expect(await screen.findByLabelText(label)).toBeInTheDocument()
})

it('records analyzed Brief refinement with the entered instruction and captured source key', async () => {
  const user = userEvent.setup()
  const record = vi.fn()
  render(<ModuleHarness moduleId="brief" scenario={makeScenario('copy-ready')} record={record} />)

  await user.type(await screen.findByRole('textbox', { name: 'Refine brief' }), 'Focus on design-conscious commuters')
  await user.click(screen.getByRole('button', { name: 'Update brief' }))

  expect(record).toHaveBeenCalledWith({ moduleId: 'brief', action: 'refine', args: [
    'Focus on design-conscious commuters',
    { expectedInputKey: '{"audience":"Commuters","locale":"en","notes":"Promote headphones for a quieter commute.","objective":"Shop the collection","offer":"20% off","product":"Headphones"}' },
  ] })
})

it('records a retry when Visuals prompt preparation failed', async () => {
  const user = userEvent.setup()
  const record = vi.fn()
  const operation = { kind: 'failed', actionId: 'prepare-prompts', jobId: null, error: { message: 'Prompt preparation failed.' } }
  render(<ModuleHarness moduleId="visuals" scenario={makeScenario('visuals-ready')} operation={operation} record={record} />)

  await user.click(await screen.findByRole('button', { name: 'Retry prompt request' }))

  expect(record).toHaveBeenCalledWith({ moduleId: 'visuals', action: 'preparePrompts', args: [{ retry: true }] })
})

it('records Visuals bulk generation and a deterministic PNG upload', async () => {
  const user = userEvent.setup()
  const record = vi.fn()
  const scenario = makeScenario('visuals-ready')
  scenario.workspace.directions[0].previewAssetId = null
  const png = new File([new Uint8Array([137, 80, 78, 71])], 'fixture.png', { type: 'image/png' })
  render(<ModuleHarness moduleId="visuals" scenario={scenario} record={record} />)

  await user.click(await screen.findByRole('button', { name: 'Generate All Static Visuals' }))
  const selectedCopyCard = screen.getByRole('heading', { name: 'Visuals for selected copy' }).closest('article')
  await user.click(within(selectedCopyCard).getByRole('button', { name: 'Upload visual' }))
  await user.upload(screen.getByLabelText('Upload image file'), png)

  expect(record).toHaveBeenCalledWith(expect.objectContaining({ moduleId: 'visuals', action: 'generateAll' }))
  expect(record).toHaveBeenCalledWith({ moduleId: 'visuals', action: 'upload', args: [
    { mode: 'selected_copy', copyId: 'copy-1' }, expect.objectContaining({ name: 'fixture.png', type: 'image/png' }),
  ] })
})

it('records Banners selection save before review preparation', async () => {
  const user = userEvent.setup()
  const record = vi.fn()
  render(<ModuleHarness moduleId="banners" scenario={makeScenario('composed')} record={record} onNavigate={vi.fn()} />)

  await user.click(await screen.findByRole('button', { name: 'Select all designs' }))
  await user.click(screen.getByRole('button', { name: 'Send to Figma' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm and prepare review' }))

  await vi.waitFor(() => expect(record.mock.calls.filter(([event]) => event.action).map(([event]) => event.action)).toEqual(['saveBatch', 'prepareReview']))
})

it('keeps a custom action override on the real interaction path', async () => {
  const user = userEvent.setup()
  const record = vi.fn()
  const refine = vi.fn(async () => ({ ok: true }))
  render(<ModuleHarness moduleId="brief" scenario={makeScenario('copy-ready')} actions={{ refine }} record={record} />)

  await user.type(await screen.findByRole('textbox', { name: 'Refine brief' }), 'Use a calmer tone')
  await user.click(screen.getByRole('button', { name: 'Update brief' }))

  expect(refine).toHaveBeenCalledWith('Use a calmer tone', expect.objectContaining({ expectedInputKey: expect.any(String) }))
  expect(record).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'refine' }))
})

it('returns the requested historical template when a saved banner uses an older version', async () => {
  const scenario = makeScenario('composed')
  scenario.workspace.composition.templateVersion = 'historic-v1'
  const record = vi.fn()

  render(<ModuleHarness moduleId="banners" scenario={scenario} record={record} />)

  await vi.waitFor(() => expect(record).toHaveBeenCalledWith({
    moduleId: 'banners', action: 'loadTemplateVersion', args: ['editorial-split', 'historic-v1'],
  }))
  expect(screen.queryByText('Saved template details could not load. Retry before changing their sizes.')).not.toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('tab', { name: 'Sizes & formats' }))
  expect(screen.getByText(/1080 × 1080/)).toBeVisible()
})
