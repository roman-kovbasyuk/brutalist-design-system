import { describe, expect, test } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { pilotTemplateFixture } from '../../shared/fixtures/pilotTemplate.js'
import { createInProcessRenderer, RendererError, svgGlyphLayer } from './inProcessRenderer.js'

const require = createRequire(import.meta.url)

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
  test('rejects unreadable font bytes instead of falling back to a host font', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'banner-fonts-'))
    const invalidFont = join(directory, 'invalid.woff2')
    await writeFile(invalidFont, Buffer.from('not a font'))
    try {
      expect(() => createInProcessRenderer({
        resolvedFontFiles: { 400: invalidFont, 600: invalidFont, 700: invalidFont },
      })).toThrow(expect.objectContaining({ code: 'invalid_font' }))
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('rejects an incomplete bundled Inter weight set during renderer construction', () => {
    expect(() => createInProcessRenderer({ resolvedFontFiles: {} }))
      .toThrow(expect.objectContaining({ code: 'invalid_font' }))
  })

  test('rejects a readable but wrong Inter face instead of substituting it', () => {
    expect(() => createInProcessRenderer({
      resolvedFontFiles: {
        400: require.resolve('inter-ui/web/Inter-Regular.woff2'),
        600: require.resolve('inter-ui/display/InterDisplay-SemiBold.woff2'),
        700: require.resolve('inter-ui/display/InterDisplay-Bold.woff2'),
      },
    })).toThrow(expect.objectContaining({ code: 'invalid_font' }))
  })

  test('renders the same glyphs with visibly distinct bundled Inter 400, 600, and 700 outlines', async () => {
    const renderer = createInProcessRenderer()
    const hashes = []
    for (const fontWeight of [400, 600, 700]) {
      const input = await validInput()
      input.manifest.slots[0].fontWeight = fontWeight
      hashes.push((await renderer.renderComposition(input)).sha256)
    }

    expect(new Set(hashes)).toHaveLength(3)
  })

  test('emits shaped glyph paths without SVG text or host-font instructions', () => {
    const svg = svgGlyphLayer({
      width: 200,
      height: 80,
      lines: [{ baseline: 32, glyphs: [{ path: 'M0 0L10 0L10 10Z', x: 2, yOffset: 0, scale: 0.04 }] }],
    }).toString('utf8')

    expect(svg).toContain('<path ')
    expect(svg).not.toContain('<text')
    expect(svg).not.toContain('font-family')
  })

  test('renders exact pilot pixels with pinned Inter weights and a normalized deterministic manifest', async () => {
    const renderer = createInProcessRenderer()
    const input = await validInput()
    const first = await renderer.renderComposition(input)
    const second = await renderer.renderComposition(input)
    const metadata = await sharp(first.bytes).metadata()

    expect(metadata).toMatchObject({ format: 'png', width: 1080, height: 1080 })
    expect(Buffer.from(second.bytes)).toEqual(Buffer.from(first.bytes))
    expect(second.sha256).toBe(first.sha256)
    expect(first.sha256).toBe('e505e233174b40069ad84377bec91b9980db8ebbe3994ab27b7655961c94f917')
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
