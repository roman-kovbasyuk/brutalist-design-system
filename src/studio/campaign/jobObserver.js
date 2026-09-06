const scopes = new WeakMap()

/** Observe a server job. Disposing observation never cancels a server mutation. */
export function observeJob({ api, jobId, onUpdate, onError = () => {}, signal }) {
  if (signal?.aborted) return () => {}
  let jobs = scopes.get(api)
  if (!jobs) { jobs = new Map(); scopes.set(api, jobs) }
  let entry = jobs.get(jobId)
  const fresh = !entry
  if (fresh) {
    entry = { listeners: new Set(), controller: new AbortController(), timer: null, active: true, last: null }
    jobs.set(jobId, entry)
  }
  const listener = { onUpdate, onError }
  entry.listeners.add(listener)
  const finish = () => {
    entry.active = false
    clearTimeout(entry.timer)
    entry.controller.abort()
    if (jobs.get(jobId) === entry) jobs.delete(jobId)
  }
  const stop = () => {
    signal?.removeEventListener('abort', stop)
    entry.listeners.delete(listener)
    if (!entry.listeners.size) finish()
  }
  signal?.addEventListener('abort', stop, { once: true })
  if (entry.last) onUpdate(entry.last)
  async function poll() {
    try {
      const response = await api.getJob(jobId, { signal: entry.controller.signal })
      if (!entry.active) return
      const job = response.job ?? response
      if (job.id !== jobId || !['pending', 'succeeded', 'failed', 'blocked', 'unknown'].includes(job.status)) {
        throw Object.assign(new Error('Invalid generation job response'), { code: 'invalid_job' })
      }
      entry.last = job
      for (const item of [...entry.listeners]) item.onUpdate(job)
      if (job.status !== 'pending') finish()
      else if (entry.active) entry.timer = setTimeout(poll, 900)
    } catch (error) {
      if (!entry.active) return
      for (const item of [...entry.listeners]) item.onError(error)
      finish()
    }
  }
  if (fresh) void poll()
  return stop
}
