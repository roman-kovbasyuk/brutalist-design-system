import { getSelectedCopy } from '../../moduleContracts.js'

const currentCandidate = (workspace, id) => workspace.copies.some(set => !set.stale && set.candidates.some(copy => copy.id === id))
const assertCandidate = (workspace, id) => {
  if (!currentCandidate(workspace, id)) throw Object.assign(new Error('This copy option is no longer available.'), { code: 'copy_unavailable', status: 409 })
}

export function createCopyCommands(runtime) {
  return Object.freeze({
    generate: ({ initial = false } = {}) => runtime.execute('copy', 'generate', async ({ api, workspace, idempotencyKey, waitForJob }) => {
      await waitForJob(await api.generate(workspace.campaign.id, 'copy', {}, idempotencyKey))
    }, { expectedInputKey: runtime.getSnapshot('copy').inputKey, idempotent: true,
      // Server idempotency is already scoped to actor, campaign and step.
      idempotencyKey: initial ? 'initial-copy-v1' : undefined }),
    approve: copyId => runtime.execute('copy', 'approve', async ({ api, workspace }) => {
      assertCandidate(workspace, copyId)
      await api.approveCopy(workspace.campaign.id, copyId, workspace.campaign.revision)
    }, { expectedInputKey: runtime.getSnapshot('copy').inputKey, intent: { copyId },
      reconcile: ({ source, current }) => {
        const restoresSelection = !source.campaign.selectedCopyId && source.copies.some(set => !set.stale && set.approvedCandidateIds?.includes(copyId))
        const applied = restoresSelection ? getSelectedCopy(current)?.id === copyId
          : current.copies.some(set => !set.stale && set.approvedCandidateIds?.includes(copyId))
        return applied ? 'applied' : 'unknown'
      } }),
    select: copyId => runtime.execute('copy', 'select', async ({ api, workspace }) => {
      assertCandidate(workspace, copyId)
      await api.selectCopy(workspace.campaign.id, { copyId }, workspace.campaign.revision)
    }, { expectedInputKey: runtime.getSnapshot('copy').inputKey, intent: { copyId },
      reconcile: ({ current }) => getSelectedCopy(current)?.id === copyId ? 'applied' : 'unknown' }),
    remove: copyId => runtime.execute('copy', 'remove', async ({ api, workspace }) => {
      assertCandidate(workspace, copyId)
      await api.deleteCopy(workspace.campaign.id, copyId, workspace.campaign.revision)
    }, { expectedInputKey: runtime.getSnapshot('copy').inputKey, intent: { copyId },
      reconcile: ({ source, current }) => current.campaign.revision > source.campaign.revision
        && !current.copies.some(set => set.candidates.some(copy => copy.id === copyId)) ? 'applied' : 'unknown' }),
  })
}
