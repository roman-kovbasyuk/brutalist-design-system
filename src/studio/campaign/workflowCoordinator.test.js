import { describe, expect, test, vi } from 'vitest'
import { createWorkflowCoordinator, startCampaign } from './workflowCoordinator.js'
import { createCampaignRuntime } from './campaignRuntime.js'
import { makeScenario } from './testing/workspaceFixtures.js'

function setup() {
  const scenario = makeScenario('draft')
  const generated = makeScenario('copy-ready').workspace
  const calls = []
  const api = {
    getWorkspace: vi.fn(async () => structuredClone(scenario.workspace)),
    createCampaign: vi.fn(async () => scenario.workspace.campaign),
    patchCampaign: vi.fn(async (_id, patch) => {
      calls.push('save')
      scenario.workspace.campaign.brief = { product: '', audience: '', objective: '', offer: '', locale: 'auto', ...patch.brief }
      scenario.workspace.campaign.revision += 1
    }),
    generate: vi.fn(async (_id, step) => {
      calls.push(step)
      if (step === 'brief') {
        scenario.workspace.jobs = structuredClone(generated.jobs)
        scenario.workspace.campaign.brief.analysis = generated.jobs[0].result.analysis
        scenario.workspace.campaign.revision += 1
      }
      if (step === 'copy') {
        scenario.workspace.copies = structuredClone(generated.copies)
        scenario.workspace.campaign.status = 'copy_ready'
      }
      if (step === 'directions') scenario.workspace.directions = Array.from({ length: 3 }, (_, i) => ({ id: `direction-${i}`, title: 'Prompt', prompt: 'A quiet commute', status: 'pending', previewAssetId: null, stale: false }))
      return { job: { id: `job-${step}`, status: 'succeeded' } }
    }),
    extractBriefFile: vi.fn(async () => ({ text: 'Extracted notes', requestId: 'extract-1' })),
  }
  const runtime = createCampaignRuntime({ ...scenario, api })
  const onNavigate = vi.fn()
  return { ...scenario, api, calls, runtime, onNavigate,
    coordinator: createWorkflowCoordinator({ runtime, onNavigate }) }
}

test('the Copy owner can replay an uncertain initial request with its original key', async () => {
  const state = setup()
  const generate = state.api.generate.getMockImplementation()
  let failed = false
  state.api.generate.mockImplementation(async (...args) => {
    if (args[1] === 'copy' && !failed) { failed = true; throw Object.assign(new Error('Lost response'), { status: 0 }) }
    return generate(...args)
  })
  expect((await state.coordinator.analyzeAndGenerate()).ok).toBe(false)
  expect((await state.coordinator.actions.copy.generate()).ok).toBe(true)
  const calls = state.api.generate.mock.calls.filter(call => call[1] === 'copy')
  expect(calls).toHaveLength(2)
  expect(calls[0][3]).toBe(calls[1][3])
  state.runtime.dispose()
})

test('two tabs use the same server idempotency identity for initial text handoffs', async () => {
  const first = setup(), second = setup()
  await Promise.all([first.coordinator.analyzeAndGenerate(), second.coordinator.analyzeAndGenerate()])
  for (const step of ['copy', 'directions']) {
    const a = first.api.generate.mock.calls.find(call => call[1] === step)
    const b = second.api.generate.mock.calls.find(call => call[1] === step)
    expect(a[3]).toBe(b[3])
    expect(a[3]).toContain('initial')
  }
  first.runtime.dispose(); second.runtime.dispose()
})

describe('explicit Brief → Copy coordination', () => {
  test('saves then analyzes then generates, without clearing another module draft', async () => {
    const { coordinator, runtime, calls, api, onNavigate } = setup()
    runtime.setDirty('banners', true)
    expect(await coordinator.analyzeAndGenerate({ brief: { notes: 'New headphones launch' } })).toEqual({ ok: true })
    expect(calls).toEqual(['save', 'brief', 'copy', 'directions'])
    expect(api.patchCampaign.mock.calls[0][1]).toEqual({ brief: { notes: 'New headphones launch' } })
    expect(onNavigate).not.toHaveBeenCalled()
    expect(api.generate.mock.calls.find(call => call[1] === 'directions')[2]).toEqual({ mode: 'campaign' })
    expect(runtime.hasDirty()).toBe(true)
    runtime.dispose()
  })
  test('failed analysis stops the chain at Brief', async () => {
    const { coordinator, runtime, api, onNavigate } = setup()
    api.generate.mockRejectedValueOnce(Object.assign(new Error('Analysis rejected'), { status: 422, code: 'brief_invalid' }))
    expect(await coordinator.analyzeAndGenerate()).toMatchObject({ ok: false, code: 'brief_invalid' })
    expect(api.generate).toHaveBeenCalledTimes(1)
    expect(onNavigate).not.toHaveBeenCalled()
    expect(runtime.getSnapshot('brief').operation.error.message).toBe('Analysis rejected')
    expect(runtime.getSnapshot('copy').operation.kind).toBe('idle')
    runtime.dispose()
  })
  test('later brief analysis retains existing outputs rather than regenerating them', async () => {
    const { coordinator, runtime, calls } = setup()
    expect(await coordinator.analyzeAndGenerate()).toEqual({ ok: true })
    expect(await coordinator.analyzeAndGenerate()).toEqual({ ok: true })
    expect(calls).toEqual(['brief', 'copy', 'directions', 'brief'])
    runtime.dispose()
  })
  test('retrying uncertain Copy reconciles its original key instead of starting a new analysis', async () => {
    const { coordinator, runtime, api } = setup()
    const original = api.generate.getMockImplementation()
    let failed = false
    api.generate.mockImplementation(async (...args) => {
      if (args[1] === 'copy' && !failed) {
        failed = true
        throw Object.assign(new Error('Copy recovery unavailable'), { status: 503, code: 'generation_recovery_unavailable' })
      }
      return original(...args)
    })
    expect(await coordinator.analyzeAndGenerate()).toMatchObject({ ok: false })
    expect(await coordinator.analyzeAndGenerate()).toEqual({ ok: true })
    expect(api.generate.mock.calls.map(call => call[1])).toEqual(['brief', 'copy', 'copy', 'directions'])
    expect(api.generate.mock.calls[1][3]).toBe(api.generate.mock.calls[2][3])
    runtime.dispose()
  })
  test('file extraction is not a campaign mutation or a dirty reset', async () => {
    const { coordinator, runtime, api } = setup()
    runtime.setDirty('brief', true)
    await expect(coordinator.actions.brief.extractFile({ name: 'brief.txt', data: 'abc' })).resolves.toMatchObject({ text: 'Extracted notes' })
    expect(api.getWorkspace).not.toHaveBeenCalled()
    expect(runtime.hasDirty()).toBe(true)
    runtime.dispose()
  })
  test.each(['brief', 'copy'])('the same submitted patch resumes uncertain %s without saving or replaying preceding stages', async step => {
    const { coordinator, runtime, api, calls } = setup()
    const original = api.generate.getMockImplementation()
    let failed = false
    api.generate.mockImplementation(async (...args) => {
      if (args[1] === step && !failed) { failed = true; throw Object.assign(new Error('Offline'), { status: 0 }) }
      return original(...args)
    })
    const patch = { brief: { notes: 'Submitted campaign notes' } }
    const expectedInputKey = runtime.getSnapshot('brief').inputKey
    expect(await coordinator.actions.brief.submit(patch, { expectedInputKey })).toMatchObject({ ok: false })
    expect(await coordinator.actions.brief.submit(patch, { expectedInputKey })).toEqual({ ok: true })
    expect(calls).toEqual(['save', 'brief', 'copy', 'directions'])
    const attempts = api.generate.mock.calls.filter(call => call[1] === step)
    expect(attempts).toHaveLength(2)
    expect(attempts[0][3]).toBe(attempts[1][3])
    runtime.dispose()
  })
  test('submitting an older draft preserves its captured source key and cannot overwrite newer notes', async () => {
    const { coordinator, runtime, api, workspace } = setup()
    const expectedInputKey = runtime.getSnapshot('brief').inputKey
    workspace.campaign.brief.notes = 'Updated by another editor'
    workspace.campaign.revision += 1
    await runtime.refresh()
    expect(await coordinator.actions.brief.submit({ brief: { notes: 'Old unsaved draft' } }, { expectedInputKey }))
      .toMatchObject({ ok: false, code: 'source_changed' })
    expect(api.patchCampaign).not.toHaveBeenCalled()
    expect(api.generate).not.toHaveBeenCalled()
    runtime.dispose()
  })
  test('a known copy failure does not prevent prompt-only preparation, and retry keeps the prompts', async () => {
    const { coordinator, runtime, api, workspace } = setup()
    const original = api.generate.getMockImplementation()
    let failed = false
    api.generate.mockImplementation(async (...args) => {
      if (args[1] === 'copy' && !failed) { failed = true; throw Object.assign(new Error('Copy rejected'), { status: 422, code: 'generation_failed' }) }
      return original(...args)
    })
    expect(await coordinator.analyzeAndGenerate()).toMatchObject({ ok: false })
    expect(workspace.directions).toHaveLength(3)
    expect(await coordinator.analyzeAndGenerate()).toEqual({ ok: true })
    expect(api.generate.mock.calls.map(call => call[1])).toEqual(['brief', 'copy', 'directions', 'copy'])
    runtime.dispose()
  })
  test('adopts a saved analysis after its response was lost and reconciled', async () => {
    const { coordinator, runtime, api } = setup()
    const original = api.generate.getMockImplementation()
    api.generate.mockImplementationOnce(async (...args) => { await original(...args); throw Object.assign(new Error('Response lost'), { status: 0, jobId: 'analysis-job-1' }) })
    expect(await coordinator.analyzeAndGenerate()).toMatchObject({ ok: false })
    await runtime.refresh()
    expect(await coordinator.analyzeAndGenerate()).toEqual({ ok: true })
    expect(api.generate.mock.calls.map(call => call[1])).toEqual(['brief', 'copy', 'directions'])
    runtime.dispose()
  })
  test('remount resumes only unattempted initial text outputs, never analysis or images', async () => {
    const { runtime, api, workspace } = setup()
    workspace.jobs = structuredClone(makeScenario('copy-ready').workspace.jobs)
    workspace.campaign.brief.analysis = workspace.jobs[0].result.analysis
    await runtime.refresh()
    const coordinator = createWorkflowCoordinator({ runtime })
    await coordinator.resumeInitialDrafts()
    await coordinator.resumeInitialDrafts()
    expect(api.generate.mock.calls.map(call => call[1])).toEqual(['copy', 'directions'])
    runtime.dispose()
  })
  test('a failed create never starts generation or automatically repeats POST', async () => {
    const { api, runtime, actor, templates } = setup()
    api.createCampaign.mockRejectedValueOnce(Object.assign(new Error('Connection lost'), { status: 0 }))
    const onCreated = vi.fn()
    const result = await startCampaign({ api, actor, templates, input: { title: 'Launch', brief: { notes: 'Launch' } }, onCreated })
    expect(result).toMatchObject({ runtime: null, result: { ok: false, code: 'creation_uncertain' } })
    expect(api.createCampaign).toHaveBeenCalledTimes(1)
    expect(onCreated).not.toHaveBeenCalled()
    expect(api.generate).not.toHaveBeenCalled()
    runtime.dispose()
  })
  test('retains the created campaign and its runtime if analysis fails', async () => {
    const { api, runtime, actor, templates } = setup()
    api.generate.mockRejectedValueOnce(Object.assign(new Error('Invalid brief'), { status: 422, code: 'brief_invalid' }))
    const onCreated = vi.fn()
    const created = await startCampaign({ api, actor, templates, input: { title: 'Launch', brief: { notes: 'Launch' } }, onCreated })
    expect(created.campaignId).toBe('campaign-1')
    expect(created.runtime).not.toBeNull()
    expect(created.result).toMatchObject({ ok: false, code: 'brief_invalid' })
    expect(onCreated).toHaveBeenCalledOnce()
    expect(api.createCampaign).toHaveBeenCalledOnce()
    created.runtime.dispose(); runtime.dispose()
  })
})
