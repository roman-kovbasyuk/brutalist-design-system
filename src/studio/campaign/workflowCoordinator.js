import { createCampaignRuntime } from './campaignRuntime.js'
import { createBriefCommands } from './modules/brief/briefCommands.js'
import { createCopyCommands } from './modules/copy/copyCommands.js'
import { createVisualsCommands } from './modules/visuals/visualsCommands.js'
import { createBannersCommands } from './modules/banners/bannersCommands.js'
import { createReviewCommands } from './modules/review/reviewCommands.js'
import { createDistributeCommands } from './modules/distribute/distributeCommands.js'
import { stableInputKey } from './moduleContracts.js'
import { rawBrief } from '../../../shared/briefAnalysis.js'

/** Cross-module sequencing lives here, never inside a view or the page shell. */
export function createWorkflowCoordinator({ runtime }) {
  const brief = createBriefCommands(runtime), copy = createCopyCommands(runtime)
  const visuals = createVisualsCommands(runtime)
  let sequencing = false, incomplete = null
  async function analyzeAndGenerate(patch, { expectedInputKey = runtime.getSnapshot('brief').inputKey } = {}) {
    if (sequencing) return { ok: false, code: 'campaign_busy', message: 'The brief is already being processed.' }
    sequencing = true
    try {
      const identity = stableInputKey(patch ?? null)
      const resumed = incomplete?.identity === identity
      if (!resumed) {
        if (incomplete && ['brief', 'copy', 'visuals'].some(id => runtime.getSnapshot(id).operation.kind === 'uncertain')) {
          return { ok: false, code: 'reconciliation_required', message: 'Resolve the previous submission before changing its input.' }
        }
        if (patch) {
          const saved = await brief.save(patch, { expectedInputKey })
          if (!saved.ok) return saved
          runtime.setDirty('brief', false)
        }
        incomplete = { identity, sourceKey: runtime.getSnapshot('brief').inputKey, stage: 'analysis',
          rawSource: stableInputKey(rawBrief(runtime.getSnapshot('brief').input.brief)),
          knownJobs: await runtime.read(({ workspace }) => workspace.jobs.map(job => job.id)) }
      }
      if (incomplete.stage === 'analysis' && runtime.getSnapshot('brief').operation.kind !== 'uncertain') {
        const recovered = await runtime.read(({ workspace }) => stableInputKey(rawBrief(workspace.campaign.brief)) === incomplete.rawSource
          && workspace.jobs.some(job => !incomplete.knownJobs.includes(job.id) && job.step === 'brief_analysis' && job.status === 'succeeded'
            && job.result?.analysis && stableInputKey(job.result.analysis) === stableInputKey(workspace.campaign.brief.analysis)))
        if (recovered) { incomplete.stage = 'drafts'; incomplete.sourceKey = runtime.getSnapshot('brief').inputKey }
      }
      const sourceKey = incomplete.sourceKey
      if (runtime.getSnapshot('brief').inputKey !== sourceKey && runtime.getSnapshot('brief').operation.kind !== 'uncertain') {
        return { ok: false, code: 'source_changed', message: 'The brief changed during analysis. Analyze the current brief before generating copy.' }
      }
      if (incomplete.stage === 'analysis') {
        const analyzed = await brief.analyze({ expectedInputKey: sourceKey })
        if (!analyzed.ok) return analyzed
        incomplete.stage = 'drafts'
        // The server has atomically saved the new analysis into the brief.
        incomplete.sourceKey = runtime.getSnapshot('brief').inputKey
      }
      if (runtime.getSnapshot('brief').inputKey !== incomplete.sourceKey) {
        return { ok: false, code: 'source_changed', message: 'The brief changed during analysis. Analyze the current brief before generating copy.' }
      }
      let failure = null
      // Serialize shared writes, but do not make either output a prerequisite
      // for its sibling. Historical outputs count even when stale or deleted.
      for (const [id, step, action] of [['copy', 'copy', copy.generate], ['visuals', 'directions', visuals.preparePrompts]]) {
        const exists = await runtime.read(({ workspace }) => (id === 'copy' ? workspace.copies : workspace.directions).length > 0
          || workspace.jobs.some(job => job.step === step && job.status === 'succeeded'))
        if (exists) continue
        if (runtime.getSnapshot('brief').inputKey !== incomplete.sourceKey) return { ok: false, code: 'source_changed', message: 'The brief changed. Review it before continuing.' }
        const result = await action({ initial: true })
        if (!result.ok) {
          failure ??= result
          // An uncertain paid request owns the runtime until reconciliation.
          if (runtime.getSnapshot(id).operation.kind === 'uncertain') return result
        }
      }
      if (!failure) incomplete = null
      return failure ? { ...failure, briefSaved: true } : { ok: true }
    } finally { sequencing = false }
  }
  const regenerateCopy = () => copy.generate()
  const review = createReviewCommands(runtime)
  async function resumeInitialDrafts() {
    if (sequencing || runtime.isBusy() || runtime.hasDirty() || !runtime.getSnapshot('brief').input.analysis
      || !runtime.getSnapshot('brief').access.canEdit) return
    sequencing = true
    try {
      for (const [id, step, action] of [['copy', 'copy', copy.generate], ['visuals', 'directions', visuals.preparePrompts]]) {
        // A durable attempt (including failed/unknown) belongs to that module's
        // retry UI. Reopening a page must not start another paid attempt for it.
        const attempted = await runtime.read(({ workspace }) => workspace.jobs.some(job => job.step === step)
          || (id === 'copy' ? workspace.copies : workspace.directions).length > 0)
        if (!attempted) await action({ initial: true })
      }
    } finally { sequencing = false }
  }
  function observeInitialDrafts() {
    const resume = () => { void resumeInitialDrafts().catch(() => {}) }
    const stops = ['brief', 'copy', 'visuals'].map(id => runtime.subscribe(id, resume))
    resume()
    return () => stops.forEach(stop => stop())
  }
  return Object.freeze({ actions: Object.freeze({
    brief: Object.freeze({ ...brief, submit: analyzeAndGenerate,
      refine: (instruction, options = {}) => brief.analyze({ ...options, instruction }) }),
    copy: Object.freeze({ ...copy, regenerate: regenerateCopy }),
    visuals,
    banners: Object.freeze({ ...createBannersCommands(runtime), prepareReview: options => review.createVersion(options) }),
    review,
    distribute: createDistributeCommands(runtime),
  }), analyzeAndGenerate, regenerateCopy, resumeInitialDrafts, observeInitialDrafts })
}

/** Never retry non-idempotent campaign creation automatically. */
export async function startCampaign({ api, actor, templates, input, onCreated = () => {}, onNavigate, onCampaignChange }) {
  let campaign, runtime = null
  try {
    campaign = await api.createCampaign(input)
    onCreated(campaign)
    const workspace = await api.getWorkspace(campaign.id)
    runtime = createCampaignRuntime({ api, actor, templates, workspace, onCampaignChange })
    const result = await createWorkflowCoordinator({ runtime, onNavigate }).analyzeAndGenerate()
    return { campaignId: campaign.id, runtime, result }
  } catch (error) {
    const uncertain = !campaign && (error.status === undefined || error.status === 0 || error.status >= 500)
    return { campaignId: campaign?.id ?? null, runtime, result: { ok: false,
      code: uncertain ? 'creation_uncertain' : error.code ?? 'request_failed',
      message: uncertain ? 'Creation may have completed. Check the campaign list before creating another campaign.' : error.message } }
  }
}
