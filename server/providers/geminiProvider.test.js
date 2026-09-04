import { describe, expect, test, vi } from 'vitest'
import {
  buildBriefAnalysisPrompt,
  buildCopyPrompt,
  buildDirectionsPrompt,
  buildImagePrompt,
  createConservativeGeminiCostEstimator,
  createGeminiProvider,
} from './geminiProvider.js'

const brief = {
  product: 'Nordic language course',
  audience: 'Busy adults',
  objective: 'Trial signups',
  offer: 'First week free',
  locale: 'en-GB',
  notes: 'Keep the tone direct.',
}
const analysis = { summary: 'A focused launch.', themes: ['clarity'], warnings: [] }
const copy = {
  id: 'copy-1', headline: 'Learn now', body: 'Short daily lessons.', offer: 'First week free',
  cta: 'Start', visualPrompt: 'A clear Nordic desk scene.',
}
const direction = {
  id: 'direction-1', title: 'Nordic focus', prompt: 'Soft daylight on a clean desk.',
  status: 'pending', previewAssetId: null,
}

function textResponse(value, overrides = {}) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return {
    candidates: [{
      finishReason: 'STOP',
      content: { role: 'model', parts: [{ text }] },
      safetyRatings: [],
    }],
    promptFeedback: undefined,
    usageMetadata: {
      promptTokenCount: 100,
      candidatesTokenCount: 40,
      thoughtsTokenCount: 10,
      totalTokenCount: 150,
    },
    text,
    ...overrides,
  }
}

function copyVariants(count = 3) {
  return Array.from({ length: count }, (_, index) => ({
    id: `copy-${index + 1}`,
    headline: `Headline ${index + 1}`,
    body: `Body ${index + 1}`,
    offer: 'First week free',
    cta: 'Start',
    visualPrompt: `Visual ${index + 1}`,
  }))
}

function directions(count = 5) {
  return Array.from({ length: count }, (_, index) => ({
    id: `direction-${index + 1}`,
    title: `Direction ${index + 1}`,
    prompt: `Editorial scene ${index + 1}. No embedded text or logos.`,
    status: 'pending',
    previewAssetId: null,
  }))
}

function pngHeader(width, height) {
  const bytes = Buffer.alloc(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0)
  bytes.writeUInt32BE(13, 8)
  bytes.write('IHDR', 12, 'ascii')
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

function harness(response, overrides = {}) {
  const client = {
    models: { generateContent: vi.fn(async () => response) },
    close: vi.fn(async () => {}),
  }
  const estimateCost = vi.fn(() => 321)
  const provider = createGeminiProvider({
    client,
    project: 'banner-project',
    location: 'eu',
    textModel: 'gemini-3.5-flash',
    imageModel: 'gemini-3.1-flash-image',
    estimateCost,
    ...overrides,
  })
  return { client, estimateCost, provider }
}

describe('Gemini Vertex AI generation provider', () => {
  test('constructs the v1 Vertex AI client when an SDK client is not injected', () => {
    const client = { models: { generateContent: vi.fn() } }
    const clientFactory = vi.fn(() => client)

    createGeminiProvider({
      clientFactory,
      project: 'banner-project',
      location: 'eu',
      textModel: 'gemini-3.5-flash',
      imageModel: 'gemini-3.1-flash-image',
    })

    expect(clientFactory).toHaveBeenCalledWith({
      vertexai: true,
      project: 'banner-project',
      location: 'eu',
      httpOptions: { apiVersion: 'v1' },
    })
  })

  test('analyses a brief through strict JSON structured output', async () => {
    const { client, provider } = harness(textResponse({ analysis }))
    const signal = new AbortController().signal

    const result = await provider.analyseBrief({ brief }, signal)

    expect(result).toMatchObject({
      provider: 'gemini', model: 'gemini-3.5-flash', region: 'eu', analysis,
      usage: { inputUnits: 100, outputUnits: 50 }, actualCostMicrounits: 321,
      safety: { verdict: 'safe', categories: [] },
    })
    expect(client.models.generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-3.5-flash',
      contents: buildBriefAnalysisPrompt({ brief }),
      config: expect.objectContaining({
        abortSignal: signal,
        responseMimeType: 'application/json',
        responseJsonSchema: expect.objectContaining({ type: 'object', additionalProperties: false }),
      }),
    }))
  })

  test('returns exactly three strict copy variants and rejects a different count', async () => {
    const valid = harness(textResponse({ copies: copyVariants(3) }))
    const validResult = await valid.provider.generateCopy({ brief, analysis }, new AbortController().signal)
    expect(validResult.copies).toHaveLength(3)
    expect(valid.client.models.generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-3.5-flash',
      contents: buildCopyPrompt({ brief, analysis }),
      config: expect.objectContaining({
        responseMimeType: 'application/json',
        responseJsonSchema: expect.objectContaining({
          properties: expect.objectContaining({ copies: expect.objectContaining({ minItems: 3, maxItems: 3 }) }),
        }),
      }),
    }))

    const invalid = harness(textResponse({ copies: copyVariants(2) }))
    await expect(invalid.provider.generateCopy({ brief, analysis }, new AbortController().signal))
      .resolves.toMatchObject({ error: { code: 'invalid_output', retryable: true } })
  })

  test('returns exactly five strict visual directions with deterministic no-text image instructions', async () => {
    const { client, provider } = harness(textResponse({ directions: directions(5) }))

    const result = await provider.generateDirections({ brief, copy }, new AbortController().signal)

    expect(result.directions).toHaveLength(5)
    const request = client.models.generateContent.mock.calls[0][0]
    expect(request.contents).toBe(buildDirectionsPrompt({ brief, copy }))
    expect(request.contents).toMatch(/no embedded text or logos/i)
    expect(request.config.responseJsonSchema.properties.directions).toMatchObject({ minItems: 5, maxItems: 5 })
  })

  test('extracts exactly one supported inline image as bytes with its dimensions', async () => {
    const bytes = pngHeader(1200, 628)
    const response = {
      candidates: [{
        finishReason: 'STOP',
        content: { role: 'model', parts: [{ inlineData: { mimeType: 'image/png', data: bytes.toString('base64') } }] },
        safetyRatings: [],
      }],
      promptFeedback: undefined,
      usageMetadata: { promptTokenCount: 24, candidatesTokenCount: 1120, totalTokenCount: 1144 },
    }
    const { client, provider } = harness(response)

    const result = await provider.generateImage({ direction, width: 1200, height: 628 }, new AbortController().signal)

    expect(result.image).toEqual({ bytes: new Uint8Array(bytes), mimeType: 'image/png', width: 1200, height: 628 })
    const request = client.models.generateContent.mock.calls[0][0]
    expect(request).toMatchObject({
      model: 'gemini-3.1-flash-image',
      contents: buildImagePrompt({ direction, width: 1200, height: 628 }),
      config: { abortSignal: expect.any(AbortSignal), responseModalities: ['IMAGE'] },
    })
    expect(request.contents).toMatch(/no embedded text or logos/i)
  })

  test.each([
    ['missing', []],
    ['multiple', [
      { inlineData: { mimeType: 'image/png', data: pngHeader(1200, 628).toString('base64') } },
      { inlineData: { mimeType: 'image/png', data: pngHeader(1200, 628).toString('base64') } },
    ]],
    ['unsupported', [{ inlineData: { mimeType: 'image/gif', data: 'R0lGODlh' } }]],
  ])('normalizes %s inline image output as invalid without returning bytes', async (_case, parts) => {
    const { provider } = harness({
      candidates: [{ finishReason: 'STOP', content: { role: 'model', parts }, safetyRatings: [] }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
    })

    const result = await provider.generateImage({ direction, width: 1200, height: 628 }, new AbortController().signal)

    expect(result).toMatchObject({ error: { code: 'invalid_output' }, safety: { verdict: 'safe' } })
    expect(result).not.toHaveProperty('image')
  })

  test('normalizes a safety block with category names and no generated content', async () => {
    const { provider } = harness({
      candidates: [],
      promptFeedback: {
        blockReason: 'SAFETY',
        safetyRatings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'HIGH', blocked: true }],
        blockReasonMessage: 'raw policy detail',
      },
      usageMetadata: { promptTokenCount: 20, totalTokenCount: 20 },
    })

    const result = await provider.analyseBrief({ brief }, new AbortController().signal)

    expect(result).toMatchObject({
      safety: { verdict: 'blocked', categories: ['HARM_CATEGORY_DANGEROUS_CONTENT'] },
      error: { code: 'provider_blocked', message: 'The provider blocked this request for safety reasons.', retryable: false },
    })
    expect(result).not.toHaveProperty('analysis')
    expect(JSON.stringify(result)).not.toContain('raw policy detail')
  })

  test.each([
    [429, 'rate_limited', 'The generation provider is temporarily rate limited.'],
    [503, 'provider_unavailable', 'The generation provider is temporarily unavailable.'],
  ])('normalizes known provider status %i without exposing the SDK error', async (status, code, message) => {
    const sdkError = Object.assign(new Error('credential and raw provider detail'), { status })
    const { client, provider } = harness(undefined)
    client.models.generateContent.mockRejectedValueOnce(sdkError)

    const result = await provider.generateCopy({ brief, analysis }, new AbortController().signal)

    expect(result).toMatchObject({ error: { code, message, retryable: true } })
    expect(JSON.stringify(result)).not.toContain('credential')
  })

  test('throws ambiguous transport errors so the generation service can record unknown', async () => {
    const transportError = Object.assign(new Error('socket closed after dispatch'), { code: 'ECONNRESET' })
    const { client, provider } = harness(undefined)
    client.models.generateContent.mockRejectedValueOnce(transportError)

    await expect(provider.generateCopy({ brief, analysis }, new AbortController().signal)).rejects.toBe(transportError)
  })

  test('propagates aborts and passes the same signal to the SDK', async () => {
    const abortError = new DOMException('aborted', 'AbortError')
    const { client, provider } = harness(undefined)
    client.models.generateContent.mockRejectedValueOnce(abortError)
    const controller = new AbortController()

    await expect(provider.analyseBrief({ brief }, controller.signal)).rejects.toBe(abortError)
    expect(client.models.generateContent.mock.calls[0][0].config.abortSignal).toBe(controller.signal)

    controller.abort()
    await expect(provider.analyseBrief({ brief }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(client.models.generateContent).toHaveBeenCalledOnce()
  })

  test.each([
    ['markdown fences', textResponse('```json\n{"analysis":{}}\n```')],
    ['undeclared fields', textResponse({ analysis: { ...analysis, providerSecret: 'do-not-pass-through' } })],
  ])('fails closed on %s without repairing or leaking provider output', async (_case, response) => {
    const { provider } = harness(response)

    const result = await provider.analyseBrief({ brief }, new AbortController().signal)

    expect(result).toMatchObject({ error: { code: 'invalid_output', retryable: true } })
    expect(JSON.stringify(result)).not.toContain('providerSecret')
    expect(result).not.toHaveProperty('analysis')
  })

  test('closes an injected client when it supports cleanup', async () => {
    const { client, provider } = harness(textResponse({ analysis }))
    await provider.close()
    await provider.close()
    expect(client.close).toHaveBeenCalledOnce()
  })
})

describe('Gemini prompts and conservative cost estimates', () => {
  test('prompt builders are deterministic and isolate user data from instructions', () => {
    const input = { brief, analysis }
    expect(buildCopyPrompt(input)).toBe(buildCopyPrompt({ analysis, brief: { ...brief } }))
    expect(buildBriefAnalysisPrompt({ brief })).toMatch(/untrusted campaign data/i)
    expect(buildDirectionsPrompt({ brief, copy })).toMatch(/no embedded text or logos/i)
    expect(buildImagePrompt({ direction, width: 1200, height: 628 })).toMatch(/no embedded text or logos/i)
  })

  test('uses integer arithmetic, caps estimates at the reservation, and retains the fallback when usage is unavailable', () => {
    const estimate = createConservativeGeminiCostEstimator()

    expect(estimate({
      operation: 'generateCopy', usage: { inputUnits: 100, outputUnits: 20 }, usageAvailable: true,
      maximumCostMicrounits: 3_000,
    })).toBe(363)
    expect(estimate({
      operation: 'generateCopy', usage: {}, usageAvailable: false, maximumCostMicrounits: 3_000,
    })).toBe(3_000)
    expect(estimate({
      operation: 'generateCopy', usage: { inputUnits: Number.MAX_SAFE_INTEGER, outputUnits: 1 }, usageAvailable: true,
      maximumCostMicrounits: 3_000,
    })).toBe(3_000)
  })
})
