import { describe, it, expect, vi } from 'vitest'
import { createCampaignRuntime } from '../campaignRuntime.js'
import { makeScenario } from '../testing/workspaceFixtures.js'
import { createVisualsCommands } from './visuals/visualsCommands.js'
import { createBannersCommands } from './banners/bannersCommands.js'

describe('module write boundaries', () => {
  it('rejects a banner draft captured against an old source without sending it', async () => {
    const { workspace, actor, templates } = makeScenario('visuals-ready')
    const api = { saveComposition: vi.fn() }
    const runtime = createCampaignRuntime({ api, workspace, actor, templates })
    const result = await createBannersCommands(runtime).save({}, { expectedInputKey: 'old-source' })
    expect(result.ok).toBe(false)
    expect(api.saveComposition).not.toHaveBeenCalled()
    runtime.dispose()
  })
  it('does not select a direction outside the current module input', async () => {
    const { workspace, actor, templates } = makeScenario('visuals-ready')
    const api = { selectDirection: vi.fn() }
    const runtime = createCampaignRuntime({ api, workspace, actor, templates })
    const result = await createVisualsCommands(runtime).select('missing')
    expect(result.ok).toBe(false)
    expect(api.selectDirection).not.toHaveBeenCalled()
    runtime.dispose()
  })
})
