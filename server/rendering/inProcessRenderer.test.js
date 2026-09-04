import { describe, expect, test } from 'vitest'
import sharp from 'sharp'
import { pilotTemplateFixture } from '../../shared/fixtures/pilotTemplate.js'
import { createInProcessRenderer, RendererError } from './inProcessRenderer.js'

async function sourceImage({ width = 1000, height = 1000, color = '#db2777' } = {}) {
  return sharp({ create: { width, height, channels: 4, background: color } }).png().toBuffer()
}

async function validInput(overrides = {}) {
  const image = await sourceImage()
  return {
    manifest: structuredClone(pilotTemplateFixture),
    ratio: 'square',
    slots: {
      headline: 'Learn Norwegian with confidence',
      body: 'Short, focused lessons built for busy adults.',
      cta: 'Start learning',
      image: { bytes: image, mimeType: 'image/png' },
    },
    ...overrides,
  }
}

describe('deterministic in-process banner renderer', () => {
  test('renders exact pilot pixels with pinned Inter weights and a normalized deterministic manifest', async () => {
    const renderer = createInProcessRenderer()
    const input = await validInput()
    const first = await renderer.renderComposition(input)
    const second = await renderer.renderComposition(input)
    const metadata = await sharp(first.bytes).metadata()

    expect(metadata).toMatchObject({ format: 'png', width: 1080, height: 1080 })
    expect(Buffer.from(second.bytes)).toEqual(Buffer.from(first.bytes))
    expect(second.sha256).toBe(first.sha256)
    expect(first).toMatchObject({ mimeType: 'image/png', width: 1080, height: 1080, byteSize: first.bytes.length })
    expect(first.renderManifest).toMatchObject({
      schemaVersion: 1,
      template: { id: 'split-focus', version: '1.0.0', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
      ratio: 'square',
      canvas: { width: 1080, height: 1080 },
      slots: [
        { id: 'headline', type: 'text', lines: ['Learn Norwegian', 'with confidence'], font: { family: 'Inter', weight: 700, size: 64 } },
        { id: 'body', type: 'text', lines: ['Short, focused lessons built for', 'busy adults.'], font: { family: 'Inter', weight: 400, size: 32 } },
        { id: 'cta', type: 'cta', lines: ['Start learning'], font: { family: 'Inter', weight: 600, size: 28 } },
        { id: 'image', type: 'image', source: { mimeType: 'image/png', width: 1000, height: 1000, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) } },
      ],
      output: { mimeType: 'image/png', width: 1080, height: 1080, byteSize: first.bytes.length, sha256: first.sha256 },
    })
    expect(JSON.stringify(first.renderManifest)).not.toMatch(/timestamp|node_modules|\/Users\//)
  })

  test('clips all source image and text pixels to their declared placements', async () => {
    const result = await createInProcessRenderer().renderComposition(await validInput())
    const { data, info } = await sharp(result.bytes).raw().toBuffer({ resolveWithObject: true })
    const placements = pilotTemplateFixture.slots.map((slot) => slot.placements.square)

    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const offset = (y * info.width + x) * info.channels
        const isWhite = data[offset] === 255 && data[offset + 1] === 255 && data[offset + 2] === 255
        if (!isWhite) {
          expect(placements.some((box) => x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height)).toBe(true)
        }
      }
    }
    const leftBoundary = (10 * info.width + 575) * info.channels
    const imageBoundary = (10 * info.width + 576) * info.channels
    expect([...data.subarray(leftBoundary, leftBoundary + 3)]).toEqual([255, 255, 255])
    expect([...data.subarray(imageBoundary, imageBoundary + 3)]).toEqual([219, 39, 119])
  })

  test('preserves intentional newlines and rejects computed or unbreakable line overflow without truncation', async () => {
    const renderer = createInProcessRenderer()
    const explicit = await validInput()
    explicit.slots.headline = 'Learn Norwegian\nwith confidence'
    expect((await renderer.renderComposition(explicit)).renderManifest.slots[0].lines)
      .toEqual(['Learn Norwegian', 'with confidence'])

    const computed = await validInput()
    computed.slots.headline = 'One two three four five six seven eight nine ten eleven twelve'
    await expect(renderer.renderComposition(computed)).rejects.toMatchObject({ code: 'line_overflow' })
    const unbreakable = await validInput()
    unbreakable.slots.headline = 'X'.repeat(70)
    await expect(renderer.renderComposition(unbreakable)).rejects.toMatchObject({ code: 'unbreakable_overflow' })
  })

  test.each([
    ['unknown ratio', (input) => { input.ratio = 'portrait' }, 'unsupported_ratio'],
    ['unknown slot', (input) => { input.slots.extra = 'nope' }, 'unknown_slot'],
    ['missing required slot', (input) => { delete input.slots.cta }, 'missing_slot'],
    ['excessive characters', (input) => { input.slots.body = 'x'.repeat(161) }, 'character_limit'],
    ['explicit line overflow', (input) => { input.slots.body = 'a\nb\nc\nd' }, 'line_overflow'],
    ['unsupported family', (input) => { input.manifest.slots[0].fontFamily = 'Arial' }, 'unsupported_font'],
    ['unsupported weight', (input) => { input.manifest.slots[0].fontWeight = 500 }, 'unsupported_font'],
    ['minimum readable size', (input) => { input.manifest.slots[0].fontSize = 47 }, 'invalid_manifest'],
    ['unsafe placement', (input) => { input.manifest.slots[0].placements.square.x = 0 }, 'invalid_manifest'],
    ['unsupported image MIME', async (input) => {
      input.slots.image = { bytes: await sourceImage(), mimeType: 'image/webp' }
    }, 'unsupported_image'],
  ])('rejects %s', async (_name, mutate, code) => {
    const input = await validInput()
    await mutate(input)
    await expect(createInProcessRenderer().renderComposition(input)).rejects.toBeInstanceOf(RendererError)
    await expect(createInProcessRenderer().renderComposition(input)).rejects.toMatchObject({ code })
  })
})
