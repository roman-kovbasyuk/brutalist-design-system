import { describe, expect, test, vi } from 'vitest'
import { createGenerationControlPlane } from '../repositories/generationJobRepository.js'
import {
  createGenerationProviderRegistry,
  providerTupleAllowed,
  resolveProviderConfiguration,
} from './registry.js'

describe('generation provider registry', () => {
  test('builds one exact tuple for the configured Gemini text and image models in eu', () => {
    const registry = createGenerationProviderRegistry({
      provider: 'gemini',
      textModel: 'gemini-3.5-flash',
      imageModel: 'gemini-3.1-flash-image',
      region: 'eu',
    })
    expect(registry).toEqual({
      gemini: [{ model: 'gemini-3.5-flash', imageModel: 'gemini-3.1-flash-image', region: 'eu' }],
    })
    expect(['brief_analysis', 'copy', 'directions'].map((step) => resolveProviderConfiguration(registry, {
      provider: 'gemini', model: 'gemini-3.5-flash', region: 'eu',
    }, step)?.model)).toEqual([
      'gemini-3.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash',
    ])
    expect(resolveProviderConfiguration(registry, {
      provider: 'gemini', model: 'gemini-3.5-flash', region: 'eu',
    }, 'image')).toEqual({ provider: 'gemini', model: 'gemini-3.1-flash-image', region: 'eu' })
    expect(providerTupleAllowed(registry, {
      provider: 'gemini', model: 'gemini-3.1-flash-image', region: 'eu', step: 'image',
    })).toBe(true)
    expect(providerTupleAllowed(registry, {
      provider: 'gemini', model: 'gemini-3.5-flash', region: 'eu', step: 'image',
    })).toBe(false)
    expect(resolveProviderConfiguration(registry, {
      provider: 'gemini', model: 'unapproved', region: 'eu',
    }, 'copy')).toBeNull()
    expect(resolveProviderConfiguration(registry, {
      provider: 'gemini', model: 'gemini-3.5-flash', region: 'eu',
    }, 'video')).toBeNull()
  })

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
