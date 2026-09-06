import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { projectModuleInput, moduleInputKey } from '../../moduleContracts.js'
import { deriveWorkflowState } from '../../workflowState.js'
import { makeScenario } from '../../testing/workspaceFixtures.js'
import DistributeModule from './DistributeModule.jsx'

function renderScenario(name, { actions = {}, actor } = {}) {
  const scenario = makeScenario(name)
  if (actor) scenario.actor = actor
  const input = projectModuleInput('distribute', scenario.workspace, scenario)
  const access = deriveWorkflowState(scenario.workspace, scenario.actor, scenario.reviewHistory).modules.distribute
  return render(<DistributeModule port={{ input, inputKey: moduleInputKey('distribute', input), access,
    operation: { kind: 'idle', actionId: null, error: null }, actions }} />)
}

describe('Distribute module', () => {
  test('approved editors can build delivery and Review has no delivery action', () => {
    const build = vi.fn()
    renderScenario('approved', { actions: { build } })
    fireEvent.click(screen.getByRole('button', { name: 'Build delivery' }))
    expect(build).toHaveBeenCalledWith(expect.objectContaining({ expectedInputKey: expect.any(String) }))
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  })

  test('designers can inspect but cannot build or download delivery', () => {
    renderScenario('delivered', { actor: { id: 'designer-2', role: 'designer' } })
    expect(screen.getByText('Version 1')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Build delivery|Download package/ })).toBeNull()
  })

  test('delivered editors can download while the local read is running', async () => {
    let release
    const download = vi.fn(() => new Promise(resolve => { release = resolve }))
    renderScenario('delivered', { actions: { download } })
    fireEvent.click(screen.getByRole('button', { name: 'Download package' }))
    expect(screen.getByRole('button', { name: 'Download package' })).toBeDisabled()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    release(new Blob(['zip']))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download package' })).toBeEnabled())
    click.mockRestore()
  })

  test('download errors remain local and keep the package visible', async () => {
    renderScenario('delivered', { actions: { download: vi.fn().mockRejectedValue(new Error('Archive unavailable')) } })
    fireEvent.click(screen.getByRole('button', { name: 'Download package' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Archive unavailable')
    expect(screen.getByText('Version 1')).toBeVisible()
  })
})
