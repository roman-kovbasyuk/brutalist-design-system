import { beforeEach, describe, expect, test, vi } from 'vitest'
import { hashCanonical } from '../../shared/canonicalJson.js'
import { pilotCampaignFixture } from '../../shared/fixtures/pilotCampaign.js'
import { pilotTemplateFixture } from '../../shared/fixtures/pilotTemplate.js'
import { createReviewService } from './reviewService.js'

const now = new Date('2026-09-04T10:00:00.000Z')
const checklistAnswers = { copyAccuracy: true, layoutQuality: true, exportReadiness: true }
const snapshot = {
  selectedCopy: pilotCampaignFixture.selectedCopy,
  selectedDirection: { ...pilotCampaignFixture.selectedDirection, previewAssetId: 'asset-source' },
  composition: {
    ...pilotCampaignFixture.composition,
    slotValues: { ...pilotCampaignFixture.composition.slotValues, image: 'asset-source' },
  },
  assets: [
    { id: 'asset-source', kind: 'direction', sha256: 'a'.repeat(64) },
    { id: 'asset-review', kind: 'review_png', sha256: 'b'.repeat(64) },
    { id: 'asset-manifest', kind: 'manifest', sha256: 'c'.repeat(64) },
  ],
  templateManifest: pilotTemplateFixture,
  templateManifestHash: hashCanonical(pilotTemplateFixture),
}
const version = {
  id: 'version-1', campaignId: 'campaign-1', versionNumber: 1, snapshot,
  contentHash: hashCanonical(snapshot), createdBy: 'marketer-1', createdAt: now,
}
const reviewAssetHashes = ['b'.repeat(64), 'c'.repeat(64)]
const immutableAssetHashes = ['a'.repeat(64), ...reviewAssetHashes]
const baseCampaign = {
  id: 'campaign-1', title: 'Launch', brief: pilotCampaignFixture.brief, status: 'in_review', revision: 4,
  selectedCopyId: 'copy-set-1', selectedDirectionId: 'direction-1', compositionId: 'composition-1',
  currentVersionNumber: 1, openVersionId: version.id, createdBy: 'marketer-1',
  createdAt: now, updatedAt: now, archivedAt: null,
}

function reviewEvent(id, eventType, actorId, actorRole, payload) {
  const seconds = { sent: 0, ready: 1, changes_requested: 1, rejected: 2, approved: 2, delivered: 3 }
  return {
    id, campaignId: baseCampaign.id, versionId: version.id, actorId, actorRole, eventType, payload,
    createdAt: new Date(now.getTime() + (seconds[eventType] ?? 0) * 1_000),
  }
}

function sent() {
  return reviewEvent('event-sent', 'sent', 'marketer-1', 'marketer', {
    contentHash: version.contentHash,
    assetHashes: snapshot.assets.slice(1).map((asset) => asset.sha256),
  })
}

function ready(actorId = 'designer-1') {
  return reviewEvent('event-ready', 'ready', actorId, 'designer', {
    figmaUrl: 'https://www.figma.com/design/file/review', checklistAnswers,
    readyActorId: actorId, contentHash: version.contentHash, assetHashes: immutableAssetHashes,
  })
}

function harness({ campaign = baseCampaign, events = [sent()] } = {}) {
  let currentCampaign = structuredClone(campaign)
  const currentEvents = structuredClone(events)
  const repository = {
    findVersionById: vi.fn(async (id) => id === version.id ? version : null),
    findCurrentVersion: vi.fn(async () => version),
    lockCampaign: vi.fn(async () => currentCampaign),
    listEvents: vi.fn(async () => currentEvents),
    listVersionAssetHashes: vi.fn(async () => ({
      source: [immutableAssetHashes[0]], review: reviewAssetHashes,
    })),
    appendEvent: vi.fn(async (event) => { currentEvents.push(event); return event }),
    updateCampaignReviewState: vi.fn(async ({ status, openVersionId }) => {
      currentCampaign = { ...currentCampaign, status, openVersionId, revision: currentCampaign.revision + 1, updatedAt: now }
      return currentCampaign
    }),
    appendAudit: vi.fn(async (event) => event),
  }
  const idempotencyService = {
    executeDatabaseCommand: vi.fn(async ({ operation }) => ({ ...await operation({ query: vi.fn() }), replayed: false })),
  }
  let sequence = 0
  const service = createReviewService({
    pool: { query: vi.fn() },
    repositoryFactory: () => repository,
    idempotencyService,
    idGenerator: () => `generated-${++sequence}`,
    clock: () => now,
  })
  return { service, repository, idempotencyService, events: currentEvents, campaign: () => currentCampaign }
}

describe('review service', () => {
  test('designer request-changes closes the exact open version atomically', async () => {
    const { service, repository } = harness()
    const result = await service.requestChanges({
      actor: { id: 'designer-1', role: 'designer' }, versionId: version.id,
      expectedRevision: 4, idempotencyKey: 'changes-1', input: { comment: 'Increase contrast.' },
    })

    expect(result.body).toMatchObject({ campaign: { status: 'changes_requested', openVersionId: null, revision: 5 }, reviewStatus: 'changes_requested' })
    expect(repository.appendEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'changes_requested', payload: { comment: 'Increase contrast.' } }))
    expect(repository.appendAudit).toHaveBeenCalledOnce()
  })

  test('designer mark-ready persists immutable Figma, checklist, actor, and content hash facts', async () => {
    const { service, repository } = harness()
    const result = await service.markReady({
      actor: { id: 'designer-1', role: 'designer' }, versionId: version.id,
      expectedRevision: 4, idempotencyKey: 'ready-1',
      input: { figmaUrl: 'https://www.figma.com/design/file/review', checklistAnswers },
    })

    expect(result.body).toMatchObject({ campaign: { status: 'ready', openVersionId: version.id }, reviewStatus: 'ready' })
    expect(repository.appendEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'ready',
      payload: {
        figmaUrl: 'https://www.figma.com/design/file/review', checklistAnswers,
        readyActorId: 'designer-1', contentHash: version.contentHash, assetHashes: immutableAssetHashes,
      },
    }))
  })

  test('marketer reject closes a ready round with a comment', async () => {
    const { service } = harness({ campaign: { ...baseCampaign, status: 'ready' }, events: [sent(), ready()] })
    const result = await service.reject({
      actor: { id: 'marketer-2', role: 'marketer' }, versionId: version.id,
      expectedRevision: 4, idempotencyKey: 'reject-1', input: { comment: 'Correct the offer.' },
    })
    expect(result.body).toMatchObject({ campaign: { status: 'changes_requested', openVersionId: null }, reviewStatus: 'changes_requested' })
  })

  test('marketer approve targets the exact ready content hash and closes the round', async () => {
    const { service, repository } = harness({ campaign: { ...baseCampaign, status: 'ready' }, events: [sent(), ready()] })
    const result = await service.approve({
      actor: { id: 'marketer-2', role: 'marketer' }, versionId: version.id,
      expectedRevision: 4, idempotencyKey: 'approve-1', input: {},
    })
    expect(result.body).toMatchObject({ campaign: { status: 'approved', openVersionId: null }, reviewStatus: 'approved' })
    expect(repository.appendEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'approved', payload: { contentHash: version.contentHash, assetHashes: immutableAssetHashes },
    }))
  })

  test('rejects a review whose sent hash set differs from trusted immutable review assets', async () => {
    const unexpectedHash = 'd'.repeat(64)
    const { service, repository } = harness({
      events: [reviewEvent('event-sent', 'sent', 'marketer-1', 'marketer', {
        contentHash: version.contentHash,
        assetHashes: [reviewAssetHashes[0], unexpectedHash],
      })],
    })
    await expect(service.markReady({
      actor: { id: 'designer-1', role: 'designer' }, versionId: version.id,
      expectedRevision: 4, idempotencyKey: 'untrusted-assets',
      input: { figmaUrl: 'https://figma.com/design/file/review', checklistAnswers },
    })).rejects.toMatchObject({ statusCode: 409, code: 'invalid_review_history' })
    expect(repository.appendEvent).not.toHaveBeenCalled()
  })

  test('persisted ready actor cannot approve after changing role', async () => {
    const { service, repository } = harness({ campaign: { ...baseCampaign, status: 'ready' }, events: [sent(), ready('person-1')] })
    await expect(service.approve({
      actor: { id: 'person-1', role: 'marketer' }, versionId: version.id,
      expectedRevision: 4, idempotencyKey: 'approve-self', input: {},
    })).rejects.toMatchObject({ statusCode: 403, code: 'self_approval_forbidden' })
    expect(repository.appendEvent).not.toHaveBeenCalled()
  })

  test('reopen leaves the closed version untouched and returns the campaign to composed', async () => {
    const { service, repository } = harness({
      campaign: { ...baseCampaign, status: 'changes_requested', openVersionId: null },
      events: [sent(), reviewEvent('event-change', 'changes_requested', 'designer-1', 'designer', { comment: 'Adjust spacing.' })],
    })
    const result = await service.reopen({
      actor: { id: 'admin-1', role: 'admin' }, campaignId: baseCampaign.id,
      expectedRevision: 4, idempotencyKey: 'reopen-1', input: {},
    })
    expect(result.body.campaign).toMatchObject({ status: 'composed', openVersionId: null, currentVersionNumber: 1 })
    expect(repository.appendEvent).not.toHaveBeenCalled()
    expect(repository.appendAudit).toHaveBeenCalledOnce()
  })

  test('rejects a stale revision and a historical version before side effects', async () => {
    const stale = harness()
    await expect(stale.service.markReady({
      actor: { id: 'designer-1', role: 'designer' }, versionId: version.id,
      expectedRevision: 3, idempotencyKey: 'ready-stale',
      input: { figmaUrl: 'https://figma.com/design/file/review', checklistAnswers },
    })).rejects.toMatchObject({ statusCode: 409, code: 'revision_conflict' })
    expect(stale.repository.appendEvent).not.toHaveBeenCalled()

    const historical = harness({ campaign: { ...baseCampaign, currentVersionNumber: 2, openVersionId: 'version-2' } })
    await expect(historical.service.requestChanges({
      actor: { id: 'designer-1', role: 'designer' }, versionId: version.id,
      expectedRevision: 4, idempotencyKey: 'historical', input: { comment: 'No.' },
    })).rejects.toMatchObject({ statusCode: 409, code: 'version_not_current' })
    expect(historical.repository.appendEvent).not.toHaveBeenCalled()
  })

  test('fingerprints the action, revision, and strict input inside the version scope', async () => {
    const { service, idempotencyService } = harness()
    await service.requestChanges({
      actor: { id: 'designer-1', role: 'designer' }, versionId: version.id,
      expectedRevision: 4, idempotencyKey: 'same', input: { comment: 'Increase contrast.' },
    })
    expect(idempotencyService.executeDatabaseCommand).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'designer-1', method: 'POST', resourceId: version.id, key: 'same',
      payload: { action: 'request_changes', expectedRevision: 4, input: { comment: 'Increase contrast.' } },
    }))
  })
})
