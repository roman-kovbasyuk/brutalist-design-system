import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { projectModuleInput, moduleInputKey } from '../../moduleContracts.js'
import { deriveWorkflowState } from '../../workflowState.js'
import { makeScenario } from '../../testing/workspaceFixtures.js'
import ReviewModule from './ReviewModule.jsx'

const assets = { getAssetBlob: vi.fn(async () => new Blob([], { type: 'image/png' })) }
function renderScenario(name, { actor, actions = {}, scenario = makeScenario(name), setDirty = vi.fn() } = {}) {
  if (actor) scenario.actor = actor
  const input = projectModuleInput('review', scenario.workspace, scenario)
  const access = deriveWorkflowState(scenario.workspace, scenario.actor, scenario.reviewHistory).modules.review
  return { ...render(<ReviewModule port={{ input, inputKey: moduleInputKey('review', input), access,
    operation: { kind: 'idle', actionId: null, error: null }, actions, assets, setDirty }} />), scenario, setDirty }
}

describe('Review module phases', () => {
  test('prepare offers valid editors version creation without adding a host-owned h2', () => {
    renderScenario('composed', { actions: { createVersion: vi.fn() } })
    expect(screen.getByRole('button', { name: 'Create version and send to review' })).toBeEnabled()
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  })

  test('designer review requires a Figma link and all three checks', () => {
    const markReady = vi.fn()
    renderScenario('in-review', { actor: { id: 'designer-2', role: 'designer' }, actions: { markReady } })
    const submit = screen.getByRole('button', { name: 'Mark ready for approval' })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Figma review link'), { target: { value: 'https://www.figma.com/design/exact/review' } })
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    expect(markReady).toHaveBeenCalledWith({ figmaUrl: 'https://www.figma.com/design/exact/review', checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true } }, expect.objectContaining({ expectedInputKey: expect.any(String) }))
  })

  test('designer fields are disabled while their review submission is running', () => {
    const scenario = makeScenario('in-review')
    scenario.actor = { id: 'designer-2', role: 'designer' }
    const input = projectModuleInput('review', scenario.workspace, scenario)
    const access = deriveWorkflowState(scenario.workspace, scenario.actor, scenario.reviewHistory).modules.review
    render(<ReviewModule port={{ input, inputKey: moduleInputKey('review', input), access,
      operation: { kind: 'running', actionId: 'markReady', error: null }, actions: {}, assets, setDirty: vi.fn() }} />)
    expect(screen.getByLabelText('Figma review link').closest('fieldset')).toBeDisabled()
    expect(screen.getByLabelText('Request a change')).toBeDisabled()
  })

  test('marketer waits during designer review while a permitted marketer can approve ready work', () => {
    const approve = vi.fn()
    const waiting = renderScenario('in-review')
    expect(screen.getByText(/Waiting for the designer/)).toBeVisible()
    waiting.unmount()
    renderScenario('ready', { actions: { approve } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve version 1' }))
    expect(approve).toHaveBeenCalledWith(expect.objectContaining({ expectedInputKey: expect.any(String) }))
  })

  test('changes require feedback and expose reopening only to an editor', () => {
    const reopen = vi.fn()
    renderScenario('changes-requested', { actions: { reopen } })
    expect(screen.getByText('Make the headline clearer.', { selector: '.bs-info p' })).toBeVisible()
    expect(within(screen.getByText(/Version activity/).closest('details')).getByText('Make the headline clearer.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reopen to edit' }))
    expect(reopen).toHaveBeenCalled()
  })

  test.each([
    ['composed', 'marketer', 'enabled', 'Create version and send to review'],
    ['composed', 'admin', 'enabled', 'Create version and send to review'],
    ['composed', 'designer', 'disabled', 'Create version and send to review'],
    ['in-review', 'marketer', 'absent', 'Mark ready for approval'],
    ['in-review', 'admin', 'absent', 'Mark ready for approval'],
    ['in-review', 'designer', 'disabled', 'Mark ready for approval'],
    ['changes-requested', 'marketer', 'enabled', 'Reopen to edit'],
    ['changes-requested', 'admin', 'enabled', 'Reopen to edit'],
    ['changes-requested', 'designer', 'absent', 'Reopen to edit'],
    ['ready', 'marketer', 'enabled', 'Approve version 1'],
    ['ready', 'admin', 'enabled', 'Approve version 1'],
    ['ready', 'designer', 'absent', 'Approve version 1'],
  ])('%s gives %s the expected control boundary', (name, role, state, buttonName) => {
    renderScenario(name, { actor: { id: `${role}-2`, role } })
    const button = screen.queryByRole('button', { name: buttonName })
    if (state === 'enabled') expect(button).toBeEnabled()
    else if (state === 'disabled') expect(button).toBeDisabled()
    else expect(button).toBeNull()
  })

  test('a new version cannot reuse another version draft or ready checks', () => {
    const first = makeScenario('in-review')
    first.actor = { id: 'designer-2', role: 'designer' }
    const { rerender } = renderScenario('in-review', { scenario: first, actions: { markReady: vi.fn() } })
    fireEvent.change(screen.getByLabelText('Figma review link'), { target: { value: 'https://www.figma.com/design/old/review' } })
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    const next = structuredClone(first)
    next.workspace.versions[0].id = 'version-2'; next.workspace.versions[0].versionNumber = 2
    next.workspace.campaign.currentVersionNumber = 2; next.workspace.campaign.openVersionId = 'version-2'
    next.reviewHistory.version = next.workspace.versions[0]; next.reviewHistory.events = next.reviewHistory.events.map(event => ({ ...event, versionId: 'version-2' }))
    const input = projectModuleInput('review', next.workspace, next)
    const access = deriveWorkflowState(next.workspace, next.actor, next.reviewHistory).modules.review
    rerender(<ReviewModule port={{ input, inputKey: moduleInputKey('review', input), access, operation: { kind: 'idle' }, actions: {}, assets, setDirty: vi.fn() }} />)
    expect(screen.getByLabelText('Figma review link')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Mark ready for approval' })).toBeDisabled()
  })

  test('same-version refresh preserves drafts but phase or version replacement clears dirty state and local errors', async () => {
    const scenario = makeScenario('in-review')
    scenario.actor = { id: 'designer-2', role: 'designer' }
    const setDirty = vi.fn()
    const actions = { markReady: vi.fn().mockRejectedValue(new Error('Submission failed')) }
    const view = renderScenario('in-review', { scenario, actions, setDirty })
    fireEvent.change(screen.getByLabelText('Figma review link'), { target: { value: 'https://www.figma.com/design/scoped/review' } })
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    const refreshed = structuredClone(scenario)
    refreshed.workspace.campaign.revision += 1
    let input = projectModuleInput('review', refreshed.workspace, refreshed)
    let access = deriveWorkflowState(refreshed.workspace, refreshed.actor, refreshed.reviewHistory).modules.review
    view.rerender(<ReviewModule port={{ input, inputKey: moduleInputKey('review', input), access, operation: { kind: 'idle' }, actions, assets, setDirty }} />)
    expect(screen.getByLabelText('Figma review link')).toHaveValue('https://www.figma.com/design/scoped/review')
    fireEvent.click(screen.getByRole('button', { name: 'Mark ready for approval' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Submission failed')
    const next = makeScenario('ready')
    next.actor = { id: 'marketer-2', role: 'marketer' }
    input = projectModuleInput('review', next.workspace, next)
    access = deriveWorkflowState(next.workspace, next.actor, next.reviewHistory).modules.review
    view.rerender(<ReviewModule port={{ input, inputKey: moduleInputKey('review', input), access, operation: { kind: 'idle' }, actions: {}, assets, setDirty }} />)
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(setDirty).toHaveBeenLastCalledWith(false)
  })

  test('an old preview download cannot report failure or clear busy state in a replacement context', async () => {
    let rejectDownload
    const scopedAssets = { getAssetBlob: vi.fn(() => new Promise((_resolve, reject) => { rejectDownload = reject })) }
    const first = makeScenario('in-review')
    first.actor = { id: 'designer-2', role: 'designer' }
    const input = projectModuleInput('review', first.workspace, first)
    const access = deriveWorkflowState(first.workspace, first.actor, first.reviewHistory).modules.review
    const view = render(<ReviewModule port={{ input, inputKey: moduleInputKey('review', input), access,
      operation: { kind: 'idle' }, actions: {}, assets: scopedAssets, setDirty: vi.fn() }} />)
    fireEvent.click(screen.getByRole('button', { name: 'PNG' }))
    const next = structuredClone(first)
    next.workspace.versions[0].id = 'version-2'; next.workspace.versions[0].versionNumber = 2
    next.workspace.campaign.currentVersionNumber = 2; next.workspace.campaign.openVersionId = 'version-2'
    next.reviewHistory.version = next.workspace.versions[0]
    next.reviewHistory.events = next.reviewHistory.events.map(event => ({ ...event, versionId: 'version-2' }))
    const nextInput = projectModuleInput('review', next.workspace, next)
    const nextAccess = deriveWorkflowState(next.workspace, next.actor, next.reviewHistory).modules.review
    view.rerender(<ReviewModule port={{ input: nextInput, inputKey: moduleInputKey('review', nextInput), access: nextAccess,
      operation: { kind: 'idle' }, actions: {}, assets: scopedAssets, setDirty: vi.fn() }} />)
    rejectDownload(new Error('Old version unavailable'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'PNG' })).toBeEnabled())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('approved review remains an inspectable summary without delivery controls', () => {
    renderScenario('approved')
    expect(screen.getByText('Version 1')).toBeVisible()
    expect(screen.getByRole('heading', { level: 3, name: 'Approved' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Build delivery' })).toBeNull()
  })

  test('delivered review remains an explicit inspectable delivered summary', () => {
    renderScenario('delivered')
    expect(screen.getByRole('heading', { level: 3, name: 'Delivered' })).toBeVisible()
    expect(screen.getByText('This approved version has been packaged for distribution.')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Build delivery|Download package/ })).toBeNull()
  })
})
