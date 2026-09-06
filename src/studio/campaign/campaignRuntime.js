import { MODULE_IDS, assertModuleId, projectModuleInput, moduleInputKey, stableInputKey,
  getCurrentVersion } from './moduleContracts.js'
import { deriveWorkflowState } from './workflowState.js'
import { observeJob } from './jobObserver.js'

const idle = Object.freeze({ kind: 'idle', actionId: null, jobId: null, error: null })
const failure = (code, message) => Object.assign(new Error(message), { code })
const resultError = error => ({ ok: false, code: error.code ?? 'request_failed', message: error.message })
const jobOwner = { brief_analysis: 'brief', copy: 'copy', directions: 'visuals', image: 'visuals' }

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

function share(previous, next) {
  if (Object.is(previous, next)) return previous
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object'
    || Array.isArray(previous) !== Array.isArray(next)) return freeze(next)
  const keys = Object.keys(next)
  let unchanged = Object.keys(previous).length === keys.length
  const merged = Array.isArray(next) ? [] : {}
  for (const key of keys) {
    merged[key] = share(previous[key], next[key])
    if (!Object.hasOwn(previous, key) || merged[key] !== previous[key]) unchanged = false
  }
  return unchanged ? previous : Object.freeze(merged)
}

function scopedWorkspace(value, campaignId) {
  if (!value || value.campaign?.id !== campaignId || !Number.isSafeInteger(value.campaign.revision)
    || value.campaign.revision < 0 || !value.campaign.brief
    || !['copies', 'directions', 'versions', 'jobs'].every(key => Array.isArray(value[key]))
    || !Object.hasOwn(value, 'composition') || !Object.hasOwn(value, 'delivery')) {
    throw failure('invalid_workspace', 'The server returned an invalid campaign workspace.')
  }
  // Artifact schemas and integrity hashes are validated by the server. This
  // browser boundary validates identity/envelope before atomically projecting it.
  return freeze(structuredClone(value))
}

/** Campaign/actor-scoped state. Views receive projections, not this API client. */
export function createCampaignRuntime({ api, actor, templates = [], workspace: initial,
  reviewHistory = null, onCampaignChange = () => {} }) {
  const campaignId = initial?.campaign?.id
  if (!campaignId || !actor?.id) throw failure('invalid_scope', 'A campaign and signed-in actor are required.')
  const scopeActor = freeze(structuredClone(actor))
  const scopeTemplates = freeze(structuredClone(templates))
  const lifetime = new AbortController()
  const listeners = new Map(MODULE_IDS.map(id => [id, new Set()]))
  const operations = new Map(MODULE_IDS.map(id => [id, idle]))
  const dirty = new Set(), observers = new Map()
  let workspace = scopedWorkspace(initial, campaignId)
  let history = reviewHistory ? freeze(structuredClone(reviewHistory)) : null
  let snapshots = {}, disposed = false, refreshTicket = 0, inFlight = false, unresolved = null
  let latestRefresh = Promise.resolve(), historyTicket = 0

  function publish(nextWorkspace = workspace, nextHistory = history) {
    const workflow = deriveWorkflowState(nextWorkspace, scopeActor, nextHistory)
    const nextSnapshots = {}
    for (const id of MODULE_IDS) {
      const input = projectModuleInput(id, nextWorkspace, { actor: scopeActor, templates: scopeTemplates, reviewHistory: nextHistory })
      nextSnapshots[id] = share(snapshots[id], { input, inputKey: moduleInputKey(id, input),
        access: workflow.modules[id], operation: operations.get(id) })
    }
    const previous = snapshots
    workspace = nextWorkspace; history = nextHistory; snapshots = nextSnapshots
    for (const id of MODULE_IDS) if (previous[id] !== snapshots[id]) {
      for (const listener of listeners.get(id)) listener()
    }
  }
  function setOperation(moduleId, value) {
    if (disposed) return
    operations.set(moduleId, value)
    publish()
  }
  function showError(moduleId, actionId, error, uncertain = false, jobId = null) {
    setOperation(moduleId, { kind: uncertain ? 'uncertain' : 'failed', actionId, jobId,
      error: { message: error.message, code: error.code ?? 'request_failed', requestId: error.requestId ?? null } })
  }

  async function loadHistory() {
    const version = getCurrentVersion(workspace)
    if (!version || disposed) return
    const ticket = ++historyTicket
    const status = workspace.campaign.status
    const current = () => !disposed && ticket === historyTicket
      && getCurrentVersion(workspace)?.id === version.id && workspace.campaign.status === status
    try {
      const value = await api.getReview(version.id, { signal: lifetime.signal })
      if (!current()) return
      publish(workspace, value ? freeze(structuredClone(value)) : null)
      if (operations.get('review').actionId === 'history') setOperation('review', idle)
    } catch (error) {
      if (!current()) return
      publish(workspace, null)
      showError('review', 'history', error)
    }
  }

  function refresh({ review = false } = {}) {
    if (disposed) return Promise.resolve()
    const ticket = ++refreshTicket
    const pending = (async () => {
      let response
      try { response = await api.getWorkspace(campaignId, { signal: lifetime.signal }) } catch (error) {
        if (disposed) return
        if (ticket !== refreshTicket) return latestRefresh
        throw error
      }
      if (disposed) return
      // A superseded read is not a successful reconciliation. Its callers wait
      // for the successor to commit (or fail) before another write is allowed.
      if (ticket !== refreshTicket) return latestRefresh
      const next = scopedWorkspace(response, campaignId)
      if (next.campaign.revision < workspace.campaign.revision) throw failure('stale_workspace', 'The server returned an older campaign revision.')
      const version = getCurrentVersion(next)
      const changedReview = version?.id !== getCurrentVersion(workspace)?.id
        || next.campaign.status !== workspace.campaign.status
      const needsHistory = version && (review || changedReview || !history)
      const nextHistory = !version || needsHistory ? null : history
      if (!version) historyTicket += 1
      // Compute every projection before replacing any part of the last good state.
      try { publish(next, nextHistory) } catch (error) {
        throw failure('invalid_workspace', `The campaign response could not be read: ${error.message}`)
      }
      // A newer revision alone does not prove a timed-out write succeeded.
      // Each revision-protected command supplies its own exact-state reconciler.
      const resolvedJob = unresolved?.jobId && workspace.jobs.find(job => job.id === unresolved.jobId)
      const terminalJob = resolvedJob && ['succeeded', 'failed', 'blocked'].includes(resolvedJob.status)
      const resolution = unresolved?.acknowledged || terminalJob ? 'applied'
        : unresolved?.reconcile?.({ source: unresolved.source, current: workspace })
      if (['applied', 'not_applied'].includes(resolution)) {
        const { moduleId: owner, actionId } = unresolved
        unresolved = null
        if (terminalJob && resolvedJob.status !== 'succeeded') {
          showError(owner, actionId, failure(`generation_${resolvedJob.status}`, `Generation ${resolvedJob.status}.`), false, resolvedJob.id)
        } else setOperation(owner, idle)
      }
      onCampaignChange(workspace.campaign)
      observePendingJobs()
      if (needsHistory) await loadHistory()
      if (!disposed && ticket !== refreshTicket) return latestRefresh
    })()
    latestRefresh = pending
    return pending
  }

  function observePendingJobs() {
    if (disposed) return
    for (const [id, stop] of observers) {
      const job = workspace.jobs.find(value => value.id === id)
      if (job?.status !== 'pending') {
        stop(); observers.delete(id)
        const moduleId = jobOwner[job?.step]
        if (moduleId && operations.get(moduleId).actionId === `observe:${id}`) {
          if (job.status === 'succeeded') setOperation(moduleId, idle)
          else showError(moduleId, `observe:${id}`, failure(`generation_${job.status}`, `Generation ${job.status}.`), job.status === 'unknown', id)
        }
      }
    }
    for (const job of workspace.jobs) {
      if (job.status !== 'pending' || observers.has(job.id) || !api.getJob) continue
      const moduleId = jobOwner[job.step]
      if (!moduleId) continue
      if (operations.get(moduleId).kind === 'idle') setOperation(moduleId, {
        kind: 'running', actionId: `observe:${job.id}`, jobId: job.id, error: null,
      })
      observers.set(job.id, observeJob({ api, jobId: job.id, signal: lifetime.signal,
        onUpdate: value => {
          if (disposed || value.status === 'pending') return
          const stop = observers.get(job.id)
          stop?.(); observers.delete(job.id)
          if (!inFlight) {
            if (value.status === 'succeeded') setOperation(moduleId, idle)
            else showError(moduleId, `observe:${job.id}`, failure(`generation_${value.status}`, `Generation ${value.status}.`), value.status === 'unknown', job.id)
          }
          void refresh().catch(error => showError(moduleId, 'refresh', error, true, job.id))
        },
        onError: error => {
          observers.delete(job.id)
          showError(moduleId, `observe:${job.id}`, error, true, job.id)
        },
      }))
    }
  }

  async function waitForJob(moduleId, actionId, response) {
    if (disposed || lifetime.signal.aborted) throw failure('disposed', 'Campaign observation ended.')
    const initialJob = response.job ?? response
    const check = job => {
      if (job.status === 'succeeded') return job
      throw Object.assign(failure(`generation_${job.status}`, `Generation ${job.status}. Check its status before trying again.`),
        { status: job.status === 'unknown' || job.status === 'pending' ? 0 : 422, jobId: job.id })
    }
    if (initialJob.status !== 'pending') return check(initialJob)
    setOperation(moduleId, { kind: 'running', actionId, jobId: initialJob.id, error: null })
    return new Promise((resolve, reject) => {
      let stop = () => {}, settled = false
      const cleanup = () => { clearTimeout(timer); stop(); lifetime.signal.removeEventListener('abort', abort) }
      const finish = (error, value) => { if (settled) return; settled = true; cleanup(); error ? reject(error) : resolve(value) }
      const abort = () => finish(failure('disposed', 'Campaign observation ended.'))
      const timer = setTimeout(() => {
        try { check(initialJob) } catch (error) { finish(error) }
      }, 120000)
      lifetime.signal.addEventListener('abort', abort, { once: true })
      stop = observeJob({ api, jobId: initialJob.id, signal: lifetime.signal,
        onUpdate: job => {
          if (job.status === 'pending') return
          try { finish(null, check(job)) } catch (error) { finish(error) }
        },
        onError: error => finish(Object.assign(failure('generation_pending', error.message), { status: 0, jobId: initialJob.id })),
      })
      if (settled) stop()
    })
  }

  async function execute(moduleId, actionId, operation, { expectedInputKey, intent = null, idempotent = false, idempotencyKey, reconcile } = {}) {
    assertModuleId(moduleId)
    if (disposed) return resultError(failure('disposed', 'This campaign is no longer active.'))
    if (inFlight) return resultError(failure('campaign_busy', 'Another campaign change is being saved.'))
    const identity = stableInputKey({ moduleId, actionId, intent })
    const replay = unresolved?.identity === identity && unresolved.idempotent && idempotent && !unresolved.acknowledged
    if (unresolved && !replay) return resultError(failure('reconciliation_required', 'Check the previous request before sending another change.'))
    if (workspace.jobs.some(job => ['pending', 'unknown'].includes(job.status))) {
      return resultError(failure('generation_unresolved', 'A generation is pending or needs reconciliation.'))
    }
    const snapshot = snapshots[moduleId]
    if (!replay && !snapshot.access.canEdit) return resultError(failure('not_allowed', snapshot.access.reason))
    if (!replay && expectedInputKey !== undefined && snapshot.inputKey !== expectedInputKey) {
      const error = failure('source_changed', 'The source changed. Review it before applying this draft.')
      showError(moduleId, actionId, error)
      return resultError(error)
    }
    const command = replay ? unresolved : { identity, moduleId, actionId, idempotent,
      key: idempotencyKey ?? crypto.randomUUID(), source: workspace, acknowledged: false, reconcile }
    inFlight = true
    setOperation(moduleId, { kind: 'running', actionId, jobId: null, error: null })
    try {
      await operation({ api, workspace: command.source, idempotencyKey: command.key,
        waitForJob: response => waitForJob(moduleId, actionId, response) })
      command.acknowledged = true
      if (disposed) return resultError(failure('disposed', 'The request finished after leaving this campaign.'))
      try { await refresh({ review: moduleId === 'review' }) } catch (error) {
        throw failure('refresh_failed', `The request completed, but refreshing failed: ${error.message}`)
      }
      if (disposed) return resultError(failure('disposed', 'Campaign observation ended.'))
      unresolved = null
      if (operations.get(moduleId).actionId !== 'history') setOperation(moduleId, idle)
      return { ok: true }
    } catch (error) {
      if (disposed) return resultError(failure('disposed', 'Campaign observation ended.'))
      const uncertain = command.acknowledged || error.status === 0 || error.status >= 500 || (!error.code && error.status === undefined)
      if (uncertain) { command.jobId = error.jobId ?? command.jobId; unresolved = command }
      else if (replay) unresolved = null
      if (error.status === 409) await refresh().catch(() => {})
      showError(moduleId, actionId, error, uncertain, error.jobId ?? null)
      return resultError(error)
    } finally { inFlight = false }
  }

  publish()
  observePendingJobs()
  if (getCurrentVersion(workspace) && !history) void loadHistory()
  return Object.freeze({
    getSnapshot(moduleId) { assertModuleId(moduleId); return snapshots[moduleId] },
    subscribe(moduleId, listener) {
      assertModuleId(moduleId)
      if (disposed) return () => {}
      listeners.get(moduleId).add(listener)
      return () => listeners.get(moduleId).delete(listener)
    },
    refresh, execute,
    async read(operation) {
      if (disposed) throw failure('disposed', 'This campaign is no longer active.')
      const value = await operation({ api, workspace, signal: lifetime.signal })
      if (disposed) throw failure('disposed', 'This campaign is no longer active.')
      return value
    },
    setDirty(moduleId, value) { assertModuleId(moduleId); if (!disposed) value ? dirty.add(moduleId) : dirty.delete(moduleId) },
    hasDirty: () => dirty.size > 0,
    isBusy: () => inFlight,
    assets: Object.freeze({ getAssetBlob: (id, options = {}) => disposed
      ? Promise.reject(failure('disposed', 'This campaign is no longer active.'))
      : api.getAssetBlob(id, { ...options, signal: options.signal
        ? AbortSignal.any([lifetime.signal, options.signal]) : lifetime.signal }) }),
    dispose() {
      disposed = true; refreshTicket += 1; lifetime.abort()
      for (const stop of observers.values()) stop()
      observers.clear(); listeners.forEach(set => set.clear()); dirty.clear()
    },
  })
}
