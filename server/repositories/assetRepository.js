function safeByteSize(value) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new RangeError('Asset byte size is invalid')
  return parsed
}

function mapAsset(row) {
  if (!row) return null
  return {
    id: row.id,
    campaignId: row.campaign_id,
    kind: row.kind,
    objectKey: row.object_key,
    mimeType: row.mime_type,
    byteSize: safeByteSize(row.byte_size),
    width: row.width,
    height: row.height,
    sha256: row.sha256,
    source: row.source,
    generationJobId: row.generation_job_id,
    versionId: row.version_id,
  }
}

export function createAssetRepository(client) {
  if (!client || typeof client.query !== 'function') throw new TypeError('A PostgreSQL pool or client is required')
  return {
    async findReadableById({ assetId, actorId }) {
      const result = await client.query(
        `SELECT a.*
         FROM assets a
         JOIN campaigns c ON c.id = a.campaign_id
         JOIN users u ON u.id = $2
         WHERE a.id = $1
           AND c.archived_at IS NULL
           AND u.disabled = false
           AND u.disabled_at IS NULL
           AND u.role IN ('marketer', 'designer', 'admin')
           AND (a.kind <> 'delivery_zip' OR u.role IN ('marketer', 'admin'))`,
        [assetId, actorId],
      )
      return mapAsset(result.rows[0])
    },
  }
}
