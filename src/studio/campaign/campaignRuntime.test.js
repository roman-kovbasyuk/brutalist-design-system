import { describe, expect, test, vi } from 'vitest'
import { createCampaignRuntime } from './campaignRuntime.js'
import { makeScenario } from './testing/workspaceFixtures.js'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function setup(name = 'composed', apiOverrides = {}) {
  const scenario = makeScenario(name)
  const api = { getWorkspace: vi.fn(async () => structuredClone(scenario.workspace)),
    getReview: vi.fn(async () => scenario.reviewHistory), ...apiOverrides }
  const runtime = createCampaignRuntime({ ...scenario, api })
  return { ...scenario, api, runtime }
}

describe('campaign runtime isolation', () => {
  test('title-only refresh retains editor input identity and dirty ownership', async () => {
    const { runtime, workspace } = setup()
    const before = runtime.getSnapshot('banners')
    runtime.setDirty('banners', true)
    workspace.campaign.title = 'Renamed'
    workspace.campaign.revision += 1
    await runtime.refresh()
    expect(runtime.getSnapshot('banners')).toBe(before)
    expect(runtime.hasDirty()).toBe(true)
    runtime.dispose()
  })
  test('saving another module cannot clear the banner dirty flag', async () => {
    const { runtime } = setup()
    runtime.setDirty('brief', true)
    runtime.setDirty('banners', true)
    runtime.setDirty('brief', false)
    expect(runtime.hasDirty()).toBe(true)
    runtime.dispose()
  })
  test('older refresh responses cannot overwrite newer workspace data', async () => {
    const first = deferred(), second = deferred()
    const { runtime, workspace } = setup('draft', { getWorkspace: vi.fn()
      .mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise) })
    const oldLoad = runtime.refresh(), newLoad = runtime.refresh()
    const newer = structuredClone(workspace)
    newer.campaign.brief.notes = 'New server notes'
    newer.campaign.revision = 2
    second.resolve(newer)
    await newLoad
    first.resolve(workspace)
    await oldLoad
    expect(runtime.getSnapshot('brief').input.brief.notes).toBe('New server notes')
    runtime.dispose()
  })
  test('malformed or wrong-campaign responses leave the last good snapshot intact', async () => {
    const { runtime, workspace, api } = setup('draft')
    const before = runtime.getSnapshot('brief')
    api.getWorkspace.mockResolvedValueOnce({ ...workspace, copies: null })
    await expect(runtime.refresh()).rejects.toMatchObject({ code: 'invalid_workspace' })
    api.getWorkspace.mockResolvedValueOnce({ ...workspace, campaign: { ...workspace.campaign, id: 'another-campaign' } })
    await expect(runtime.refresh()).rejects.toMatchObject({ code: 'invalid_workspace' })
    expect(runtime.getSnapshot('brief')).toBe(before)
    runtime.dispose()
  })
  test('module input cannot mutate the authoritative snapshot', () => {
    const { runtime } = setup()
    expect(() => { runtime.getSnapshot('banners').input.composition.slotValues.headline = 'Injected edit' }).toThrow()
    expect(runtime.getSnapshot('banners').input.composition.slotValues.headline).toBe('Find your quiet')
    runtime.dispose()
  })
  test('an in-flight write excludes a second write, not module reads', async () => {
    const saving = deferred()
    const { runtime } = setup()
    const first = runtime.execute('banners', 'save', () => saving.promise)
    expect(runtime.getSnapshot('banners').operation.kind).toBe('running')
    expect(runtime.getSnapshot('brief').access.canVisit).toBe(true)
    let secondSent = false
    const second = await runtime.execute('copy', 'select', async () => { secondSent = true })
    expect(second).toMatchObject({ ok: false, code: 'campaign_busy' })
    expect(secondSent).toBe(false)
    saving.resolve()
    expect(await first).toEqual({ ok: true })
    runtime.dispose()
  })
  test('a revision conflict stays local and retains the unsaved draft', async () => {
    const { runtime } = setup()
    runtime.setDirty('banners', true)
    const before = runtime.getSnapshot('copy')
    const result = await runtime.execute('banners', 'save', async () => {
      throw Object.assign(new Error('Source changed'), { status: 409, code: 'revision_conflict', requestId: 'request-1' })
    })
    expect(result).toMatchObject({ ok: false, code: 'revision_conflict' })
    expect(runtime.getSnapshot('banners').operation).toMatchObject({ kind: 'failed', error: { requestId: 'request-1' } })
    expect(runtime.getSnapshot('copy')).toBe(before)
    expect(runtime.hasDirty()).toBe(true)
    runtime.dispose()
  })
  test('a changed source prevents sending the old intent with a bumped revision', async () => {
    const { runtime, workspace } = setup()
    const expectedInputKey = runtime.getSnapshot('banners').inputKey
    workspace.composition.slotValues.headline = 'Changed by another person'
    workspace.campaign.revision += 1
    await runtime.refresh()
    let sent = false
    const result = await runtime.execute('banners', 'save', async () => { sent = true }, { expectedInputKey })
    expect(result).toMatchObject({ ok: false, code: 'source_changed' })
    expect(sent).toBe(false)
    runtime.dispose()
  })
  test('ambiguous idempotent retry uses the same key and original revision', async () => {
    const { runtime, workspace } = setup()
    const received = []
    const operation = async ({ idempotencyKey, workspace: source }) => {
      received.push({ key: idempotencyKey, revision: source.campaign.revision })
      if (received.length === 1) throw Object.assign(new Error('Connection lost'), { status: 0 })
    }
    const options = { intent: { templateId: 'editorial-split' }, idempotent: true }
    expect(await runtime.execute('banners', 'save', operation, options)).toMatchObject({ ok: false })
    workspace.campaign.revision = 9
    await runtime.refresh()
    expect(await runtime.execute('banners', 'save', operation, options)).toEqual({ ok: true })
    expect(received).toHaveLength(2)
    expect(received[1]).toEqual(received[0])
    runtime.dispose()
  })
  test('an ambiguous non-idempotent mutation cannot be blindly sent again', async () => {
    const { runtime } = setup()
    let sent = 0
    const operation = async () => { sent += 1; throw Object.assign(new Error('Connection lost'), { status: 0 }) }
    await runtime.execute('brief', 'save', operation)
    const retry = await runtime.execute('brief', 'save', operation)
    expect(retry).toMatchObject({ ok: false, code: 'reconciliation_required' })
    expect(sent).toBe(1)
    runtime.dispose()
  })
  test('successful write followed by refresh failure is reconciled without replaying it', async () => {
    const { runtime, api, workspace } = setup()
    api.getWorkspace.mockRejectedValueOnce(new Error('Offline'))
    let sent = 0
    const operation = async () => { sent += 1 }
    expect(await runtime.execute('banners', 'save', operation)).toMatchObject({ ok: false, code: 'refresh_failed' })
    expect(runtime.getSnapshot('banners').operation.kind).toBe('uncertain')
    workspace.campaign.revision += 1
    await runtime.refresh()
    expect(runtime.getSnapshot('banners').operation.kind).toBe('idle')
    expect(sent).toBe(1)
    runtime.dispose()
  })
  test('disposal prevents a delayed response from publishing into another scope', async () => {
    const response = deferred()
    const { runtime, workspace } = setup('draft', { getWorkspace: () => response.promise })
    const before = runtime.getSnapshot('brief')
    const loaded = runtime.refresh()
    runtime.dispose()
    workspace.campaign.brief.notes = 'Too late'
    response.resolve(workspace)
    await loaded
    expect(runtime.getSnapshot('brief')).toBe(before)
    await expect(runtime.execute('brief', 'save', async () => {})).resolves.toMatchObject({ ok: false, code: 'disposed' })
  })
  test('an acknowledged write waits for the refresh that superseded its own', async () => {
    const first = deferred(), second = deferred()
    const { runtime, workspace, api } = setup()
    api.getWorkspace.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    let completed = false
    const writing = runtime.execute('banners', 'save', async () => {}).then(value => { completed = true; return value })
    await vi.waitFor(() => expect(api.getWorkspace).toHaveBeenCalledTimes(1))
    const external = runtime.refresh()
    first.resolve(workspace)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(completed).toBe(false)
    const next = structuredClone(workspace)
    next.campaign.revision += 1
    second.resolve(next)
    await external
    expect(await writing).toEqual({ ok: true })
    let revision
    api.getWorkspace.mockResolvedValue(next)
    await runtime.execute('banners', 'save', async ({ workspace: source }) => { revision = source.campaign.revision })
    expect(revision).toBe(next.campaign.revision)
    runtime.dispose()
  })
  test('provider recovery 503 keeps the original idempotency key', async () => {
    const { runtime } = setup()
    const keys = []
    const operation = async ({ idempotencyKey }) => {
      keys.push(idempotencyKey)
      if (keys.length === 1) throw Object.assign(new Error('Provider recovery unavailable'), { status: 503, code: 'generation_recovery_unavailable' })
    }
    const options = { idempotent: true, intent: { count: 5 } }
    await runtime.execute('copy', 'generate', operation, options)
    expect(runtime.getSnapshot('copy').operation.kind).toBe('uncertain')
    await runtime.execute('copy', 'generate', operation, options)
    expect(keys[1]).toBe(keys[0])
    runtime.dispose()
  })
  test('a module can reconcile an uncertain revision-protected save against authoritative data', async () => {
    const { runtime, workspace } = setup()
    const reconcile = vi.fn(({ current }) => current.campaign.brief.notes === 'Saved notes' ? 'applied' : 'unknown')
    await runtime.execute('brief', 'save', async () => { throw Object.assign(new Error('Offline'), { status: 0 }) }, { reconcile })
    await runtime.refresh()
    expect(runtime.getSnapshot('brief').operation.kind).toBe('uncertain')
    workspace.campaign.brief.notes = 'Saved notes'
    workspace.campaign.revision += 1
    await runtime.refresh()
    expect(reconcile).toHaveBeenCalled()
    expect(runtime.getSnapshot('brief').operation.kind).toBe('idle')
    expect(await runtime.execute('brief', 'save', async () => {})).toEqual({ ok: true })
    runtime.dispose()
  })
  test('initial review history loads without a full workspace refresh', async () => {
    const scenario = makeScenario('in-review')
    const api = { getWorkspace: vi.fn(), getReview: vi.fn(async () => scenario.reviewHistory) }
    const runtime = createCampaignRuntime({ ...scenario, reviewHistory: null, api })
    await vi.waitFor(() => expect(runtime.getSnapshot('review').input.history).toEqual(scenario.reviewHistory))
    expect(api.getWorkspace).not.toHaveBeenCalled()
    runtime.dispose()
  })
  test('history failure is local to Review and does not discard updated workspace data', async () => {
    const { runtime, workspace, api } = setup('in-review')
    workspace.campaign.brief.notes = 'Server update'
    workspace.campaign.revision += 1
    api.getReview.mockRejectedValue(new Error('History offline'))
    await runtime.refresh({ review: true })
    expect(runtime.getSnapshot('brief').input.brief.notes).toBe('Server update')
    expect(runtime.getSnapshot('review').input.history).toBeNull()
    expect(runtime.getSnapshot('review').operation).toMatchObject({ kind: 'failed', actionId: 'history' })
    runtime.dispose()
  })
  test('workspace completion settles an observed job even before its poll returns', async () => {
    const pending = deferred()
    const { runtime, workspace } = setup('draft', { getJob: () => pending.promise })
    workspace.jobs = [{ id: 'analysis-1', step: 'brief_analysis', status: 'pending' }]
    await runtime.refresh()
    expect(runtime.getSnapshot('brief').operation.kind).toBe('running')
    workspace.jobs[0].status = 'succeeded'
    await runtime.refresh()
    expect(runtime.getSnapshot('brief').operation.kind).toBe('idle')
    runtime.dispose()
  })
  test('a generation response received after disposal does not start waiting', async () => {
    const response = deferred()
    const { runtime } = setup()
    const writing = runtime.execute('copy', 'generate', async ({ waitForJob }) => waitForJob(await response.promise))
    runtime.dispose()
    response.resolve({ job: { id: 'late-job', status: 'pending' } })
    let result
    writing.then(value => { result = value })
    await vi.waitFor(() => expect(result).toMatchObject({ ok: false, code: 'disposed' }), { timeout: 100 })
  })
  test('asset reads end with campaign lifetime even when they have their own signal', async () => {
    const controller = new AbortController()
    const { runtime, api } = setup('draft', { getAssetBlob: vi.fn(async () => new Blob()) })
    await runtime.assets.getAssetBlob('asset-1', { signal: controller.signal })
    const signal = api.getAssetBlob.mock.calls[0][1].signal
    runtime.dispose()
    expect(signal.aborted).toBe(true)
  })
  test.each(['succeeded', 'failed', 'blocked'])('an authoritative %s job resolves its uncertain command without another generation', async status => {
    const { runtime, workspace } = setup('copy-ready', { getJob: async () => { throw new Error('Poll offline') } })
    const generate = vi.fn(async ({ waitForJob }) => waitForJob({ job: { id: 'job-1', status: 'pending' } }))
    await runtime.execute('copy', 'generate', generate, { idempotent: true })
    expect(runtime.getSnapshot('copy').operation.kind).toBe('uncertain')
    workspace.jobs.push({ id: 'job-1', step: 'copy', status })
    await runtime.refresh()
    expect(runtime.getSnapshot('copy').operation.kind).toBe(status === 'succeeded' ? 'idle' : 'failed')
    expect(await runtime.execute('brief', 'save', async () => {})).toEqual({ ok: true })
    expect(generate).toHaveBeenCalledTimes(1)
    runtime.dispose()
  })
  test('disposal during post-write refresh cannot report success to an obsolete scope', async () => {
    const response = deferred()
    const { runtime, workspace, api } = setup('draft', { getWorkspace: vi.fn(() => response.promise) })
    const writing = runtime.execute('brief', 'save', async () => {})
    await vi.waitFor(() => expect(api.getWorkspace).toHaveBeenCalled())
    runtime.dispose()
    response.resolve(workspace)
    expect(await writing).toMatchObject({ ok: false, code: 'disposed' })
  })
  test('a 120-second observation timeout remains uncertain and blocks a new generation', async () => {
    vi.useFakeTimers()
    const pending = { id: 'job-1', status: 'pending' }
    const { runtime, workspace } = setup('copy-ready', { getJob: async () => pending })
    try {
      const writing = runtime.execute('copy', 'generate', async ({ waitForJob }) => waitForJob({ job: pending }), { idempotent: true })
      await vi.advanceTimersByTimeAsync(120000)
      expect(await writing).toMatchObject({ ok: false, code: 'generation_pending' })
      workspace.jobs.push({ ...pending, step: 'copy' })
      await runtime.refresh()
      const next = vi.fn()
      expect(await runtime.execute('copy', 'generate', next, { idempotent: true })).toMatchObject({ ok: false, code: 'generation_unresolved' })
      expect(next).not.toHaveBeenCalled()
    } finally { runtime.dispose(); vi.useRealTimers() }
  })
})
