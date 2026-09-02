export const REVIEW_STORAGE_PREFIX = 'lingu-studio:review:'
const REVIEW_CHANGE_EVENT = 'lingu-studio:review-change'
const reviewStatuses = new Set(['draft', 'in-review', 'ready-for-approval', 'approved'])

function getStorageKey(campaignId) {
  return `${REVIEW_STORAGE_PREFIX}${campaignId}`
}

function getDefaultStorage() {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeBanner(banner) {
  if (!isRecord(banner) || typeof banner.id !== 'string') return null

  const normalized = { ...banner }
  if (!isRecord(normalized.template)) delete normalized.template
  if (!isRecord(normalized.visual)) delete normalized.visual
  if (!isRecord(normalized.content)) delete normalized.content
  if (!isRecord(normalized.motionPreset)) delete normalized.motionPreset
  return normalized
}

function normalizeGeneratedAsset(asset) {
  return isRecord(asset) && typeof asset.id === 'string' ? asset : null
}

function normalizeMotionByBannerId(motionByBannerId) {
  if (!isRecord(motionByBannerId)) return {}

  return Object.fromEntries(
    Object.entries(motionByBannerId).filter(([bannerId, preset]) => typeof bannerId === 'string' && isRecord(preset)),
  )
}

function normalizeRecord(record) {
  if (!isRecord(record)) return null

  return {
    ...record,
    status: reviewStatuses.has(record.status) ? record.status : 'draft',
    figmaUrl: typeof record.figmaUrl === 'string' ? record.figmaUrl : '',
    selectedBanners: Array.isArray(record.selectedBanners) ? record.selectedBanners.map(normalizeBanner).filter(Boolean) : [],
    selectedBannerIds: Array.isArray(record.selectedBannerIds) ? record.selectedBannerIds.filter((id) => typeof id === 'string') : [],
    generatedAssets: Array.isArray(record.generatedAssets) ? record.generatedAssets.map(normalizeGeneratedAsset).filter(Boolean) : [],
    motionByBannerId: normalizeMotionByBannerId(record.motionByBannerId),
    submittedAt: typeof record.submittedAt === 'string' ? record.submittedAt : null,
    reviewedAt: typeof record.reviewedAt === 'string' ? record.reviewedAt : null,
    approvedAt: typeof record.approvedAt === 'string' ? record.approvedAt : null,
    designerName: typeof record.designerName === 'string' ? record.designerName : null,
    marketerName: typeof record.marketerName === 'string' ? record.marketerName : null,
  }
}

function parseRecord(value) {
  if (!value) return null

  try {
    return normalizeRecord(JSON.parse(value))
  } catch {
    return null
  }
}

function cloneRecord(record) {
  try {
    return normalizeRecord(JSON.parse(JSON.stringify(record)))
  } catch {
    return null
  }
}

export function readReview(campaignId, storage) {
  const targetStorage = storage ?? getDefaultStorage()
  if (!campaignId || !targetStorage) return null

  try {
    return parseRecord(targetStorage.getItem(getStorageKey(campaignId)))
  } catch {
    return null
  }
}

export function writeReview(campaignId, record, storage) {
  const targetStorage = storage ?? getDefaultStorage()
  if (!campaignId || !targetStorage) return null

  const nextRecord = cloneRecord(record)
  if (!nextRecord) return null

  try {
    targetStorage.setItem(getStorageKey(campaignId), JSON.stringify(nextRecord))
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
  const eventTarget = options?.eventTarget ?? (typeof window === 'undefined' ? null : window)
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
