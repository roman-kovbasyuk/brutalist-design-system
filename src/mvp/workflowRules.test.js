import { describe, expect, test } from 'vitest'
import { getAvailableActions, transitionCampaign } from './workflowRules.js'

const marketer = { id: 'maya', role: 'marketer' }
const designer = { id: 'vlad', role: 'designer' }

function createCampaign(overrides = {}) {
  return {
    id: 'campaign-autumn-launch',
    name: 'Autumn launch',
    status: 'draft',
    brief: {
      text: 'Launch a fast-track course for people moving to Oslo.',
      product: 'Fast-track course',
      audience: 'People moving to Oslo',
      goal: 'Course registrations',
      offer: '15% off',
    },
    copySets: [],
    selectedCopyId: null,
    directions: [],
    selectedDirectionId: null,
    composition: null,
    versions: [],
    reviewEvents: [],
    delivery: null,
    providerMode: 'mock',
    updatedAt: '2026-09-04T08:00:00.000Z',
    ...overrides,
  }
}

function createReadyCampaign(overrides = {}) {
  const version = {
    id: 'campaign-autumn-launch-v1',
    number: 1,
    status: 'ready',
    snapshot: {
      copy: { headline: 'Speak before you move', body: 'Practical Norwegian', offer: '15% off', cta: 'Start learning' },
      direction: { id: 'direction-1', title: 'Arrival portrait', prompt: 'Editorial portrait', assetId: 'asset-1', sha256: 'a'.repeat(64) },
      composition: { templateId: 'split-left', templateVersion: 1, slots: { headline: 'Speak before you move' }, ratios: ['1:1'] },
    },
    contentHash: 'b'.repeat(64),
    assetHashes: ['c'.repeat(64)],
    createdAt: '2026-09-04T08:00:00.000Z',
    createdBy: 'maya',
    readyBy: 'vlad',
    figmaUrl: 'https://www.figma.com/design/demo/review',
  }

  return createCampaign({
    status: 'ready',
    versions: [version],
    reviewEvents: [{
      id: 'event-ready',
      versionId: version.id,
      type: 'ready',
      actorId: 'vlad',
      actorRole: 'designer',
      comment: '',
      createdAt: '2026-09-04T09:00:00.000Z',
    }],
    ...overrides,
  })
}

describe('MVP workflow rules', () => {
  test('offers only valid actions for a draft marketer', () => {
    expect(getAvailableActions(createCampaign(), marketer)).toEqual(['save_brief', 'generate_copy'])
  })

  test('offers no draft workflow action to a designer', () => {
    expect(getAvailableActions(createCampaign(), designer)).toEqual([])
  })

  test('offers copy selection after candidates are generated without advancing automatically', () => {
    const copySet = {
      id: 'copy-set-1',
      candidates: [{ id: 'copy-1', headline: 'Speak sooner', body: 'Practical Norwegian', offer: '15% off', cta: 'Start learning' }],
      createdAt: '2026-09-04T08:05:00.000Z',
    }
    const generated = transitionCampaign(createCampaign(), 'generate_copy', marketer, { copySet })

    expect(generated.status).toBe('draft')
    expect(getAvailableActions(generated, marketer)).toContain('select_copy')
  })

  test('selecting a copy atomically persists its edited values', () => {
    const copySet = {
      id: 'copy-set-1',
      candidates: [
        { id: 'copy-1', headline: 'Speak sooner', body: 'Practical Norwegian', offer: '15% off', cta: 'Start learning' },
        { id: 'copy-2', headline: 'Feel at home', body: 'Useful language habits.', offer: '15% off', cta: 'Try it free' },
      ],
      createdAt: '2026-09-04T08:05:00.000Z',
    }
    const generated = createCampaign({ copySets: [copySet] })

    const selected = transitionCampaign(generated, 'select_copy', marketer, {
      copyId: 'copy-2',
      copy: {
        headline: 'Move with confidence',
        body: 'Practical language.',
        offer: '15% off',
        cta: 'Start now',
      },
    })

    expect(selected.selectedCopyId).toBe('copy-2')
    expect(selected.copySets[0].candidates[1].headline).toBe('Move with confidence')
  })

  test('editing selected copy returns later work to the copy-ready boundary', () => {
    const copySet = {
      id: 'copy-set-1',
      candidates: [{ id: 'copy-1', headline: 'Speak sooner', body: 'Practical Norwegian', offer: '15% off', cta: 'Start learning' }],
      createdAt: '2026-09-04T08:05:00.000Z',
    }
    const selected = createCampaign({
      status: 'direction_selected',
      copySets: [copySet],
      selectedCopyId: 'copy-1',
      directions: [{ id: 'direction-1', title: 'Arrival', prompt: 'Editorial portrait', status: 'ready', assetId: 'asset-1', sha256: 'a'.repeat(64) }],
      selectedDirectionId: 'direction-1',
    })

    const edited = transitionCampaign(selected, 'edit_copy', marketer, {
      copyId: 'copy-1',
      copy: { headline: 'Speak before you move', body: 'Practical Norwegian from day one', offer: '15% off', cta: 'Start now' },
    })

    expect(edited.status).toBe('copy_ready')
    expect(edited.selectedDirectionId).toBeNull()
    expect(edited.copySets[0].candidates[0].headline).toBe('Speak before you move')
  })

  test('prevents a designer from approving a ready version', () => {
    expect(() => transitionCampaign(createReadyCampaign(), 'approve', designer, {})).toThrow('forbidden')
  })

  test('prevents the ready actor from approving the same version', () => {
    const actorWithReadyIdentity = { id: 'vlad', role: 'marketer' }

    expect(() => transitionCampaign(createReadyCampaign(), 'approve', actorWithReadyIdentity, {})).toThrow('self_approval_forbidden')
  })

  test('approves the current ready version without mutating the input', () => {
    const current = createReadyCampaign()
    const approved = transitionCampaign(current, 'approve', marketer, {}, {
      now: () => '2026-09-04T10:00:00.000Z',
      id: () => 'event-approved',
    })

    expect(current.status).toBe('ready')
    expect(current.versions[0].status).toBe('ready')
    expect(approved.status).toBe('approved')
    expect(approved.versions[0].status).toBe('approved')
    expect(approved.reviewEvents.at(-1)).toMatchObject({
      id: 'event-approved',
      type: 'approved',
      actorId: 'maya',
      versionId: 'campaign-autumn-launch-v1',
    })
  })

  test('requires a comment when a designer requests changes', () => {
    const inReview = createReadyCampaign({
      status: 'in_review',
      versions: [{ ...createReadyCampaign().versions[0], status: 'in_review', readyBy: null }],
      reviewEvents: [],
    })

    expect(() => transitionCampaign(inReview, 'request_changes', designer, { comment: '  ' })).toThrow('comment_required')
  })
})
