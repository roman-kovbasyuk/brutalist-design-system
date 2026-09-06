import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { ModuleHarness } from '../../testing/ModuleHarness.jsx'
import { makeScenario } from '../../testing/workspaceFixtures.js'
import { ModuleHost } from '../../ModuleHost.jsx'
import { createCampaignRuntime } from '../../campaignRuntime.js'
import { createWorkflowCoordinator } from '../../workflowCoordinator.js'

describe('Copy module boundaries', () => {
  test('mount and refresh never generate or read images', async () => {
    const scenario = makeScenario('copy-ready')
    const generate = vi.fn(), assets = { getAssetBlob: vi.fn() }
    const view = render(<ModuleHarness moduleId="copy" scenario={scenario} actions={{ generate }} assets={assets} />)
    await screen.findByRole('button', { name: 'Preview option 1' })
    scenario.workspace.campaign.revision += 1
    view.rerender(<ModuleHarness moduleId="copy" scenario={scenario} actions={{ generate }} assets={assets} />)
    expect(generate).not.toHaveBeenCalled()
    expect(assets.getAssetBlob).not.toHaveBeenCalled()
  })
  test('a failed batch leaves earlier cards and approvals visible', async () => {
    const scenario = makeScenario('copy-ready')
    scenario.workspace.copies[0].approvedCandidateIds = ['copy-1']
    scenario.workspace.copies[0].selectedCandidateId = 'copy-1'
    scenario.workspace.campaign.selectedCopyId = scenario.workspace.copies[0].id
    const generate = vi.fn().mockRejectedValue(new Error('Copy provider unavailable'))
    render(<ModuleHarness moduleId="copy" scenario={scenario} actions={{ generate }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Generate More Options' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Copy provider unavailable'))
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Approve option 1' })).toHaveAttribute('aria-pressed', 'true')
  })
  test('unknown generation offers reconciliation, not a new batch', async () => {
    const generate = vi.fn()
    render(<ModuleHarness moduleId="copy" scenario={makeScenario('copy-ready')}
      actions={{ generate }} operation={{ kind: 'uncertain', actionId: 'generate', error: new Error('Check generation status') }} />)
    expect(await screen.findByRole('button', { name: 'Generate More Options' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Check generation result' }))
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1))
  })
  test('the Approve card interaction sends one approval and one authoritative workspace refresh', async () => {
    const scenario = makeScenario('copy-ready')
    scenario.workspace.copies[0].approvedCandidateIds = []
    const api = {
      getWorkspace: vi.fn(async () => structuredClone(scenario.workspace)),
      approveCopy: vi.fn(async (_campaignId, copyId) => {
        scenario.workspace.copies[0].approvedCandidateIds = [copyId]
        scenario.workspace.copies[0].selectedCandidateId = copyId
        scenario.workspace.campaign.selectedCopyId = scenario.workspace.copies[0].id
        scenario.workspace.campaign.revision += 1
      }),
      selectCopy: vi.fn(), deleteCopy: vi.fn(), generate: vi.fn(), uploadVisual: vi.fn(), selectDirection: vi.fn(),
    }
    const initialWorkspace = await api.getWorkspace(scenario.workspace.campaign.id)
    const initialReads = api.getWorkspace.mock.calls.length
    const runtime = createCampaignRuntime({ ...scenario, workspace: initialWorkspace, api })
    const coordinator = createWorkflowCoordinator({ runtime })
    const view = render(<ModuleHost runtime={runtime} moduleId="copy" actions={coordinator.actions.copy} active />)

    await userEvent.click(await screen.findByRole('button', { name: 'Approve option 1' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve option 1' })).toHaveAttribute('aria-pressed', 'true'))

    expect(initialReads).toBe(1)
    expect(api.approveCopy).toHaveBeenCalledOnce()
    expect(api.approveCopy).toHaveBeenCalledWith('campaign-1', 'copy-1', initialWorkspace.campaign.revision)
    expect(api.getWorkspace).toHaveBeenCalledTimes(initialReads + 1)
    expect(api.selectCopy).not.toHaveBeenCalled()
    expect(api.deleteCopy).not.toHaveBeenCalled()
    expect(api.generate).not.toHaveBeenCalled()
    expect(api.uploadVisual).not.toHaveBeenCalled()
    expect(api.selectDirection).not.toHaveBeenCalled()
    view.unmount()
    runtime.dispose()
  })
})
