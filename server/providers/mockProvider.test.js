import { describe, expect, test } from 'vitest'
import { createMockProvider } from './mockProvider.js'

const briefA = {
  product: 'Nordic language course', audience: 'Busy adults', objective: 'Trial signups',
  offer: 'First week free', locale: 'en-GB', notes: 'Keep the tone direct.',
}

describe('deterministic mock generation provider contract', () => {
  test('returns identical useful pilot copy for canonically equivalent input', async () => {
    const provider = createMockProvider({ model: 'mock-pilot-v1', region: 'europe-west6' })
    const first = await provider.generateCopy({ brief: briefA, analysis: { summary: 'Focused launch', themes: ['speed'], warnings: [] } }, new AbortController().signal)
    const second = await provider.generateCopy({ analysis: { warnings: [], themes: ['speed'], summary: 'Focused launch' }, brief: { notes: briefA.notes, locale: briefA.locale, offer: briefA.offer, objective: briefA.objective, audience: briefA.audience, product: briefA.product } }, new AbortController().signal)

    expect(first).toEqual(second)
    expect(first.copies).toHaveLength(3)
    expect(first.copies[0].headline).toContain('Nordic language course')
    expect(first).toMatchObject({
      provider: 'mock', model: 'mock-pilot-v1', region: 'europe-west6',
      safety: { verdict: 'safe' }, actualCostMicrounits: expect.any(Number),
    })
    expect(Number.isSafeInteger(first.actualCostMicrounits)).toBe(true)
  })

  test('implements brief analysis, five directions, and a temporary PNG without job IDs or video claims', async () => {
    const provider = createMockProvider()
    const signal = new AbortController().signal
    const analysis = await provider.analyseBrief({ brief: briefA }, signal)
    const copy = (await provider.generateCopy({ brief: briefA, analysis: analysis.analysis }, signal)).copies[0]
    const directions = await provider.generateDirections({ brief: briefA, copy }, signal)
    const image = await provider.generateImage({ direction: directions.directions[0], width: 1200, height: 628 }, signal)

    expect(analysis.analysis.summary).toContain('Nordic language course')
    expect(directions.directions).toHaveLength(5)
    expect(image.image).toMatchObject({ mimeType: 'image/png', width: 1200, height: 628, bytes: expect.any(Uint8Array) })
    expect(JSON.stringify({ analysis, directions, image: { ...image, image: { ...image.image, bytes: [] } } })).not.toMatch(/jobId|video|live/i)
  })

  test('returns validated blocked metadata without unsafe bytes', async () => {
    const provider = createMockProvider()
    const blocked = await provider.generateImage({
      direction: { id: 'direction-blocked', title: 'Blocked', prompt: '[blocked] unsafe scene', status: 'pending', previewAssetId: null },
      width: 1200, height: 628,
    }, new AbortController().signal)

    expect(blocked).toMatchObject({ provider: 'mock', safety: { verdict: 'blocked' }, error: { code: 'provider_blocked' } })
    expect(blocked).not.toHaveProperty('image')
  })

  test('honours an already-aborted signal before producing output', async () => {
    const provider = createMockProvider()
    const controller = new AbortController()
    controller.abort()
    await expect(provider.analyseBrief({ brief: briefA }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
