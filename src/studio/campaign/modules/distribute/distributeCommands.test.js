import { describe, expect, test, vi } from 'vitest'
import { createCampaignRuntime } from '../../campaignRuntime.js'
import { makeScenario } from '../../testing/workspaceFixtures.js'
import { createDistributeCommands } from './distributeCommands.js'

function setup(name = 'approved') {
  const scenario = makeScenario(name)
  const api = {
    getWorkspace: vi.fn(async () => structuredClone(scenario.workspace)),
    getReview: vi.fn(async () => structuredClone(scenario.reviewHistory)),
    deliver: vi.fn(async () => ({})), getDelivery: vi.fn(async () => structuredClone(scenario.workspace.delivery)),
    getAssetBlob: vi.fn(async () => new Blob(['zip'], { type: 'application/zip' })),
  }
  const runtime = createCampaignRuntime({ ...scenario, api })
  return { ...scenario, api, runtime, actions: createDistributeCommands(runtime) }
}

describe('Distribute commands', () => {
  test('builds delivery for the exact approved current version idempotently', async () => {
    const { actions, api, runtime } = setup()
    expect(await actions.build()).toEqual({ ok: true })
    expect(api.deliver).toHaveBeenCalledWith('version-1', {}, expect.any(String))
    runtime.dispose()
  })

  test('downloads only a package matching the delivered current version', async () => {
    const { actions, api, runtime } = setup('delivered')
    const blob = await actions.download()
    expect(blob).toBeInstanceOf(Blob)
    expect(api.getDelivery).toHaveBeenCalledWith('version-1', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(api.getAssetBlob).toHaveBeenCalledWith('zip-1', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    runtime.dispose()
  })

  test('rejects a server delivery record from another version before reading its bytes', async () => {
    const { actions, api, runtime } = setup('delivered')
    api.getDelivery.mockResolvedValue({ ...(await api.getDelivery()), versionId: 'version-2' })
    await expect(actions.download()).rejects.toMatchObject({ code: 'delivery_version_mismatch' })
    expect(api.getAssetBlob).not.toHaveBeenCalled()
    runtime.dispose()
  })
})
