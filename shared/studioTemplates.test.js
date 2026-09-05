import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import sharp from 'sharp'
import { studioTemplates, studioTemplateSamples } from './studioTemplates.js'
import { templateManifestSchema } from './templateManifest.js'
import { createInProcessRenderer } from '../server/rendering/inProcessRenderer.js'

const renderer = createInProcessRenderer()
const image = await readFile('src/studio/assets/headphones.png')

describe('production studio template family', () => {
  test.each(studioTemplates)('$name renders actual PNGs in all four delivery sizes', async (manifest) => {
    expect(templateManifestSchema.parse(manifest)).toEqual(manifest)
    for (const ratio of manifest.ratios) {
      const result = await renderer.renderComposition({ manifest, ratio: ratio.id, slots: {
        ...studioTemplateSamples[manifest.id], image: { bytes: image, mimeType: 'image/png' },
      } })
      const metadata = await sharp(result.bytes).metadata()
      expect(metadata).toMatchObject({ format: 'png', width: ratio.width, height: ratio.height })
      expect(result.renderManifest.slots.map((slot) => slot.id).sort()).toEqual(['body', 'cta', 'headline', 'image'])
      const pixel = await sharp(result.bytes).extract({ left: 0, top: 0, width: 1, height: 1 }).removeAlpha().raw().toBuffer()
      expect([...pixel]).toEqual(manifest.presentation.backgroundColor.slice(1).match(/../g).map((part) => parseInt(part, 16)))
      expect(result.byteSize).toBeGreaterThan(30000)
    }
  }, 30000)

  test.each(['url(https://invalid.test)', '#ffffff" onload="alert(1)', 'red', '#fff'])('rejects unsafe presentation color %s', (fill) => {
    const manifest = structuredClone(studioTemplates[0])
    manifest.presentation.shapes[0].fill = fill
    expect(templateManifestSchema.safeParse(manifest).success).toBe(false)
  })

  test('rejects unknown slots, unknown ratios, missing geometry, and shapes outside the canvas', () => {
    for (const change of [
      (m) => { m.presentation.slotColors.unknown = '#000000' },
      (m) => { m.presentation.shapes[0].placements.extra = { x: 0, y: 0, width: 1, height: 1 } },
      (m) => { delete m.presentation.shapes[0].placements.story },
      (m) => { m.presentation.shapes[0].placements.square.width = 1081 },
    ]) {
      const manifest = structuredClone(studioTemplates[0]); change(manifest)
      expect(templateManifestSchema.safeParse(manifest).success).toBe(false)
    }
  })

  test('preserves malicious-looking copy as glyphs and binds presentation changes to template hash', async () => {
    const manifest = structuredClone(studioTemplates[0])
    const input = { manifest, ratio: 'square', slots: { headline: '<b>Hello</b>', body: 'Sound & space', cta: 'Listen now', image: { bytes: image, mimeType: 'image/png' } } }
    const first = await renderer.renderComposition(input)
    expect(first.renderManifest.slots.find((slot) => slot.id === 'headline').lines.join(' ')).toBe('<b>Hello</b>')
    manifest.presentation.slotColors.headline = '#000000'
    const second = await renderer.renderComposition(input)
    expect(second.sha256).not.toBe(first.sha256)
    expect(second.renderManifest.template.sha256).not.toBe(first.renderManifest.template.sha256)
  })
})
