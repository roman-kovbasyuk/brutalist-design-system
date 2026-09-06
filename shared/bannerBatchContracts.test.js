import { expect, test } from 'vitest'
import { campaignVersionSnapshotSchema } from './contracts.js'
import { pilotCampaignFixture } from './fixtures/pilotCampaign.js'
import { pilotTemplateFixture } from './fixtures/pilotTemplate.js'
import { hashCanonical } from './canonicalJson.js'

function snapshot() {
  const designs = [1, 2].map(index => ({ id: `design-${index}`, selectedCopy: { ...pilotCampaignFixture.selectedCopy, id: `copy-${index}` },
    selectedDirection: { ...pilotCampaignFixture.selectedDirection, id: `direction-${index}`, previewAssetId: `asset-${index}` },
    templateManifest: pilotTemplateFixture, templateManifestHash: hashCanonical(pilotTemplateFixture) }))
  return { ...designs[0], id: undefined, composition: { ...pilotCampaignFixture.composition,
    slotValues: { ...pilotCampaignFixture.composition.slotValues, image: 'asset-1' },
    designs: designs.map(design => ({ id: design.id, templateId: pilotTemplateFixture.id, templateVersion: pilotTemplateFixture.version,
      copySetId: 'copy-set', copyId: design.selectedCopy.id, directionId: design.selectedDirection.id,
      slotValues: { ...pilotCampaignFixture.composition.slotValues, image: design.selectedDirection.previewAssetId }, validation: { valid: true, errors: [] } })) },
    assets: [1, 2].map(index => ({ id: `asset-${index}`, kind: 'direction', sha256: String(index).repeat(64) })), designs }
}

test.each([
  ['absent source', value => { value.assets.pop() }],
  ['unknown preview', value => { value.designs[1].selectedDirection.previewAssetId = 'unknown' }],
  ['preview from another design', value => { value.designs[1].selectedDirection.previewAssetId = 'asset-1' }],
  ['image slot from another design', value => { value.composition.designs[1].slotValues.image = 'asset-1' }],
  ['wrong source kind', value => { value.assets[1].kind = 'review_png' }],
  ['ambiguous source', value => { value.assets.push(value.assets[1]) }],
])('rejects non-first batch design with %s', (_name, mutate) => {
  const value = snapshot()
  delete value.id
  expect(campaignVersionSnapshotSchema.safeParse(value).success).toBe(true)
  mutate(value)
  expect(campaignVersionSnapshotSchema.safeParse(value).success).toBe(false)
})
