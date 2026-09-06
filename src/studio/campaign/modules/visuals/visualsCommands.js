import { stableInputKey } from '../../moduleContracts.js'
import { selectedCopies, missingStatic } from './visualsModel.js'
import { MAX_VISUAL_UPLOAD_BYTES } from '../../../../../shared/visualContracts.js'

export function createVisualsCommands(runtime) {
  let batching = false
  const snapshot = () => runtime.getSnapshot('visuals')
  const sourceKey = () => stableInputKey({ brief: snapshot().input.brief, copies: snapshot().input.copies })
  const rejected = (code, message) => ({ ok: false, code, message })
  const options = () => ({ expectedInputKey: runtime.getSnapshot('visuals').inputKey })
  const assertDirection = (workspace, id, ready = false) => {
    if (!workspace.directions.some(item => item.id === id && !item.stale && (!ready || (item.status === 'ready' && item.previewAssetId))))
      throw Object.assign(new Error('This visual direction is no longer available.'), { status: 409, code: 'direction_unavailable' })
  }
  const image = async directionId => {
    const result = await runtime.execute('visuals', `image:${directionId}`, async ({ api, workspace, idempotencyKey, waitForJob }) => {
      assertDirection(workspace, directionId)
      const direction = workspace.directions.find(item => item.id === directionId)
      if (direction.previewAssetId) throw Object.assign(new Error('This visual already has an image.'), { status: 409, code: 'visual_already_ready' })
      await waitForJob(await api.generate(workspace.campaign.id, 'image', { directionId, width: 1080, height: 1080 }, idempotencyKey))
    }, { ...options(), idempotent: true, intent: { directionId } })
    // Known failures also have durable per-card job state to display. An uncertain
    // operation must keep its original identity until the runtime reconciles it.
    if (!result.ok && snapshot().operation.kind !== 'uncertain') await runtime.refresh().catch(() => {})
    return result
  }
  async function generateImages(ids, initialSource, onProgress) {
    const failures = []
    for (const [index, directionId] of ids.entries()) {
      if (sourceKey() !== initialSource) return rejected('source_changed', 'Copy or brief changed. Review the remaining prompts before generating images.')
      onProgress?.({ stage: 'images', total: ids.length, current: index + 1, directionId })
      const result = await image(directionId)
      if (!result.ok) {
        failures.push({ directionId, ...result })
        if (snapshot().operation.kind === 'uncertain' || !['generation_failed', 'generation_blocked'].includes(result.code)) return result
      }
    }
    return failures.length ? { ok: false, code: 'partial_generation', message: `${failures.length} visual${failures.length === 1 ? '' : 's'} could not be generated. Your other images are saved.`, failures } : { ok: true }
  }
  return Object.freeze({
    // Safe automatic handoff: text prompts only. Never call image/generateAll here.
    preparePrompts: ({ retry = false } = {}) => runtime.execute('visuals', 'prepare-prompts', async ({ api, workspace, idempotencyKey, waitForJob }) => {
      await waitForJob(await api.generate(workspace.campaign.id, 'directions', { mode: 'campaign' }, idempotencyKey))
    }, { ...options(), idempotent: true, idempotencyKey: retry ? undefined : 'initial-directions-v1' }),
    async generate(mode = 'campaign', { onProgress } = {}) {
      if (batching) return rejected('visuals_busy', 'Visuals are already being generated.')
      if (!['campaign', 'selected_copy'].includes(mode)) return rejected('invalid_method', 'Choose a visual generation method.')
      const copies = selectedCopies(snapshot().input)
      if (mode === 'selected_copy' && !copies.length) return rejected('copy_not_approved', 'Select at least one copy option first.')
      const input = mode === 'campaign' ? { mode } : { mode, copyIds: copies.map(copy => copy.id) }
      const initialSource = sourceKey()
      batching = true
      try {
        onProgress?.({ stage: 'prompts', total: mode === 'campaign' ? 3 : copies.length, current: 0 })
        let ids = []
        const prepared = await runtime.execute('visuals', `generate:${mode}`, async ({ api, workspace, idempotencyKey, waitForJob }) => {
          const job = await waitForJob(await api.generate(workspace.campaign.id, 'directions', input, idempotencyKey))
          ids = job.result.directions.map(direction => direction.id)
        }, { ...options(), idempotent: true, intent: input })
        return prepared.ok ? await generateImages(ids, initialSource, onProgress) : prepared
      } finally { batching = false; onProgress?.(null) }
    },
    async generateAll({ onProgress } = {}) {
      if (batching) return rejected('visuals_busy', 'Visuals are already being generated.')
      batching = true
      try { return await generateImages(missingStatic(snapshot().input).map(item => item.id), sourceKey(), onProgress) }
      finally { batching = false; onProgress?.(null) }
    },
    image: directionId => batching ? Promise.resolve(rejected('visuals_busy', 'Wait for this batch to finish.')) : image(directionId),
    async upload(target, file) {
      if (batching) return rejected('visuals_busy', 'Wait for this batch to finish.')
      if (!file || file.size < 1 || file.size > MAX_VISUAL_UPLOAD_BYTES || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        return rejected('invalid_image', 'Choose a PNG, JPEG or WebP image up to 5 MB.')
      }
      const expectedInputKey = snapshot().inputKey
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = () => reject(new Error('The image file could not be read.'))
        reader.readAsDataURL(file)
      })
      const input = { target, name: file.name, mimeType: file.type, data }
      return runtime.execute('visuals', `upload:${target.directionId ?? target.copyId ?? 'campaign'}`, async ({ api, workspace, idempotencyKey }) => {
        await api.uploadVisual(workspace.campaign.id, input, workspace.campaign.revision, idempotencyKey)
      }, { expectedInputKey, intent: input, idempotent: true })
    },
    select: directionId => runtime.execute('visuals', 'select', async ({ api, workspace }) => {
      assertDirection(workspace, directionId, true)
      await api.selectDirection(workspace.campaign.id, { directionId }, workspace.campaign.revision)
    }, { ...options(), intent: { directionId }, reconcile: ({ current }) => current.campaign.selectedDirectionId === directionId ? 'applied' : 'unknown' }),
  })
}
