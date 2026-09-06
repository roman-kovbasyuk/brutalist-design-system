import { hashCanonical } from '../../shared/canonicalJson.js'
import { copyVariantSchema } from '../../shared/contracts.js'
import { rawBrief } from '../../shared/briefAnalysis.js'

export function visualError(code, message, statusCode = 409) {
  return Object.assign(new Error(message), { code, statusCode, publicMessage: message, expose: true })
}

/** Called inside the campaign lock: one authoritative, immutable source snapshot. */
export async function loadVisualContext(client, campaign, input) {
  const result = await client.query(
    'SELECT id, candidates, selected_candidate_id, approved_candidate_ids, deleted_candidate_ids FROM copy_sets WHERE campaign_id = $1 AND stale = false ORDER BY created_at, id', [campaign.id])
  const copies = result.rows.flatMap(set => set.candidates.filter(copy => !set.deleted_candidate_ids.includes(copy.id)))
    .map(copy => copyVariantSchema.parse(copy))
  const analysis = await client.query(
    `SELECT result_metadata->'analysis' AS analysis, input_snapshot->'brief' AS brief FROM generation_jobs
     WHERE campaign_id = $1 AND step = 'brief_analysis' AND status = 'succeeded' ORDER BY created_at DESC, id DESC LIMIT 1`, [campaign.id])
  if (!analysis.rows[0]?.analysis || !analysis.rows[0].brief
    || hashCanonical(rawBrief(campaign.brief)) !== hashCanonical(rawBrief(analysis.rows[0].brief))) {
    throw visualError('visual_input_required', 'Analyze the current brief to create visual prompts.')
  }
  const currentAnalysis = campaign.brief.analysis ?? analysis.rows[0].analysis
  if (input.mode === 'campaign') return { mode: 'campaign', brief: campaign.brief, analysis: currentAnalysis, copies }
  const approved = new Set(result.rows.flatMap(set => [...set.approved_candidate_ids,
    ...(set.id === campaign.selectedCopyId && set.selected_candidate_id ? [set.selected_candidate_id] : [])]))
  const selected = input.copyIds.map(id => {
    const copy = copies.find(item => item.id === id)
    if (!copy || !approved.has(id)) throw visualError('copy_not_approved', 'Select current copy options before generating their visuals.')
    return copy
  })
  return { mode: 'selected_copy', brief: campaign.brief, analysis: currentAnalysis, copies: selected }
}

/** Provider order is not trusted. Every selected copy must be explicitly mapped once. */
export function validVisualResult(context, directions) {
  if (!context.mode) return true // Compatibility with historical direction jobs.
  if (!directions || new Set(directions.map(item => item.id)).size !== directions.length
    || directions.some(item => item.status !== 'pending' || item.previewAssetId !== null)) return false
  if (context.mode === 'campaign') return directions.length === 3 && directions.every(item => !item.copyId)
  return directions.length === context.copies.length
    && new Set(directions.map(item => item.copyId)).size === directions.length
    && directions.every(item => context.copies.some(copy => copy.id === item.copyId))
}
