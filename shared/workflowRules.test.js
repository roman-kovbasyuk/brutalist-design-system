import { describe, expect, test } from 'vitest'
import { pilotCampaignFixture } from './fixtures/pilotCampaign.js'
import { allowedActions, applyArtifactEdit, transitionCampaign } from './workflowRules.js'

const marketer = { id: 'user-marketer', role: 'marketer' }
const designer = { id: 'user-designer', role: 'designer' }
const admin = { id: 'user-admin', role: 'admin' }
const otherMarketer = { id: 'user-marketer-2', role: 'marketer' }

function campaignAt(status, overrides = {}) {
  return {
    ...pilotCampaignFixture,
    status,
    stale: { copy: false, directions: false, composition: false },
    ...overrides,
  }
}

function versionAt(overrides = {}) {
  return {
    id: 'version-1',
    number: 1,
    contentHash: 'a'.repeat(64),
    readyActorId: null,
    assetHashes: ['b'.repeat(64)],
    ...overrides,
  }
}

const readyChecklist = {
  copyAccuracy: true,
  layoutQuality: true,
  exportReadiness: true,
}

const cases = [
  {
    action: 'select_copy',
    from: 'draft',
    to: 'copy_ready',
    actor: marketer,
    input: { copy: pilotCampaignFixture.selectedCopy },
  },
  {
    action: 'select_direction',
    from: 'copy_ready',
    to: 'direction_selected',
    actor: marketer,
    input: { direction: pilotCampaignFixture.selectedDirection },
  },
  {
    action: 'save_composition',
    from: 'direction_selected',
    to: 'composed',
    actor: marketer,
    input: { composition: pilotCampaignFixture.composition },
  },
  {
    action: 'send_for_review',
    from: 'composed',
    to: 'in_review',
    actor: marketer,
    input: {
      version: versionAt(),
      hasOpenVersion: false,
      safetyPassed: true,
      budgetAvailable: true,
    },
  },
  {
    action: 'request_changes',
    from: 'in_review',
    to: 'changes_requested',
    actor: designer,
    campaign: { currentVersion: versionAt() },
    input: { comment: 'Increase the headline contrast.' },
  },
  {
    action: 'mark_ready',
    from: 'in_review',
    to: 'ready',
    actor: designer,
    campaign: { currentVersion: versionAt() },
    input: { figmaUrl: 'https://www.figma.com/design/file/review', checklistAnswers: readyChecklist },
  },
  {
    action: 'reject',
    from: 'ready',
    to: 'changes_requested',
    actor: marketer,
    campaign: { currentVersion: versionAt({ readyActorId: designer.id }) },
    input: { comment: 'Use the approved offer.' },
  },
  {
    action: 'approve',
    from: 'ready',
    to: 'approved',
    actor: otherMarketer,
    campaign: { currentVersion: versionAt({ readyActorId: designer.id }) },
    input: {},
  },
  {
    action: 'reopen',
    from: 'changes_requested',
    to: 'composed',
    actor: marketer,
    campaign: { currentVersion: versionAt() },
    input: {},
  },
  {
    action: 'deliver',
    from: 'approved',
    to: 'delivered',
    actor: marketer,
    campaign: { currentVersion: versionAt() },
    input: { deliveryId: 'delivery-1' },
  },
]

describe('transitionCampaign', () => {
  test.each(cases)('$action moves $from to $to', ({ action, from, to, actor, campaign, input }) => {
    const result = transitionCampaign({
      campaign: campaignAt(from, campaign),
      action,
      actor,
      input,
    })

    expect(result.ok).toBe(true)
    expect(result.campaign.status).toBe(to)
    expect(result.event).toMatchObject({
      type: action,
      actorId: actor.id,
      from,
      to,
    })
  })

  test('refuses an action by the wrong role', () => {
    const result = transitionCampaign({
      campaign: campaignAt('in_review', { currentVersion: versionAt() }),
      action: 'mark_ready',
      actor: marketer,
      input: { figmaUrl: 'https://www.figma.com/design/file/review', checklistAnswers: readyChecklist },
    })

    expect(result).toMatchObject({ ok: false, code: 'forbidden', status: 403 })
  })

  test('refuses an action when its guard is missing', () => {
    const result = transitionCampaign({
      campaign: campaignAt('composed'),
      action: 'send_for_review',
      actor: marketer,
      input: { hasOpenVersion: false, safetyPassed: false, budgetAvailable: true },
    })

    expect(result).toMatchObject({ ok: false, code: 'guard_failed', status: 409 })
  })

  test('prevents the ready actor from approving the version', () => {
    const result = transitionCampaign({
      campaign: campaignAt('ready', { currentVersion: versionAt({ readyActorId: marketer.id }) }),
      action: 'approve',
      actor: marketer,
      input: {},
    })

    expect(result).toMatchObject({ ok: false, code: 'self_approval_forbidden', status: 403 })
  })

  test('refuses delivery before approval', () => {
    const result = transitionCampaign({
      campaign: campaignAt('ready', { currentVersion: versionAt({ readyActorId: designer.id }) }),
      action: 'deliver',
      actor: marketer,
      input: { deliveryId: 'delivery-1' },
    })

    expect(result).toMatchObject({ ok: false, code: 'transition_not_allowed', status: 409 })
  })

  test('lists only actions allowed by status and role', () => {
    expect(allowedActions({ campaign: campaignAt('in_review'), actor: designer }))
      .toEqual(['request_changes', 'mark_ready'])
    expect(allowedActions({ campaign: campaignAt('in_review'), actor: marketer })).toEqual([])
  })

  test('gives Admin marketer actions but never designer actions', () => {
    expect(allowedActions({ campaign: campaignAt('draft'), actor: admin })).toEqual(['select_copy'])
    expect(allowedActions({ campaign: campaignAt('in_review'), actor: admin })).toEqual([])
  })
})

describe('applyArtifactEdit', () => {
  test.each([
    ['brief', 'draft', { copy: true, directions: true, composition: true }, ['selectedCopy', 'selectedDirection', 'composition']],
    ['copy', 'copy_ready', { copy: false, directions: true, composition: true }, ['selectedDirection', 'composition']],
    ['direction', 'direction_selected', { copy: false, directions: false, composition: true }, ['composition']],
  ])('regresses state and invalidates downstream artifacts after a %s change', (artifact, status, stale, cleared) => {
    const result = applyArtifactEdit(campaignAt('composed'), artifact)

    expect(result).toMatchObject({ ok: true, campaign: { status, stale } })
    for (const field of cleared) expect(result.campaign[field]).toBeUndefined()
  })

  test.each(['in_review', 'ready', 'approved', 'delivered'])('refuses edits while the campaign is %s', (status) => {
    expect(applyArtifactEdit(campaignAt(status), 'brief'))
      .toMatchObject({ ok: false, code: 'content_locked', status: 409 })
  })
})
