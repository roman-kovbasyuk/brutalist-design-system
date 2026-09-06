import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { CampaignPage } from './CampaignPage.jsx'
import { createCampaignRuntime } from './campaignRuntime.js'
import { makeScenario } from './testing/workspaceFixtures.js'

it('renders six module frames and navigates using semantic IDs', async () => {
  const scenario = makeScenario('copy-ready')
  const runtime = createCampaignRuntime({ ...scenario, api: {} })
  const navigate = vi.fn()
  render(<CampaignPage runtime={runtime} activeModule="copy" onNavigate={navigate} heading={<h1>Campaign</h1>} />)
  expect(screen.getAllByRole('heading', { level: 2 }).map(item => item.textContent)).toEqual(['Brief', 'Copy', 'Visuals', 'Banners', 'Review', 'Distribute'])
  const nav = screen.getByRole('list', { name: 'Campaign workflow' })
  fireEvent.click(within(nav).getByRole('link', { name: 'Brief' }))
  expect(navigate).toHaveBeenCalledWith('brief')
  await screen.findByRole('button', { name: 'Preview option 1' })
  runtime.dispose()
})

it('preserves the brief editor across module navigation and runtime refresh', async () => {
  const scenario = makeScenario('copy-ready')
  const api = { getWorkspace: vi.fn().mockResolvedValue(scenario.workspace) }
  const runtime = createCampaignRuntime({ ...scenario, api })
  const props = { runtime, activeModule: 'brief', onNavigate: vi.fn() }
  const { rerender } = render(<CampaignPage {...props} />)
  const input = await screen.findByRole('textbox')
  fireEvent.change(input, { target: { value: 'Keep this draft' } })
  rerender(<CampaignPage {...props} activeModule="copy" />)
  await runtime.refresh()
  await waitFor(() => expect(screen.getByRole('textbox')).toBe(input))
  expect(input).toHaveValue('Keep this draft')
  expect(runtime.hasDirty()).toBe(true)
  runtime.dispose()
})
