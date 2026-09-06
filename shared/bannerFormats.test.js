import { expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import { studioTemplates, studioTemplateSamples } from './studioTemplates.js'
import * as catalog from './bannerFormats.js'
import { templateManifestSchema } from './templateManifest.js'
import { createInProcessRenderer } from '../server/rendering/inProcessRenderer.js'

test('every advertised format renders at its exact dimensions in every selectable studio template', async () => {
  expect(catalog.bannerFormats.map(format => [format.width, format.height])).toEqual(expect.arrayContaining([[1080, 1080], [1080, 1350], [1080, 1920], [1200, 628], [1920, 1080], [1200, 1200], [1080, 1440]]))
  expect(new Set(catalog.bannerFormats.flatMap(format => format.categories))).toEqual(new Set(['social', 'google-ads', 'stories', 'video']))
  const image = { bytes: await readFile('src/studio/assets/headphones.png'), mimeType: 'image/png' }
  for (const manifest of studioTemplates) {
    expect(templateManifestSchema.safeParse(manifest).success).toBe(true)
    for (const format of catalog.bannerFormats) {
      const result = await createInProcessRenderer().renderComposition({ manifest, ratio: format.id, slots: { ...studioTemplateSamples[manifest.id], tag: '20% off until Sunday', image } })
      expect([result.width, result.height]).toEqual([format.width, format.height])
    }
  }
}, 30000)
