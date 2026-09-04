import { actorSchema, campaignSchema, campaignVersionSchema } from './contracts.js'

const marketerActions = {
  draft: ['save_brief', 'generate_copy'],
  copy_ready: ['save_brief', 'generate_copy', 'select_copy', 'generate_directions'],
  direction_selected: ['save_brief', 'generate_copy', 'generate_directions', 'select_direction', 'save_composition'],
  composed: ['save_brief', 'generate_copy', 'generate_directions', 'select_direction', 'save_composition', 'send_for_review'],
  in_review: [],
  changes_requested: ['reopen'],
  ready: ['reject', 'approve'],
  approved: ['deliver'],
  delivered: [],
}

const designerActions = {
  in_review: ['request_changes', 'mark_ready'],
}

export function getAvailableActions(campaignInput, actorInput) {
  const campaign = campaignSchema.parse(campaignInput)
  const actor = actorSchema.parse(actorInput)

  if (actor.role === 'designer') return designerActions[campaign.status] ?? []
  if (actor.role === 'marketer' || actor.role === 'admin') {
    const actions = [...(marketerActions[campaign.status] ?? [])]
    if (campaign.status === 'draft' && campaign.copySets.length > 0) actions.push('select_copy')
    return actions
  }
  return []
}

export function transitionCampaign(campaignInput, action, actorInput, input = {}, dependencies = {}) {
  const campaign = campaignSchema.parse(campaignInput)
  const actor = actorSchema.parse(actorInput)
  const available = getAvailableActions(campaign, actor)
  const roleCanUseAction = actionAllowedForRole(action, actor.role)

  if (!roleCanUseAction) throw new Error('forbidden')
  if (!available.includes(action)) throw new Error('transition_not_allowed')

  const now = dependencies.now ?? (() => new Date().toISOString())
  const id = dependencies.id ?? (() => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}`)
  const updatedAt = now()
  let next = structuredClone(campaign)

  if (action === 'save_brief') {
    next.brief = { ...next.brief, ...input.brief }
    markDownstreamStale(next)
  }

  if (action === 'generate_copy') {
    if (!input.copySet) throw new Error('copy_set_required')
    next.copySets.push(input.copySet)
  }

  if (action === 'select_copy') {
    const candidate = findCopy(next, input.copyId)
    if (!candidate) throw new Error('copy_not_found')
    next.selectedCopyId = candidate.id
    next.status = 'copy_ready'
    next.selectedDirectionId = null
    next.composition = null
  }

  if (action === 'generate_directions') {
    if (!Array.isArray(input.directions) || input.directions.length === 0) throw new Error('directions_required')
    next.directions = input.directions
  }

  if (action === 'select_direction') {
    const direction = next.directions.find((item) => item.id === input.directionId)
    if (!direction) throw new Error('direction_not_found')
    if (direction.status !== 'ready') throw new Error('direction_not_usable')
    next.selectedDirectionId = direction.id
    next.status = 'direction_selected'
    next.composition = null
  }

  if (action === 'save_composition') {
    if (!input.composition?.validation?.valid) throw new Error('composition_invalid')
    next.composition = { ...input.composition, stale: false }
    next.status = 'composed'
  }

  if (action === 'send_for_review') {
    const version = createCampaignVersion(next, actor, updatedAt, id)
    next.versions.push(version)
    next.status = 'in_review'
    next.reviewEvents.push(createReviewEvent(version.id, 'sent', actor, '', updatedAt, id))
  }

  if (action === 'request_changes') {
    const comment = requiredComment(input.comment)
    const version = currentVersion(next)
    version.status = 'changes_requested'
    next.status = 'changes_requested'
    next.reviewEvents.push(createReviewEvent(version.id, 'changes_requested', actor, comment, updatedAt, id))
  }

  if (action === 'mark_ready') {
    if (!input.checklistConfirmed) throw new Error('review_checklist_required')
    if (!isValidFigmaUrl(input.figmaUrl)) throw new Error('figma_url_required')
    const version = currentVersion(next)
    version.status = 'ready'
    version.readyBy = actor.id
    version.figmaUrl = input.figmaUrl
    next.status = 'ready'
    next.reviewEvents.push(createReviewEvent(version.id, 'ready', actor, input.comment ?? '', updatedAt, id))
  }

  if (action === 'reject') {
    const comment = requiredComment(input.comment)
    const version = currentVersion(next)
    version.status = 'changes_requested'
    next.status = 'changes_requested'
    next.reviewEvents.push(createReviewEvent(version.id, 'rejected', actor, comment, updatedAt, id))
  }

  if (action === 'reopen') {
    next.status = 'composed'
    if (next.composition) next.composition.stale = true
  }

  if (action === 'approve') {
    const version = currentVersion(next)
    if (version.readyBy === actor.id) throw new Error('self_approval_forbidden')
    version.status = 'approved'
    next.status = 'approved'
    next.reviewEvents.push(createReviewEvent(version.id, 'approved', actor, '', updatedAt, id))
  }

  if (action === 'deliver') {
    const version = currentVersion(next)
    const files = input.files ?? version.snapshot.composition.ratios.map((ratio) => `${next.id}-v${version.number}-${slugify(ratio)}.png`)
    version.status = 'delivered'
    next.status = 'delivered'
    next.delivery = {
      id: id(),
      versionId: version.id,
      files,
      manifestFile: 'manifest.json',
      createdAt: updatedAt,
      createdBy: actor.id,
    }
    next.reviewEvents.push(createReviewEvent(version.id, 'delivered', actor, '', updatedAt, id))
  }

  next.updatedAt = updatedAt
  return campaignSchema.parse(next)
}

export function createCampaignVersion(campaignInput, actorInput, createdAt = new Date().toISOString(), id = () => `id-${Date.now()}`) {
  const campaign = campaignSchema.parse(campaignInput)
  const actor = actorSchema.parse(actorInput)
  const copy = findCopy(campaign, campaign.selectedCopyId)
  const direction = campaign.directions.find((item) => item.id === campaign.selectedDirectionId)

  if (!copy) throw new Error('selected_copy_required')
  if (!direction?.assetId || !direction.sha256) throw new Error('selected_direction_required')
  if (!campaign.composition?.validation.valid || campaign.composition.stale) throw new Error('valid_composition_required')

  const snapshot = {
    copy: { headline: copy.headline, body: copy.body, offer: copy.offer, cta: copy.cta },
    direction: {
      id: direction.id,
      title: direction.title,
      prompt: direction.prompt,
      assetId: direction.assetId,
      sha256: direction.sha256,
    },
    composition: {
      templateId: campaign.composition.templateId,
      templateVersion: campaign.composition.templateVersion,
      slots: campaign.composition.slots,
      ratios: campaign.composition.ratios,
    },
  }
  const number = campaign.versions.length + 1
  const contentHash = mockSha256(canonicalJson(snapshot))

  return campaignVersionSchema.parse({
    id: `${campaign.id}-v${number}-${id()}`,
    number,
    status: 'in_review',
    snapshot,
    contentHash,
    assetHashes: [direction.sha256],
    createdAt,
    createdBy: actor.id,
    readyBy: null,
    figmaUrl: null,
  })
}

function actionAllowedForRole(action, role) {
  if (role === 'designer') return ['request_changes', 'mark_ready'].includes(action)
  if (role === 'marketer' || role === 'admin') return Object.values(marketerActions).flat().includes(action)
  return false
}

function findCopy(campaign, copyId) {
  return campaign.copySets.flatMap((set) => set.candidates).find((candidate) => candidate.id === copyId)
}

function currentVersion(campaign) {
  const version = campaign.versions.at(-1)
  if (!version) throw new Error('version_required')
  return version
}

function createReviewEvent(versionId, type, actor, comment, createdAt, id) {
  return {
    id: id(),
    versionId,
    type,
    actorId: actor.id,
    actorRole: actor.role,
    comment,
    createdAt,
  }
}

function requiredComment(value) {
  const comment = typeof value === 'string' ? value.trim() : ''
  if (!comment) throw new Error('comment_required')
  return comment
}

function markDownstreamStale(campaign) {
  campaign.selectedCopyId = null
  campaign.selectedDirectionId = null
  if (campaign.composition) campaign.composition.stale = true
  campaign.status = 'draft'
}

function isValidFigmaUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && ['figma.com', 'www.figma.com'].includes(url.hostname)
  } catch {
    return false
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function mockSha256(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').repeat(8)
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
