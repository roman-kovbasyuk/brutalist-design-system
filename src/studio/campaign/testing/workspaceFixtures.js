import { hashCanonical } from '../../../../shared/canonicalJson.js'
import { studioTemplates } from '../../../../shared/studioTemplates.js'

const timestamp = '2026-09-06T10:00:00Z'
const statuses = {
  draft: 'draft', 'copy-ready': 'copy_ready', 'visuals-ready': 'direction_selected',
  composed: 'composed', 'in-review': 'in_review', 'changes-requested': 'changes_requested',
  ready: 'ready', approved: 'approved', delivered: 'delivered',
}

/** Node/test-only builders. The browser playground must use serialized snapshots. */
export function makeDraftWorkspace(overrides = {}) {
  return {
    campaign: {
      id: 'campaign-1', title: 'Quiet autumn launch', status: 'draft', revision: 0,
      brief: { product: 'Headphones', audience: 'Commuters', objective: 'Shop the collection',
        offer: '20% off', locale: 'en', notes: 'Promote headphones for a quieter commute.' },
      selectedCopyId: null, selectedDirectionId: null, compositionId: null,
      currentVersionNumber: 0, openVersionId: null, createdBy: 'marketer-1',
      createdAt: timestamp, updatedAt: timestamp, archivedAt: null,
      ...overrides,
    },
    copies: [], directions: [], composition: null, versions: [], jobs: [], delivery: null,
  }
}

export function makeScenario(name) {
  if (!Object.hasOwn(statuses, name)) throw new TypeError(`Unknown campaign scenario: ${name}`)
  const phase = Object.keys(statuses).indexOf(name)
  const workspace = makeDraftWorkspace({ status: statuses[name], revision: phase })
  const actor = { id: 'marketer-1', role: 'marketer', displayName: 'Demo Marketer', email: 'marketer@example.test' }
  const templates = structuredClone(studioTemplates).map(manifest => ({
    id: manifest.id, name: manifest.name, version: manifest.version, manifest,
  }))
  const copy = { id: 'copy-1', headline: 'Find your quiet', body: 'A calmer daily commute.',
    cta: 'Shop now', offer: '20% off', visualPrompt: 'Editorial image of headphones in soft daylight.' }
  const direction = { id: 'direction-1', title: 'Soft daylight', prompt: copy.visualPrompt,
    status: 'ready', previewAssetId: 'image-1' }
  let reviewHistory = null

  if (phase >= 1) {
    workspace.copies = [{ id: 'copy-set-1', stale: false,
      selectedCandidateId: phase >= 2 ? copy.id : null,
      candidates: [copy, { ...copy, id: 'copy-2', headline: 'Sound for your day' }],
    }]
    workspace.jobs = [{
      id: 'analysis-job-1', campaignId: 'campaign-1', step: 'brief_analysis',
      provider: 'mock', model: 'mock-v1', region: 'europe-west6', status: 'succeeded',
      attempts: 1, safety: {}, usage: {}, reservedCostMicrounits: 0, actualCostMicrounits: 0,
      timeoutAt: timestamp, createdAt: timestamp, updatedAt: timestamp, errorCode: null,
      result: { analysis: { summary: 'Promote headphones for a quieter commute.', themes: ['Calm'], warnings: [] } },
    }]
  }
  if (phase >= 2) {
    workspace.campaign.selectedCopyId = 'copy-set-1'
    workspace.campaign.selectedDirectionId = direction.id
    workspace.directions = [{ ...direction, stale: false }]
  }
  if (phase >= 3) {
    const template = templates.find(item => item.id === 'editorial-split')
    workspace.composition = {
      id: 'composition-1', templateId: template.id, templateVersion: template.version,
      ratioIds: ['square'], slotValues: { headline: copy.headline, body: copy.body,
        cta: copy.cta, tag: copy.offer, image: direction.previewAssetId },
      validation: { valid: true, errors: [] }, stale: false,
    }
    workspace.campaign.compositionId = 'composition-1'
  }
  if (phase >= 4) {
    const template = templates.find(item => item.id === workspace.composition.templateId)
    const assets = [
      { id: 'image-1', kind: 'direction', sha256: 'a'.repeat(64) },
      { id: 'review-png-1', kind: 'review_png', sha256: 'b'.repeat(64) },
      { id: 'manifest-1', kind: 'manifest', sha256: 'd'.repeat(64) },
    ]
    const snapshot = structuredClone({ selectedCopy: copy, selectedDirection: direction,
      composition: workspace.composition, assets, templateManifest: template.manifest,
      templateManifestHash: hashCanonical(template.manifest) })
    const version = { id: 'version-1', campaignId: 'campaign-1', versionNumber: 1,
      snapshot, contentHash: hashCanonical(snapshot), createdBy: actor.id, createdAt: timestamp }
    workspace.versions = [version]
    workspace.campaign.currentVersionNumber = 1
    workspace.campaign.openVersionId = ['in-review', 'ready'].includes(name) ? version.id : null
    const payload = { contentHash: version.contentHash, assetHashes: assets.map(item => item.sha256).sort() }
    const events = []
    const event = (eventType, actorRole, actorId, eventPayload) => events.push({
      id: `event-${events.length + 1}`, campaignId: 'campaign-1', versionId: version.id,
      actorRole, actorId, eventType, payload: eventPayload,
      createdAt: `2026-09-06T10:0${events.length}:00Z`,
    })
    event('sent', 'marketer', actor.id, { ...payload,
      assetHashes: assets.filter(item => ['review_png', 'manifest'].includes(item.kind)).map(item => item.sha256).sort() })
    if (name === 'changes-requested') event('changes_requested', 'designer', 'designer-1', { comment: 'Make the headline clearer.' })
    if (phase >= 6) event('ready', 'designer', 'designer-1', {
      ...payload, readyActorId: 'designer-1', figmaUrl: 'https://www.figma.com/design/fixture/review',
      checklistAnswers: { copyAccuracy: true, layoutQuality: true, exportReadiness: true },
    })
    if (phase >= 7) event('approved', 'marketer', actor.id, payload)
    if (phase >= 8) {
      workspace.delivery = { id: 'delivery-1', campaignId: 'campaign-1', versionId: version.id,
        contentHash: version.contentHash, asset: { id: 'zip-1', kind: 'delivery_zip', sha256: 'c'.repeat(64) },
        byteSize: 1024, createdBy: actor.id, createdAt: timestamp }
      event('delivered', 'marketer', actor.id, { ...payload, assetHashes: [workspace.delivery.asset.sha256], deliveryId: 'delivery-1' })
    }
    reviewHistory = { version, events, status: statuses[name], requestId: 'fixture-review' }
  }
  return { workspace, actor, templates, reviewHistory }
}
