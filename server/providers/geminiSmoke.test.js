import { describe, expect, test, vi } from 'vitest'
import { runGeminiSmoke } from './geminiSmoke.js'

describe('Gemini smoke command', () => {
  test('does not create a provider or spend unless explicitly enabled', async () => {
    const createProvider = vi.fn()
    const write = vi.fn()

    await expect(runGeminiSmoke({ environment: {}, createProvider, write })).resolves.toBe(false)

    expect(createProvider).not.toHaveBeenCalled()
    expect(write).toHaveBeenCalledWith('Gemini smoke test disabled; no provider call was made.')
  })
})
