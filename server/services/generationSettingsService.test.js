import { describe, expect, test, vi } from 'vitest'
import { createGenerationProviderRegistry } from '../providers/registry.js'
import { reconcileGenerationSettings } from './generationSettingsService.js'

const selection = { provider: 'gemini', model: 'gemini-3.5-flash', region: 'eu' }
const registry = createGenerationProviderRegistry({
  provider: 'gemini', textModel: selection.model, imageModel: 'gemini-3.1-flash-image', region: selection.region,
})

function harness(current) {
  const repository = {
    getForUpdate: vi.fn(async () => current),
    initializeProviderTuple: vi.fn(async (tuple) => ({ ...current, ...tuple })),
  }
  return {
    repository,
    reconcile: () => reconcileGenerationSettings({
      pool: { query: vi.fn() }, providerRegistry: registry, selected: selection,
      transaction: async (_pool, operation) => operation({ query: vi.fn() }),
      createRepository: () => repository,
    }),
  }
}

describe('generation settings reconciliation', () => {
  test('atomically replaces only the untouched seed tuple and preserves controls', async () => {
    const current = {
      provider: 'mock', model: 'mock-v1', region: 'europe-west6', dailyBudgetMicrounits: 91,
      perStepRegenerationLimit: 7, generationDisabled: true, revision: 0, updatedBy: null,
    }
    const { repository, reconcile } = harness(current)

    await expect(reconcile()).resolves.toMatchObject({ ...selection, dailyBudgetMicrounits: 91, perStepRegenerationLimit: 7, generationDisabled: true })
    expect(repository.initializeProviderTuple).toHaveBeenCalledWith(selection)
  })

  test('accepts an existing tuple that is active in the registry without overwriting it', async () => {
    const current = { ...selection, revision: 8, updatedBy: 'admin-1' }
    const { repository, reconcile } = harness(current)

    await expect(reconcile()).resolves.toBe(current)
    expect(repository.initializeProviderTuple).not.toHaveBeenCalled()
  })

  test('keeps the fresh mock seed as a no-op when mock is the selected registry', async () => {
    const current = { provider: 'mock', model: 'mock-v1', region: 'europe-west6', revision: 0, updatedBy: null }
    const mockRegistry = createGenerationProviderRegistry({
      provider: 'mock', textModel: 'mock-v1', imageModel: 'mock-v1', region: 'europe-west6',
    })
    const repository = { getForUpdate: vi.fn(async () => current), initializeProviderTuple: vi.fn() }

    await expect(reconcileGenerationSettings({
      pool: { query: vi.fn() }, providerRegistry: mockRegistry,
      selected: { provider: 'mock', model: 'mock-v1', region: 'europe-west6' },
      transaction: async (_pool, operation) => operation({ query: vi.fn() }),
      createRepository: () => repository,
    })).resolves.toBe(current)
    expect(repository.initializeProviderTuple).not.toHaveBeenCalled()
  })

  test.each([
    [{ provider: 'mock', model: 'mock-v1', region: 'europe-west6', revision: 1, updatedBy: 'admin-1' }],
    [{ provider: 'gemini', model: 'retired-model', region: 'eu', revision: 2, updatedBy: 'admin-1' }],
  ])('fails safely for an existing configuration that conflicts with the active registry', async (current) => {
    const { repository, reconcile } = harness(current)

    await expect(reconcile()).rejects.toMatchObject({
      code: 'generation_settings_conflict',
      message: 'Persisted generation settings conflict with the active provider configuration',
    })
    expect(repository.initializeProviderTuple).not.toHaveBeenCalled()
  })
})
