import { describe, expect, test } from 'vitest'
import { inflateSync } from 'node:zlib'
import { createMockProvider } from './mockProvider.js'

const briefA = {
  product: 'Nordic language course', audience: 'Busy adults', objective: 'Trial signups',
  offer: 'First week free', locale: 'en-GB', notes: 'Keep the tone direct.',
}

function decodeMockPng(bytes) {
  const buffer = Buffer.from(bytes)
  expect(buffer.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  let offset = 8
  let width
  let height
  const compressed = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      expect([...data.subarray(8)]).toEqual([8, 0, 0, 0, 0])
    }
    if (type === 'IDAT') compressed.push(data)
    offset += 12 + length
    if (type === 'IEND') break
  }
  const pixels = inflateSync(Buffer.concat(compressed))
  expect(pixels.byteLength).toBe(height * (width + 1))
  for (let row = 0; row < height; row += 1) expect(pixels[row * (width + 1)]).toBe(0)
  return { width, height }
}

describe('deterministic mock generation provider contract', () => {
  test('returns identical useful pilot copy for canonically equivalent input', async () => {
    const provider = createMockProvider({ model: 'mock-pilot-v1', region: 'europe-west6' })
    const first = await provider.generateCopy({ brief: briefA, analysis: { summary: 'Focused launch', themes: ['speed'], warnings: [] } }, new AbortController().signal)
    const second = await provider.generateCopy({ analysis: { warnings: [], themes: ['speed'], summary: 'Focused launch' }, brief: { notes: briefA.notes, locale: briefA.locale, offer: briefA.offer, objective: briefA.objective, audience: briefA.audience, product: briefA.product } }, new AbortController().signal)

    expect(first).toEqual(second)
    expect(first.copies).toHaveLength(5)
    expect(first.copies[0].headline).toContain('Nordic language course')
    expect(first).toMatchObject({
      provider: 'mock', model: 'mock-pilot-v1', region: 'europe-west6',
      safety: { verdict: 'safe' }, actualCostMicrounits: expect.any(Number),
    })
    expect(Number.isSafeInteger(first.actualCostMicrounits)).toBe(true)
  })

  test('analyses notes-only input and returns five deterministic options without invented tags', async () => {
    const provider = createMockProvider()
    const brief = { notes: 'Promote a Norwegian course to busy German-speaking adults. Encourage trial signups.' }
    const signal = new AbortController().signal

    const analysis = await provider.analyseBrief({ brief }, signal)
    const result = await provider.generateCopy({ brief, analysis: analysis.analysis }, signal)

    expect(analysis.analysis.summary).toContain('Norwegian course')
    expect(result.copies).toHaveLength(5)
    expect(new Set(result.copies.map((item) => item.id)).size).toBe(5)
    expect(result.copies.every((item) => item.offer === '')).toBe(true)
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

  test('encodes deterministic valid PNG pixels at the requested dimensions', async () => {
    const provider = createMockProvider()
    const input = {
      direction: { id: 'direction-1', title: 'Nordic focus', prompt: 'Soft daylight.', status: 'pending', previewAssetId: null },
      width: 320,
      height: 180,
    }
    const first = await provider.generateImage(input, new AbortController().signal)
    const second = await provider.generateImage({ height: 180, width: 320, direction: input.direction }, new AbortController().signal)

    expect(decodeMockPng(first.image.bytes)).toEqual({ width: 320, height: 180 })
    expect(first.image.bytes).toEqual(second.image.bytes)
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
