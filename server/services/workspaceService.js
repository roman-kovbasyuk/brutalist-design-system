import { withTransaction } from '../db/pool.js'
import { createCampaignRepository } from '../repositories/campaignRepository.js'
import { createGenerationJobRepository } from '../repositories/generationJobRepository.js'
import { createVersionRepository } from '../repositories/versionRepository.js'
import { createDeliveryRepository } from '../repositories/deliveryRepository.js'
import { workspaceRecordSchema } from '../../shared/studioContracts.js'
import { AuthorizationError } from '../auth/authorize.js'

export function createWorkspaceService({ pool, transaction = withTransaction } = {}) {
  return {
    async getWorkspace({ actor, campaignId }) {
      if (!actor?.id || actor.disabled || actor.disabledAt != null || !['marketer', 'designer', 'admin'].includes(actor.role)) {
        throw new AuthorizationError(403, 'forbidden', 'This actor cannot read campaigns')
      }
      return transaction(pool, async (client) => {
        // All records belong to one consistent snapshot, including a concurrent generation/review update.
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        const campaigns = createCampaignRepository(client)
        const campaign = await campaigns.findById(campaignId)
        if (!campaign) return null
        const copies = await client.query('SELECT id, candidates, selected_candidate_id, stale FROM copy_sets WHERE campaign_id = $1 ORDER BY created_at DESC, id DESC', [campaignId])
        const directions = await client.query('SELECT id, title, prompt, status, preview_asset_id, stale FROM visual_directions WHERE campaign_id = $1 ORDER BY created_at DESC, id DESC', [campaignId])
        const versions = await campaigns.listVersions(campaignId)
        const composition = await createVersionRepository(client).findComposition(campaignId, campaign.compositionId)
        const jobs = await createGenerationJobRepository(client).listForCampaign(campaignId)
        const currentVersion = versions.find((version) => version.versionNumber === campaign.currentVersionNumber)
        const storedDelivery = actor.role !== 'designer' && currentVersion
          ? await createDeliveryRepository(client).findDeliveryByVersion(currentVersion.id) : null
        const { storedAsset: _storedAsset, ...delivery } = storedDelivery ?? {}
        return workspaceRecordSchema.parse({
          campaign,
          copies: copies.rows.map((row) => ({ id: row.id, candidates: row.candidates, selectedCandidateId: row.selected_candidate_id, stale: row.stale })),
          directions: directions.rows.map((row) => ({ id: row.id, title: row.title, prompt: row.prompt, status: row.status, previewAssetId: row.preview_asset_id, stale: row.stale })),
          composition, versions, jobs, delivery: storedDelivery ? delivery : null,
        })
      })
    },
  }
}
