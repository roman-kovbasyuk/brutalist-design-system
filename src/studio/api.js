export class StudioApiError extends Error {
  constructor(message, { status = 0, code = 'request_failed', details, requestId } = {}) {
    super(message)
    this.name = 'StudioApiError'
    Object.assign(this, { status, code, details, requestId })
  }
}

const segment = (value) => encodeURIComponent(value)
const generationPaths = { brief: 'analyse-brief', brief_analysis: 'analyse-brief', copy: 'copy-generations', directions: 'direction-generations', image: 'image-generations' }
const reviewActions = new Set(['request-changes', 'mark-ready', 'reject', 'approve'])

export function createStudioApi({ getToken, getHeaders, fetchImpl = globalThis.fetch, baseUrl = '' } = {}) {
  async function request(method, path, { body, revision, idempotencyKey, signal, blob = false } = {}) {
    if (!path.startsWith('/api/v1/') || path.includes('://')) throw new TypeError('An API path is required')
    const headers = new Headers(await getHeaders?.())
    const token = await getToken?.()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (body !== undefined) headers.set('Content-Type', 'application/json')
    if (revision !== undefined) {
      if (!Number.isSafeInteger(revision) || revision < 0) throw new TypeError('A non-negative integer revision is required')
      headers.set('If-Match', `"${revision}"`)
    }
    if (idempotencyKey !== undefined) headers.set('Idempotency-Key', idempotencyKey)
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal,
      credentials: 'same-origin', cache: 'no-store',
    })
    if (!response.ok) {
      let error
      try { error = await response.json() } catch { /* Some proxies return HTML errors. */ }
      throw new StudioApiError(error?.message ?? `Request failed (${response.status})`, {
        status: response.status, code: error?.code, details: error?.details,
        requestId: error?.requestId ?? response.headers.get('x-request-id'),
      })
    }
    if (response.status === 204) return null
    return blob ? response.blob() : response.json()
  }
  const campaignPath = (id) => `/api/v1/campaigns/${segment(id)}`
  const versionPath = (id) => `/api/v1/versions/${segment(id)}`
  const api = {
    request,
    getSession: () => request('GET', '/api/v1/session'),
    listCampaigns: () => request('GET', '/api/v1/campaigns'),
    createCampaign: (input) => request('POST', '/api/v1/campaigns', { body: input }),
    duplicateCampaign: (id) => request('POST', `${campaignPath(id)}/duplicate`, { body: {} }),
    deleteCampaign: (id, revision) => request('DELETE', campaignPath(id), { revision }),
    extractBriefFile: (input) => request('POST', '/api/v1/brief-files/extract', { body: input }),
    getWorkspace: (id, { signal } = {}) => request('GET', `${campaignPath(id)}/workspace`, { signal }),
    patchCampaign: (id, patch, revision) => request('PATCH', campaignPath(id), { body: patch, revision }),
    generate(id, step, input = {}, key) {
      if (!Object.hasOwn(generationPaths, step)) throw new TypeError('Unknown generation step')
      return request('POST', `${campaignPath(id)}/${generationPaths[step]}`, { body: input, idempotencyKey: key })
    },
    getJob: (id, { signal } = {}) => request('GET', `/api/v1/generation-jobs/${segment(id)}`, { signal }),
    selectCopy: (id, input, revision) => request('PUT', `${campaignPath(id)}/copy-selection`, { body: input, revision }),
    approveCopy: (id, copyId, revision) => request('PUT', `${campaignPath(id)}/copies/${segment(copyId)}/approval`, { body: {}, revision }),
    deleteCopy: (id, copyId, revision) => request('DELETE', `${campaignPath(id)}/copies/${segment(copyId)}`, { revision }),
    selectDirection: (id, input, revision) => request('PUT', `${campaignPath(id)}/direction-selection`, { body: input, revision }),
    uploadVisual: (id, input, revision, key) => request('POST', `${campaignPath(id)}/visual-uploads`, { body: input, revision, idempotencyKey: key }),
    listTemplates: () => request('GET', '/api/v1/templates'),
    getTemplateVersion: (id, version, { signal } = {}) => request('GET', `/api/v1/templates/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`, { signal }),
    saveComposition: (id, input, revision) => request('PUT', `${campaignPath(id)}/composition`, { body: input, revision }),
    saveBannerBatch: (id, input, revision) => request('PUT', `${campaignPath(id)}/banner-batch`, { body: input, revision }),
    createVersion: (id, input, revision, key) => request('POST', `${campaignPath(id)}/versions`, { body: input ?? {}, revision, idempotencyKey: key }),
    getReview: (id, { signal } = {}) => request('GET', `${versionPath(id)}/review`, { signal }),
    review(id, action, input, revision, key) {
      if (!reviewActions.has(action)) throw new TypeError('Unknown review action')
      return request('POST', `${versionPath(id)}/${action}`, { body: input ?? {}, revision, idempotencyKey: key })
    },
    reopen: (id, revision, key) => request('POST', `${campaignPath(id)}/reopen`, { body: {}, revision, idempotencyKey: key }),
    deliver: (id, input = {}, key) => request('POST', `${versionPath(id)}/delivery`, { body: input, idempotencyKey: key }),
    getDelivery: (id, { signal } = {}) => request('GET', `${versionPath(id)}/delivery`, { signal }),
    getAssetBlob: (id, { signal } = {}) => request('GET', `/api/v1/assets/${segment(id)}`, { blob: true, signal }),
    async downloadDelivery(id) {
      const delivery = await api.getDelivery(id)
      return api.getAssetBlob(delivery.asset.id)
    },
  }
  return Object.freeze(api)
}
