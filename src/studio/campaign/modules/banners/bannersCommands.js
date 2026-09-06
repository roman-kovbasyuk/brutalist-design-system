import { stableInputKey } from '../../moduleContracts.js'
import { designIdentity } from './bannerSelection.js'

export function createBannersCommands(runtime) {
  return Object.freeze({
    loadTemplateVersion: (id, version) => runtime.read(({ api, signal }) => api.getTemplateVersion(id, version, { signal })),
    saveBatch: async (input, { expectedInputKey = runtime.getSnapshot('banners').inputKey } = {}) => {
      let savedComposition, failureDetails
      const result = await runtime.execute('banners', 'saveBatch', async ({ api, workspace }) => {
        let saved
        try { saved = await api.saveBannerBatch(workspace.campaign.id, input, workspace.campaign.revision) }
        catch (error) { failureDetails = error.details; throw error }
        if (!saved?.composition) throw new Error('The saved banner selection could not be verified. Check latest state before continuing.')
        savedComposition = saved.composition
      }, { expectedInputKey, intent: input, reconcile: ({ current }) => {
        const composition = current.composition
        return composition && !composition.stale && composition.validation.valid
          && stableInputKey(composition.designs?.map(designIdentity)) === stableInputKey(input.designs)
          && stableInputKey(composition.ratioIds) === stableInputKey(input.ratioIds) ? 'applied' : 'unknown'
      } })
      // Bind the confirmation to the server response, never a later workspace refresh.
      return result.ok ? { ...result, reviewInputKey: stableInputKey(savedComposition) }
        : { ...result, ...(failureDetails ? { details: failureDetails } : {}) }
    },
    save: (input, { expectedInputKey = runtime.getSnapshot('banners').inputKey } = {}) => runtime.execute('banners', 'save', async ({ api, workspace }) => {
      await api.saveComposition(workspace.campaign.id, input, workspace.campaign.revision)
    }, { expectedInputKey, intent: input, reconcile: ({ current }) => {
      const composition = current.composition
      return composition && ['templateId', 'templateVersion', 'ratioIds', 'slotValues'].every(key =>
        stableInputKey(composition[key]) === stableInputKey(input[key])) ? 'applied' : 'unknown'
    } }),
  })
}
