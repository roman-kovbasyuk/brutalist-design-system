/**
 * Browser-safe projections of the server-owned workspace contract.
 * These types reuse the API schemas without importing Node's integrity hasher
 * into the browser. Server validation/authorization remain authoritative.
 * @typedef {import('zod').infer<typeof import('../../../shared/studioContracts.js').workspaceRecordSchema>} Workspace
 * @typedef {'brief'|'copy'|'visuals'|'banners'|'review'|'distribute'} ModuleId
 */
export const MODULE_IDS = Object.freeze(['brief', 'copy', 'visuals', 'banners', 'review', 'distribute'])
export const MODULE_LABELS = Object.freeze({
  brief: 'Brief', copy: 'Copy', visuals: 'Visuals', banners: 'Banners', review: 'Review', distribute: 'Distribute',
})

export function assertModuleId(moduleId) {
  if (!MODULE_IDS.includes(moduleId)) throw new TypeError(`Unknown campaign module: ${moduleId}`)
}

/** @param {Workspace} workspace */
export function getSelectedCopy(workspace) {
  const set = workspace.copies.find(item => item.id === workspace.campaign.selectedCopyId && !item.stale)
  return set?.candidates.find(item => item.id === set.selectedCandidateId) ?? null
}

/** @param {Workspace} workspace */
export function getSelectedDirection(workspace) {
  return workspace.directions.find(item => item.id === workspace.campaign.selectedDirectionId
    && !item.stale && item.status === 'ready' && item.previewAssetId) ?? null
}

/** @param {Workspace} workspace */
export function getCurrentVersion(workspace) {
  return workspace.versions.find(item => item.campaignId === workspace.campaign.id
    && item.versionNumber === workspace.campaign.currentVersionNumber) ?? null
}

export function getCurrentReviewHistory(workspace, history) {
  const version = getCurrentVersion(workspace)
  return version && history?.version?.id === version.id
    && history.version.contentHash === version.contentHash ? history : null
}

export function getReviewPhase(workspace) {
  const status = workspace.campaign.status
  return ['in_review', 'changes_requested', 'ready', 'approved', 'delivered'].includes(status) ? status : 'prepare'
}

function getAnalysis(workspace) {
  if (Object.hasOwn(workspace.campaign.brief, 'analysis')) return workspace.campaign.brief.analysis
  // The server supplies result metadata, not private generation input snapshots.
  // This is the latest result for display, NOT proof it matches the current brief.
  // The generation service verifies that prerequisite before accepting copy work.
  const jobs = workspace.jobs.filter(item => item.step === 'brief_analysis'
    && item.status === 'succeeded' && item.result?.analysis)
  return jobs.reduce((latest, item) => !latest || Date.parse(item.createdAt) > Date.parse(latest.createdAt)
    ? item : latest, null)?.result.analysis ?? null
}

/** @param {ModuleId} moduleId @param {Workspace} workspace */
export function projectModuleInput(moduleId, workspace, { templates = [], reviewHistory = null } = {}) {
  assertModuleId(moduleId)
  switch (moduleId) {
    case 'brief': return { brief: workspace.campaign.brief, analysis: getAnalysis(workspace) }
    case 'copy': return {
      brief: workspace.campaign.brief, analysis: getAnalysis(workspace), copies: workspace.copies,
      selectedCopyId: workspace.campaign.selectedCopyId,
      previewAssetId: getSelectedDirection(workspace)?.previewAssetId ?? null,
      previewTemplateId: workspace.composition?.templateId ?? 'editorial-split',
    }
    case 'visuals': return { brief: workspace.campaign.brief, analysis: getAnalysis(workspace), selectedCopy: getSelectedCopy(workspace),
      copies: workspace.copies.filter(set => !set.stale).flatMap(set => set.candidates.map(copy => ({ ...copy,
        approved: (set.approvedCandidateIds ?? []).includes(copy.id) || set.selectedCandidateId === copy.id }))),
      directions: workspace.directions, selectedDirectionId: workspace.campaign.selectedDirectionId }
    case 'banners': return { selectedCopy: getSelectedCopy(workspace), selectedDirection: getSelectedDirection(workspace),
      copies: workspace.copies.filter(set => !set.stale).flatMap(set => set.candidates
        .filter(copy => (set.approvedCandidateIds ?? []).includes(copy.id) || (workspace.campaign.selectedCopyId === set.id && set.selectedCandidateId === copy.id))
        .map(copy => ({ ...copy, copySetId: set.id }))),
      directions: workspace.directions.filter(direction => !direction.stale && direction.status === 'ready' && direction.previewAssetId)
        .map(direction => ({ ...direction, copy: !direction.scope || direction.scope === 'legacy' ? getSelectedCopy(workspace) : direction.copy })),
      templates, composition: workspace.composition }
    case 'review': return { phase: getReviewPhase(workspace), composition: workspace.composition,
      version: getCurrentVersion(workspace), history: getCurrentReviewHistory(workspace, reviewHistory),
      nextVersionNumber: workspace.campaign.currentVersionNumber + 1 }
    case 'distribute': {
      const version = ['approved', 'delivered'].includes(workspace.campaign.status) ? getCurrentVersion(workspace) : null
      const delivery = version && workspace.delivery?.versionId === version.id
        && workspace.delivery.campaignId === workspace.campaign.id
        && workspace.delivery.contentHash === version.contentHash ? workspace.delivery : null
      return { version, delivery }
    }
  }
}

/** Stable comparison key, not a security hash or server revision. */
export function stableInputKey(value) {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
}

/** Display-only updates must not turn a saved editor source into a conflict. */
export function moduleInputKey(moduleId, input) {
  assertModuleId(moduleId)
  switch (moduleId) {
    case 'brief': return stableInputKey(input.brief)
    case 'copy': return stableInputKey({ brief: input.brief, copies: input.copies, selectedCopyId: input.selectedCopyId })
    case 'banners': return stableInputKey({ selectedCopy: input.selectedCopy, copies: input.copies,
      selectedDirection: input.selectedDirection, directions: input.directions, composition: input.composition })
    case 'review': return stableInputKey(input.phase !== 'prepare' && input.version
      ? { id: input.version.id, contentHash: input.version.contentHash } : input.composition)
    default: return stableInputKey(input)
  }
}
