import { stableInputKey } from '../../moduleContracts.js'

const normalizedBrief = brief => ({ ...Object.fromEntries(['product', 'audience', 'objective', 'offer', 'locale', 'notes']
  .map(key => [key, (brief[key] ?? (key === 'locale' ? 'auto' : '')).trim()])), analysis: brief.analysis ?? null })

export function createBriefCommands(runtime) {
  return Object.freeze({
    save: (patch, { expectedInputKey = runtime.getSnapshot('brief').inputKey } = {}) => runtime.execute('brief', 'save', async ({ api, workspace }) => {
      if (!patch?.brief) throw Object.assign(new Error('A brief is required.'), { status: 422, code: 'brief_required' })
      // Title edits belong to the shell; drafting a brief must not rename it.
      await api.patchCampaign(workspace.campaign.id, { brief: patch.brief }, workspace.campaign.revision)
    }, { expectedInputKey, intent: patch?.brief,
      reconcile: ({ current }) => patch?.brief && stableInputKey(normalizedBrief(current.campaign.brief)) === stableInputKey(normalizedBrief(patch.brief)) ? 'applied' : 'unknown' }),
    analyze: ({ expectedInputKey = runtime.getSnapshot('brief').inputKey, instruction } = {}) => runtime.execute('brief', 'analyze', async ({ api, workspace, idempotencyKey, waitForJob }) => {
      await waitForJob(await api.generate(workspace.campaign.id, 'brief', { expectedRevision: workspace.campaign.revision, ...(instruction ? { instruction } : {}) }, idempotencyKey))
    }, { expectedInputKey, idempotent: true, intent: instruction ?? null }),
    extractFile: input => runtime.read(({ api }) => api.extractBriefFile(input)),
  })
}
