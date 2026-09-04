import {
  campaignStatusSchema,
  compositionSchema,
  copyVariantSchema,
  roleSchema,
  visualDirectionSchema,
} from './contracts.js'

const lockedStatuses = new Set(['in_review', 'changes_requested', 'ready', 'approved', 'delivered'])
const marketerRoles = ['marketer', 'admin']

function failure(code, status, message) {
  return { ok: false, code, status, message }
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function hasReadyChecklist(value) {
  const required = ['copyAccuracy', 'layoutQuality', 'exportReadiness']
  return value != null && typeof value === 'object' && required.every((key) => value[key] === true)
}

function hasFigmaUrl(value) {
  if (!hasText(value)) return false

  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname === 'figma.com' || url.hostname.endsWith('.figma.com'))
  } catch {
    return false
  }
}

function validVersion(value) {
  return value != null
    && hasText(value.id)
    && Number.isInteger(value.number)
    && value.number > 0
    && /^[a-f0-9]{64}$/.test(value.contentHash)
}

function roleAllowed(actor, roles) {
  return actor != null && roles.includes(actor.role)
}

function hasValidRole(actor) {
  return roleSchema.safeParse(actor?.role).success
}

function hasValidCampaignStatus(campaign) {
  return campaignStatusSchema.safeParse(campaign?.status).success
}

function mergeStaleHistory(existing, invalidated) {
  const stale = { ...existing }
  for (const [artifact, isStale] of Object.entries(invalidated)) {
    stale[artifact] = existing?.[artifact] === true || isStale === true
  }
  return stale
}

function guardResult(value) {
  if (value === true) return null
  if (value && typeof value === 'object' && value.code) return value
  return failure('guard_failed', 409, 'The campaign does not satisfy this action\'s requirements.')
}

const transitions = [
  {
    action: 'select_copy',
    from: 'draft',
    to: 'copy_ready',
    roles: marketerRoles,
    guard: ({ input }) => copyVariantSchema.safeParse(input.copy).success,
    apply: ({ campaign, input }) => ({
      ...campaign,
      selectedCopy: input.copy,
      stale: { copy: false, directions: true, composition: true },
    }),
  },
  {
    action: 'select_direction',
    from: 'copy_ready',
    to: 'direction_selected',
    roles: marketerRoles,
    guard: ({ input }) => {
      const parsed = visualDirectionSchema.safeParse(input.direction)
      return parsed.success && parsed.data.status === 'ready' && hasText(parsed.data.previewAssetId)
    },
    apply: ({ campaign, input }) => ({
      ...campaign,
      selectedDirection: input.direction,
      stale: { ...campaign.stale, directions: false, composition: true },
    }),
  },
  {
    action: 'save_composition',
    from: 'direction_selected',
    to: 'composed',
    roles: marketerRoles,
    guard: ({ input }) => {
      const parsed = compositionSchema.safeParse(input.composition)
      return parsed.success && parsed.data.validation.valid && !parsed.data.stale
    },
    apply: ({ campaign, input }) => ({
      ...campaign,
      composition: input.composition,
      stale: { ...campaign.stale, composition: false },
    }),
  },
  {
    action: 'save_composition',
    from: 'composed',
    to: 'composed',
    roles: marketerRoles,
    guard: ({ input }) => {
      const parsed = compositionSchema.safeParse(input.composition)
      return parsed.success && parsed.data.validation.valid && !parsed.data.stale
    },
    apply: ({ campaign, input }) => ({
      ...campaign,
      composition: input.composition,
      stale: { ...campaign.stale, composition: false },
    }),
  },
  {
    action: 'send_for_review',
    from: 'composed',
    to: 'in_review',
    roles: marketerRoles,
    guard: ({ input }) => validVersion(input.version)
      && input.hasOpenVersion === false
      && input.safetyPassed === true
      && input.budgetAvailable === true,
    apply: ({ campaign, input }) => ({ ...campaign, currentVersion: input.version }),
  },
  {
    action: 'request_changes',
    from: 'in_review',
    to: 'changes_requested',
    roles: ['designer'],
    guard: ({ campaign, input }) => validVersion(campaign.currentVersion) && hasText(input.comment),
  },
  {
    action: 'mark_ready',
    from: 'in_review',
    to: 'ready',
    roles: ['designer'],
    guard: ({ campaign, input }) => validVersion(campaign.currentVersion)
      && hasFigmaUrl(input.figmaUrl)
      && hasReadyChecklist(input.checklistAnswers),
    apply: ({ campaign, actor, input }) => ({
      ...campaign,
      currentVersion: {
        ...campaign.currentVersion,
        readyActorId: actor.id,
        figmaUrl: input.figmaUrl,
        checklistAnswers: { ...input.checklistAnswers },
      },
    }),
  },
  {
    action: 'reject',
    from: 'ready',
    to: 'changes_requested',
    roles: marketerRoles,
    guard: ({ campaign, input }) => validVersion(campaign.currentVersion) && hasText(input.comment),
  },
  {
    action: 'approve',
    from: 'ready',
    to: 'approved',
    roles: marketerRoles,
    guard: ({ campaign, actor }) => {
      if (!validVersion(campaign.currentVersion)) return false
      if (campaign.currentVersion.readyActorId === actor.id) {
        return failure('self_approval_forbidden', 403, 'The person who marked this version ready cannot approve it.')
      }
      return hasText(campaign.currentVersion.readyActorId)
    },
  },
  {
    action: 'reopen',
    from: 'changes_requested',
    to: 'composed',
    roles: marketerRoles,
    guard: ({ campaign }) => validVersion(campaign.currentVersion),
  },
  {
    action: 'deliver',
    from: 'approved',
    to: 'delivered',
    roles: marketerRoles,
    guard: ({ campaign, input }) => validVersion(campaign.currentVersion) && hasText(input.deliveryId),
    apply: ({ campaign, input }) => ({ ...campaign, deliveryId: input.deliveryId }),
  },
]

export function allowedActions({ campaign, actor }) {
  if (!hasValidCampaignStatus(campaign) || !hasValidRole(actor)) return []

  return transitions
    .filter((transition) => transition.from === campaign.status && roleAllowed(actor, transition.roles))
    .map((transition) => transition.action)
}

export function transitionCampaign({ campaign, action, actor, input = {} }) {
  if (!hasValidCampaignStatus(campaign)) {
    return failure('invalid_campaign_status', 400, 'Campaign status is invalid.')
  }

  if (!hasValidRole(actor)) {
    return failure('invalid_actor_role', 400, 'Actor role is invalid.')
  }

  const transition = transitions.find((candidate) => (
    candidate.from === campaign.status && candidate.action === action
  ))

  if (!transition) {
    return failure('transition_not_allowed', 409, `Action ${action} is not allowed from ${campaign.status}.`)
  }

  if (!roleAllowed(actor, transition.roles)) {
    return failure('forbidden', 403, `Role ${actor?.role ?? 'unknown'} cannot perform ${action}.`)
  }

  const guardFailure = guardResult(transition.guard({ campaign, actor, input }))
  if (guardFailure) return guardFailure

  const updated = transition.apply?.({ campaign, actor, input }) ?? { ...campaign }
  const nextCampaign = {
    ...updated,
    status: transition.to,
    revision: campaign.revision + 1,
  }

  return {
    ok: true,
    campaign: nextCampaign,
    event: {
      type: transition.action,
      actorId: actor.id,
      from: transition.from,
      to: transition.to,
    },
  }
}

export function applyArtifactEdit(campaign, changedArtifact) {
  if (!hasValidCampaignStatus(campaign)) {
    return failure('invalid_campaign_status', 400, 'Campaign status is invalid.')
  }

  if (lockedStatuses.has(campaign.status)) {
    return failure('content_locked', 409, `Campaign content is locked while status is ${campaign.status}.`)
  }

  const rules = {
    brief: {
      allowed: ['draft', 'copy_ready', 'direction_selected', 'composed'],
      status: 'draft',
      stale: { copy: true, directions: true, composition: true },
      clear: ['selectedCopy', 'selectedDirection', 'composition', 'selectedCopyId', 'selectedDirectionId', 'compositionId'],
    },
    copy: {
      allowed: ['copy_ready', 'direction_selected', 'composed'],
      status: 'copy_ready',
      stale: { copy: false, directions: true, composition: true },
      clear: ['selectedDirection', 'composition', 'selectedDirectionId', 'compositionId'],
    },
    direction: {
      allowed: ['direction_selected', 'composed'],
      status: 'direction_selected',
      stale: { copy: false, directions: false, composition: true },
      clear: ['composition', 'compositionId'],
    },
  }
  const rule = rules[changedArtifact]

  if (!rule || !rule.allowed.includes(campaign.status)) {
    return failure('transition_not_allowed', 409, `Cannot edit ${changedArtifact} while status is ${campaign.status}.`)
  }

  const updated = {
    ...campaign,
    status: rule.status,
    revision: campaign.revision + 1,
    stale: mergeStaleHistory(campaign.stale, rule.stale),
  }
  for (const field of rule.clear) delete updated[field]

  return { ok: true, campaign: updated }
}
