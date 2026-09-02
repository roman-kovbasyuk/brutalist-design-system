export const REVIEW_STORAGE_PREFIX = 'lingu-studio:review:'
const REVIEW_CHANGE_EVENT = 'lingu-studio:review-change'

function getStorageKey(campaignId) {
  return `${REVIEW_STORAGE_PREFIX}${campaignId}`
}

function getDefaultStorage() {
  return typeof window === 'undefined' ? null : window.localStorage
}

function parseRecord(value) {
  if (!value) return null

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function cloneRecord(record) {
  return parseRecord(JSON.stringify(record))
}

export function readReview(campaignId, storage = getDefaultStorage()) {
  if (!campaignId || !storage) return null

  try {
    return parseRecord(storage.getItem(getStorageKey(campaignId)))
  } catch {
    return null
  }
}

export function writeReview(campaignId, record, storage = getDefaultStorage()) {
  if (!campaignId || !storage) return null

  const nextRecord = cloneRecord(record)
  if (!nextRecord) return null

  try {
    storage.setItem(getStorageKey(campaignId), JSON.stringify(nextRecord))
  } catch {
    return null
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(REVIEW_CHANGE_EVENT, {
      detail: { campaignId, record: nextRecord },
    }))
  }

  return nextRecord
}

export function subscribeToReview(campaignId, listener, options = {}) {
  const eventTarget = options.eventTarget ?? (typeof window === 'undefined' ? null : window)
  if (!campaignId || typeof listener !== 'function' || !eventTarget) return () => {}

  const storageKey = getStorageKey(campaignId)
  const onSameDocumentChange = (event) => {
    if (event.detail?.campaignId === campaignId) listener(event.detail.record)
  }
  const onStorageChange = (event) => {
    if (event.key === storageKey) listener(parseRecord(event.newValue))
  }

  eventTarget.addEventListener(REVIEW_CHANGE_EVENT, onSameDocumentChange)
  eventTarget.addEventListener('storage', onStorageChange)

  return () => {
    eventTarget.removeEventListener(REVIEW_CHANGE_EVENT, onSameDocumentChange)
    eventTarget.removeEventListener('storage', onStorageChange)
  }
}
