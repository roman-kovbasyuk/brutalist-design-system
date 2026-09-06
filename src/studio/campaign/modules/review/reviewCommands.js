import { getCurrentReviewHistory, getCurrentVersion } from '../../moduleContracts.js'

const error = (code, message) => Object.assign(new Error(message), { code, status: 409 })

// Browser-safe mirror of the request envelope. The server schemas and authorization
// remain authoritative; this only prevents known-invalid drafts reaching the network.
function validFeedback(input) {
  return input && Object.keys(input).length === 1 && typeof input.comment === 'string'
    && input.comment.trim().length > 0 && input.comment.trim().length <= 2_000
    ? { comment: input.comment.trim() } : null
}

function validFigmaUrl(value) {
  if (typeof value !== 'string' || value.trim().length > 2_000) return false
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
      && (url.hostname.toLowerCase() === 'figma.com' || url.hostname.toLowerCase().endsWith('.figma.com'))
  } catch { return false }
}

function validReadyEvidence(input) {
  const keys = ['copyAccuracy', 'layoutQuality', 'exportReadiness']
  return input && Object.keys(input).length === 2 && validFigmaUrl(input.figmaUrl)
    && input.checklistAnswers && Object.keys(input.checklistAnswers).length === keys.length
    && keys.every(key => input.checklistAnswers[key] === true)
    ? { figmaUrl: input.figmaUrl.trim(), checklistAnswers: Object.fromEntries(keys.map(key => [key, true])) } : null
}

function currentReview(workspace, phase) {
  if (workspace.campaign.status !== phase) throw error('review_phase_changed', 'The review phase changed. Reload before continuing.')
  const version = getCurrentVersion(workspace)
  if (!version) throw error('version_not_current', 'The current review version is unavailable.')
  return version
}

function currentHistory(workspace, history, phase) {
  const version = currentReview(workspace, phase)
  const value = getCurrentReviewHistory(workspace, history)
  if (!value || value.status !== phase || value.events.some(event => event.versionId !== version.id || event.campaignId !== workspace.campaign.id)) {
    throw error('invalid_review_history', 'The current review history is unavailable or mismatched.')
  }
  return version
}

export function createReviewCommands(runtime) {
  const expected = options => options?.expectedInputKey ?? runtime.getSnapshot('review').inputKey
  const reviewAction = (actionId, phase, apiAction, input, options, validate, invalid) => runtime.execute('review', actionId, async ({ api, workspace, idempotencyKey }) => {
    const version = currentHistory(workspace, runtime.getSnapshot('review').input.history, phase)
    const parsed = validate?.(input)
    if (validate && !parsed) throw error(invalid.code, invalid.message)
    await api.review(version.id, apiAction, parsed ?? input, workspace.campaign.revision, idempotencyKey)
  }, { expectedInputKey: expected(options), idempotent: true, intent: input })

  return Object.freeze({
    createVersion: (options = {}) => runtime.execute('review', 'createVersion', async ({ api, workspace, idempotencyKey }) => {
      if (workspace.campaign.status !== 'composed' || workspace.campaign.openVersionId) {
        throw error('review_phase_changed', 'The campaign is no longer ready to create this version.')
      }
      await api.createVersion(workspace.campaign.id, {}, workspace.campaign.revision, idempotencyKey)
    }, { expectedInputKey: expected(options), idempotent: true }),
    markReady: (input, options = {}) => reviewAction('markReady', 'in_review', 'mark-ready', input, options,
      validReadyEvidence, { code: 'invalid_review_evidence', message: 'A Figma link and all designer checks are required.' }),
    requestChanges: (comment, options = {}) => reviewAction('requestChanges', 'in_review', 'request-changes', { comment }, options,
      validFeedback, { code: 'feedback_required', message: 'Describe the requested change.' }),
    approve: (options = {}) => reviewAction('approve', 'ready', 'approve', {}, options),
    reject: (comment, options = {}) => reviewAction('reject', 'ready', 'reject', { comment }, options,
      validFeedback, { code: 'feedback_required', message: 'Describe the requested change.' }),
    reopen: (options = {}) => runtime.execute('review', 'reopen', async ({ api, workspace, idempotencyKey }) => {
      currentHistory(workspace, runtime.getSnapshot('review').input.history, 'changes_requested')
      if (workspace.campaign.openVersionId) throw error('version_not_current', 'The review version must be closed before reopening.')
      await api.reopen(workspace.campaign.id, workspace.campaign.revision, idempotencyKey)
    }, { expectedInputKey: expected(options), idempotent: true }),
  })
}
