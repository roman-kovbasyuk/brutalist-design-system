import { actorSchema } from './contracts.js'

export const MVP_STORAGE_KEY = 'banner-studio:mvp:v1'

export function parseMutationMeta(meta) {
  const actor = actorSchema.parse(meta?.actor)
  const idempotencyKey = typeof meta?.idempotencyKey === 'string' ? meta.idempotencyKey.trim() : ''
  if (!idempotencyKey) throw new Error('idempotency_key_required')
  return { actor, idempotencyKey }
}

export function idempotencyStorageKey(actor, idempotencyKey) {
  return `${actor.id}:${idempotencyKey}`
}
