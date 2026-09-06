import { describe, expect, it, vi } from 'vitest'
import { createCampaignRuntime } from '../../campaignRuntime.js'
import { createVisualsCommands } from './visualsCommands.js'
import { makeScenario } from '../../testing/workspaceFixtures.js'

function setup({ failure, holdDirections } = {}) {
  const { workspace, actor, templates } = makeScenario('copy-ready')
  const copies = workspace.copies[0].candidates
  workspace.copies[0].approvedCandidateIds = [copies[0].id]
  const api = { getWorkspace: vi.fn(async () => structuredClone(workspace)), generate: vi.fn(async (_id, step, input) => {
    if (step === 'directions') {
      await holdDirections
      const count = input.mode === 'campaign' ? 3 : input.copyIds.length
      workspace.directions.push(...Array.from({ length: count }, (_, index) => ({ id: `d-${index}`, title: `Idea ${index + 1}`, prompt: 'Quiet source image', status: 'pending', previewAssetId: null, stale: false, batchId: 'batch', scope: input.mode })))
      return { job: { id: 'batch', step, status: 'succeeded', result: { directions: workspace.directions } } }
    }
    const direction = workspace.directions.find(item => item.id === input.directionId)
    if (failure && direction.id === 'd-1') return { job: { id: 'failed-image', step, status: failure } }
    direction.status = 'ready'; direction.previewAssetId = `asset-${direction.id}`
    return { job: { id: `j-${direction.id}`, step, status: 'succeeded' } }
  }) }
  const runtime = createCampaignRuntime({ workspace: structuredClone(workspace), actor, templates, api })
  return { api, runtime, commands: createVisualsCommands(runtime), workspace }
}

describe('Visuals isolated commands', () => {
  it('generates three campaign images immediately without copy approval or a second action', async () => {
    const { commands, runtime, api } = setup()
    const progress = []
    const result = await commands.generate('campaign', { onProgress: value => progress.push(value) })
    expect(result.ok).toBe(true)
    expect(api.generate.mock.calls.map(call => call[1])).toEqual(['directions', 'image', 'image', 'image'])
    expect(api.generate.mock.calls[0][2]).toEqual({ mode: 'campaign' })
    expect(progress.some(item => item.total === 3)).toBe(true)
    runtime.dispose()
  })
  it('uses approved current copy IDs only', async () => {
    const { commands, runtime, api } = setup()
    await commands.generate('selected_copy')
    expect(api.generate.mock.calls[0][2]).toEqual({ mode: 'selected_copy', copyIds: ['copy-1'] })
    expect(api.generate).toHaveBeenCalledTimes(2)
    runtime.dispose()
  })
  it('preserves successes, continues after a known failure, and bulk fills only missing images', async () => {
    const { commands, runtime, api, workspace } = setup({ failure: 'failed' })
    await commands.generate('campaign')
    expect(workspace.directions.filter(item => item.previewAssetId).map(item => item.id)).toEqual(['d-0', 'd-2'])
    api.generate.mockClear()
    await commands.generateAll()
    expect(api.generate.mock.calls.map(call => call[2].directionId)).toEqual(['d-1'])
    runtime.dispose()
  })
  it('stops after unknown generation and never sends a new image request automatically', async () => {
    const { commands, runtime, api } = setup({ failure: 'unknown' })
    await commands.generate('campaign')
    expect(api.generate).toHaveBeenCalledTimes(3)
    expect(runtime.getSnapshot('visuals').operation.kind).toBe('uncertain')
    runtime.dispose()
  })
  it('prevents a second batch click while the first is running', async () => {
    let release
    const gate = new Promise(resolve => { release = resolve })
    const { commands, runtime, api } = setup({ holdDirections: gate })
    const first = commands.generate('campaign')
    const second = await commands.generate('campaign')
    expect(second).toMatchObject({ ok: false, code: 'visuals_busy' })
    release(); await first
    expect(api.generate.mock.calls.filter(call => call[1] === 'directions')).toHaveLength(1)
    runtime.dispose()
  })
})
