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

  test.each([
    [{ error: { code: 'rate_limited', message: 'raw quota secret' }, safety: { verdict: 'safe', categories: [] } }, 'rate_limited'],
    [{ error: { code: 'provider_unavailable', message: 'raw backend secret' }, safety: { verdict: 'safe', categories: [] } }, 'provider_unavailable'],
    [{ safety: { verdict: 'blocked', categories: ['raw-policy-secret'] } }, 'provider_blocked'],
  ])('fails safely when an enabled smoke call does not succeed', async (result, code) => {
    const provider = { analyseBrief: vi.fn(async () => result), close: vi.fn(async () => {}) }
    const write = vi.fn()

    await expect(runGeminiSmoke({
      environment: {
        NODE_ENV: 'test', GENERATION_PROVIDER: 'gemini', VERTEX_AI_PROJECT_ID: 'banner-project',
        GEMINI_SMOKE_ENABLED: 'true',
      },
      createProvider: () => provider,
      write,
    })).rejects.toThrow(`Gemini smoke failed: ${code}`)

    expect(write).not.toHaveBeenCalled()
    expect(provider.close).toHaveBeenCalledOnce()
  })
})
