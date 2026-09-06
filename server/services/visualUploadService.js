import { createHash, randomUUID } from 'node:crypto'
import { visualUploadRequestSchema, MAX_VISUAL_UPLOAD_BYTES } from '../../shared/visualContracts.js'
import { hashCanonical } from '../../shared/canonicalJson.js'
import { withTransaction } from '../db/pool.js'
import { createCampaignRepository } from '../repositories/campaignRepository.js'
import { createIdempotencyRepository } from '../repositories/idempotencyRepository.js'
import { createAuditRepository } from '../repositories/auditRepository.js'
import { decodeGeneratedImage } from '../images/imageDecoder.js'
import { validateAssetStore } from '../storage/assetStore.js'
import { loadVisualContext, visualError } from './visualContext.js'

const editable = new Set(['draft', 'copy_ready', 'direction_selected', 'composed'])

export function createVisualUploadService({ pool, assetStore, uploadTimeoutMs = 15000 }) {
  validateAssetStore(assetStore)
  return { async uploadVisual({ actor, campaignId, expectedRevision, idempotencyKey, input }) {
    if (!actor?.id || actor.disabled || actor.disabledAt != null || !['marketer', 'admin'].includes(actor.role)) {
      throw visualError('forbidden', 'This actor cannot upload visuals.', 403)
    }
    const parsed = visualUploadRequestSchema.safeParse(input)
    if (!parsed.success) throw visualError('invalid_request', 'Choose a PNG, JPEG or WebP image up to 5 MB.', 400)
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw visualError('invalid_revision', 'A current campaign revision is required.', 400)
    if (typeof idempotencyKey !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(idempotencyKey)) throw visualError('invalid_idempotency_key', 'An upload request key is required.', 400)
    const command = parsed.data
    const bytes = Buffer.from(command.data, 'base64')
    if (bytes.length > MAX_VISUAL_UPLOAD_BYTES || bytes.toString('base64') !== command.data) throw visualError('invalid_image', 'The image file is invalid or exceeds 5 MB.', 400)
    const image = await decodeGeneratedImage(bytes, command.mimeType)
    if (!image) throw visualError('invalid_image', 'Choose a static PNG, JPEG or WebP up to 4096 × 4096 pixels.', 400)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const scope = { actorId: actor.id, method: 'POST', resourceId: `visual-uploads:${campaignId}`, key: idempotencyKey }
    const fingerprint = hashCanonical({ ...command, data: sha256, expectedRevision })
    return withTransaction(pool, async client => {
      await client.query("SET LOCAL lock_timeout = '20s'")
      await client.query("SET LOCAL statement_timeout = '20s'")
      const campaign = await createCampaignRepository(client).findByIdForUpdate(campaignId)
      if (!campaign) throw visualError('not_found', 'Campaign was not found.', 404)
      const idempotency = createIdempotencyRepository(client)
      const ownerToken = randomUUID()
      const claim = await idempotency.claim({ ...scope, fingerprint, ownerToken })
      if (claim.kind === 'replay') return claim.responseBody
      if (claim.kind !== 'owner') throw visualError('idempotency_conflict', 'This upload key belongs to another request.')
      if (campaign.revision !== expectedRevision) throw visualError('revision_conflict', 'The campaign changed. Refresh before uploading.')
      if (!editable.has(campaign.status) || campaign.openVersionId) throw visualError('campaign_locked', 'This campaign is read-only.')
      const jobs = await client.query("SELECT id FROM generation_jobs WHERE campaign_id = $1 AND status IN ('pending', 'unknown') LIMIT 1", [campaignId])
      if (jobs.rowCount) throw visualError('visual_generation_pending', 'Wait for generation to finish or reconcile before uploading.')
      let directionId = command.target.directionId
      let context
      let targetDirection
      if (directionId) {
        const direction = await client.query('SELECT * FROM visual_directions WHERE campaign_id = $1 AND id = $2 AND stale = false FOR UPDATE', [campaignId, directionId])
        if (!direction.rowCount) throw visualError('direction_not_found', 'This visual is no longer available.', 404)
        targetDirection = direction.rows[0]
      } else {
        context = await loadVisualContext(client, campaign, { mode: command.target.mode, copyIds: [command.target.copyId] })
        directionId = randomUUID()
      }
      const assetId = randomUUID()
      // Zod's bound counts UTF-16 units. Do not leave half a surrogate or a
      // trailing space that would differ from the canonical review snapshot.
      const title = targetDirection?.title ?? command.name.slice(0, 160).replace(/[\uD800-\uDBFF]$/, '').trim()
      const prompt = targetDirection?.prompt ?? ''
      const provenance = { direction: { id: directionId, title, prompt, status: 'ready', previewAssetId: assetId },
        assetId, sha256, context: context ?? targetDirection?.upload_provenance?.context ?? null }
      const objectKey = `campaigns/${createHash('sha256').update(campaignId).digest('hex')}/uploads/${assetId}`
      // A committed intent survives a crash/ambiguous write. Hold the same advisory
      // fence as cleanup until the asset reference commits or this transaction rolls back.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [objectKey])
      // No campaign FK here: a separate connection must not wait on our campaign lock.
      await pool.query(`INSERT INTO orphaned_uploads (id, object_key, reason, expected_sha256, expected_byte_size, expected_mime_type)
        VALUES ($1, $2, 'visual_upload', $3, $4, $5)`, [randomUUID(), objectKey, sha256, bytes.length, image.mimeType])
      let timer
      try {
        await Promise.race([
          assetStore.put({ objectKey, bytes, contentType: image.mimeType, timeoutMs: uploadTimeoutMs }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(visualError('upload_unresolved', 'Upload status is uncertain. Refresh before trying again.', 503)), uploadTimeoutMs) }),
        ])
      } finally { clearTimeout(timer) }
      await client.query(`INSERT INTO assets (id,campaign_id,kind,object_key,mime_type,byte_size,width,height,sha256,source)
        VALUES ($1,$2,'direction',$3,$4,$5,$6,$7,$8,'upload')`, [assetId, campaignId, objectKey, image.mimeType, bytes.length, image.width, image.height, sha256])
      if (context) {
        const copy = context.mode === 'selected_copy' ? context.copies[0] : null
        await client.query(`INSERT INTO visual_directions (id,campaign_id,title,prompt,status,preview_asset_id,scope,copy_snapshot,batch_id,upload_provenance)
          VALUES ($1,$2,$3,$4,'ready',$5,$6,$7,$1,$8)`, [directionId, campaignId, title,
          prompt, assetId, context.mode, copy, provenance])
      } else {
        await client.query("UPDATE visual_directions SET status='ready', preview_asset_id=$2, upload_provenance=$3 WHERE id=$1", [directionId, assetId, provenance])
      }
      const replacesSelection = campaign.selectedDirectionId === directionId
      const activeComposition = campaign.compositionId ? await client.query(
        'SELECT designs FROM compositions WHERE campaign_id = $1 AND id = $2 AND stale = false FOR UPDATE',
        [campaignId, campaign.compositionId],
      ) : null
      const usedByBatch = activeComposition?.rows[0]?.designs?.some(design => design.directionId === directionId) ?? false
      const invalidatesComposition = replacesSelection || usedByBatch
      if (invalidatesComposition) await client.query(
        'UPDATE compositions SET stale = true WHERE campaign_id = $1 AND id = $2 AND stale = false',
        [campaignId, campaign.compositionId],
      )
      const nextStatus = invalidatesComposition && campaign.status === 'composed' ? 'direction_selected' : campaign.status
      await client.query('UPDATE campaigns SET revision = revision + 1, updated_at = now(), status = $2, composition_id = $3 WHERE id = $1',
        [campaignId, nextStatus, invalidatesComposition ? null : campaign.compositionId])
      await client.query('UPDATE orphaned_uploads SET campaign_id = $2 WHERE object_key = $1', [objectKey, campaignId])
      await createAuditRepository(client).append({ id: randomUUID(), actorId: actor.id, actorRole: actor.role,
        action: 'campaign.visual_uploaded', entityType: 'campaign', entityId: campaignId,
        beforeStatus: campaign.status, afterStatus: nextStatus, payload: { directionId, assetId }, createdAt: new Date() })
      const responseBody = { directionId, assetId }
      await idempotency.complete({ ...scope, ownerToken, responseStatus: 201, responseBody })
      return responseBody
    })
  } }
}
