export const REVIEW_STORAGE_PREFIX = 'lingu-studio:review:'
const REVIEW_CHANGE_EVENT = 'lingu-studio:review-change'
const reviewStatuses = new Set(['draft', 'in-review', 'ready-for-approval', 'approved'])
const defaultPalette = ['#e8d8c6', '#6d81a7', '#1d2940']

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

function stringOr(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function nonEmptyStringOr(value, fallback = '') {
  const normalized = stringOr(value).trim()
  return normalized || fallback
}

function nonNegativeNumberOr(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function normalizePalette(palette) {
  if (!Array.isArray(palette)) return defaultPalette

  return defaultPalette.map((fallback, index) => stringOr(palette[index], fallback))
}

function normalizeTemplate(template, templateName) {
  const source = isRecord(template) ? template : {}

  return {
    id: stringOr(source.id),
    name: stringOr(source.name, templateName),
    layout: stringOr(source.layout, 'split-left'),
    alignment: stringOr(source.alignment, 'left'),
    family: stringOr(source.family),
    masterRatio: stringOr(source.masterRatio),
    index: nonNegativeNumberOr(source.index, 1),
  }
}

function normalizeVisual(visual) {
  const source = isRecord(visual) ? visual : {}

  return {
    id: stringOr(source.id),
    name: stringOr(source.name),
    direction: stringOr(source.direction),
    motif: stringOr(source.motif, 'portrait'),
    palette: normalizePalette(source.palette),
  }
}

function normalizeContent(content) {
  const source = isRecord(content) ? content : {}

  return {
    headline: stringOr(source.headline),
    body: stringOr(source.body),
    offer: stringOr(source.offer),
    cta: stringOr(source.cta),
  }
}

function normalizeMotionPreset(preset) {
  const source = isRecord(preset) ? preset : {}

  return {
    text: stringOr(source.text, 'none'),
    image: stringOr(source.image, 'none'),
    cta: stringOr(source.cta, 'none'),
    replayVersion: nonNegativeNumberOr(source.replayVersion),
  }
}

function normalizeBanner(banner, legacyMotionPreset) {
  if (!isRecord(banner)) return null
  const id = nonEmptyStringOr(banner.id)
  if (!id) return null

  const templateName = stringOr(banner.templateName, 'Untitled banner')
  const motionSource = Object.hasOwn(banner, 'motionPreset') ? banner.motionPreset : legacyMotionPreset

  return {
    id,
    templateId: stringOr(banner.templateId),
    templateName,
    format: stringOr(banner.format),
    dimensions: stringOr(banner.dimensions, 'Not specified'),
    platform: stringOr(banner.platform, 'Not specified'),
    mediaType: banner.mediaType === 'video' ? 'video' : 'static',
    sourceAssetId: stringOr(banner.sourceAssetId),
    sourceStaticId: stringOr(banner.sourceStaticId),
    template: normalizeTemplate(banner.template, templateName),
    visual: normalizeVisual(banner.visual),
    content: normalizeContent(banner.content),
    motionPreset: normalizeMotionPreset(motionSource),
  }
}

function normalizeGeneratedAsset(asset) {
  if (!isRecord(asset)) return null
  const id = nonEmptyStringOr(asset.id)
  if (!id) return null
  const generation = isRecord(asset.generation) ? asset.generation : {}

  return {
    id,
    sourcePromptId: stringOr(asset.sourcePromptId),
    sourceStaticId: stringOr(asset.sourceStaticId),
    mediaType: asset.mediaType === 'video' ? 'video' : 'static',
    name: stringOr(asset.name),
    title: stringOr(asset.title),
    direction: stringOr(asset.direction),
    prompt: stringOr(asset.prompt),
    motif: stringOr(asset.motif),
    palette: normalizePalette(asset.palette),
    cost: nonNegativeNumberOr(asset.cost),
    generation: {
      mode: stringOr(generation.mode, 'simulated'),
      provider: stringOr(generation.provider, 'local'),
    },
  }
}

function normalizeMotionByBannerId(motionByBannerId) {
  if (!isRecord(motionByBannerId)) return {}

  return Object.fromEntries(
    Object.entries(motionByBannerId)
      .filter(([bannerId, preset]) => nonEmptyStringOr(bannerId) && isRecord(preset))
      .map(([bannerId, preset]) => [bannerId, normalizeMotionPreset(preset)]),
  )
}

function normalizeRecord(record) {
  if (!isRecord(record)) return null

  const motionByBannerId = normalizeMotionByBannerId(record.motionByBannerId)

  return {
    ...record,
    status: reviewStatuses.has(record.status) ? record.status : 'draft',
    figmaUrl: typeof record.figmaUrl === 'string' ? record.figmaUrl : '',
    selectedBanners: Array.isArray(record.selectedBanners)
      ? record.selectedBanners.map((banner) => normalizeBanner(banner, motionByBannerId[banner?.id])).filter(Boolean)
      : [],
    selectedBannerIds: Array.isArray(record.selectedBannerIds) ? record.selectedBannerIds.map((id) => nonEmptyStringOr(id)).filter(Boolean) : [],
    generatedAssets: Array.isArray(record.generatedAssets) ? record.generatedAssets.map(normalizeGeneratedAsset).filter(Boolean) : [],
    motionByBannerId,
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
  const targetStorage = storage === undefined ? getDefaultStorage() : storage
  if (!campaignId || !targetStorage) return null

  try {
    return parseRecord(targetStorage.getItem(getStorageKey(campaignId)))
  } catch {
    return null
  }
}

export function writeReview(campaignId, record, storage) {
  const targetStorage = storage === undefined ? getDefaultStorage() : storage
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
  const eventTarget = options?.eventTarget === undefined ? (typeof window === 'undefined' ? null : window) : options.eventTarget
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
