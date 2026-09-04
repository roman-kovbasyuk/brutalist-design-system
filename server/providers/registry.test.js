import { describe, expect, test, vi } from 'vitest'
import { createGenerationControlPlane } from '../repositories/generationJobRepository.js'

describe('generation provider registry', () => {
  test('rejects multiple tuples for one provider because services are indexed only by provider name', () => {
    expect(() => createGenerationControlPlane({
      pool: { query: vi.fn() },
      providerRegistry: {
        mock: [
          { model: 'mock-v1', region: 'europe-west6' },
          { model: 'mock-v2', region: 'us-central1' },
        ],
      },
    })).toThrow(/exactly one model and region tuple/i)
  })
})
