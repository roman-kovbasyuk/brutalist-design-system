import { withTransaction } from '../db/pool.js'
import { createSettingsRepository } from '../repositories/settingsRepository.js'
import { assertProviderRegistry, providerTupleAllowed } from '../providers/registry.js'

const seedTuple = Object.freeze({ provider: 'mock', model: 'mock-v1', region: 'europe-west6' })

export class GenerationSettingsConflictError extends Error {
  constructor() {
    super('Persisted generation settings conflict with the active provider configuration')
    this.name = 'GenerationSettingsConflictError'
    this.code = 'generation_settings_conflict'
  }
}

function matchesTuple(value, tuple) {
  return value?.provider === tuple.provider && value?.model === tuple.model && value?.region === tuple.region
}

export async function reconcileGenerationSettings({
  pool,
  providerRegistry,
  selected,
  transaction = withTransaction,
  createRepository = createSettingsRepository,
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required')
  assertProviderRegistry(providerRegistry)
  if (!providerTupleAllowed(providerRegistry, selected)) throw new TypeError('The selected production provider configuration is not active')

  return transaction(pool, async (client) => {
    const repository = createRepository(client)
    const current = await repository.getForUpdate()
    if (!current) throw new GenerationSettingsConflictError()
    if (providerTupleAllowed(providerRegistry, current)) return current
    const untouchedSeed = matchesTuple(current, seedTuple) && current.revision === 0 && current.updatedBy === null
    if (!untouchedSeed) throw new GenerationSettingsConflictError()
    return repository.initializeProviderTuple(selected)
  })
}
