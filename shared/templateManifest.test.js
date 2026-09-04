import { describe, expect, test } from 'vitest'
import { templateManifestSchema, validateComposition } from './templateManifest.js'
import { pilotTemplateFixture } from './fixtures/pilotTemplate.js'

const validInput = {
  ratioIds: ['square'],
  slotValues: {
    headline: 'Speak before you move',
    body: 'Build practical Norwegian confidence for everyday life in Oslo.',
    cta: 'Explore the intensive',
    image: 'asset-direction-1',
  },
  assetMetadata: {
    'asset-direction-1': { width: 1600, height: 1600, mimeType: 'image/jpeg' },
  },
}

const cloneTemplate = () => structuredClone(pilotTemplateFixture)

describe('template manifest contract', () => {
  test('accepts the complete pilot manifest', () => {
    expect(templateManifestSchema.parse(pilotTemplateFixture)).toEqual(pilotTemplateFixture)
  })

  test.each(['0.0.0', '1.2.3', '1.2.3-rc.1+build.5'])('accepts SemVer version %s', (version) => {
    expect(templateManifestSchema.safeParse({ ...pilotTemplateFixture, version }).success).toBe(true)
  })

  test.each(['01.2.3', '1.02.3', '1.2.03', '1.2.3-01'])('rejects non-compliant SemVer version %s', (version) => {
    expect(templateManifestSchema.safeParse({ ...pilotTemplateFixture, version }).success).toBe(false)
  })

  test('rejects a text placement outside its ratio safe area', () => {
    const manifest = cloneTemplate()
    manifest.slots[0].placements.square.x = 40

    expect(templateManifestSchema.safeParse(manifest).success).toBe(false)
  })

  test('rejects a font size below its declared minimum', () => {
    const manifest = cloneTemplate()
    manifest.slots[0].fontSize = 47

    expect(templateManifestSchema.safeParse(manifest).success).toBe(false)
  })

  test('rejects an image placement outside its ratio canvas', () => {
    const manifest = cloneTemplate()
    manifest.slots[3].placements.square.width = 505

    expect(templateManifestSchema.safeParse(manifest).success).toBe(false)
  })

  test('accepts a composition matching the pilot template', () => {
    expect(validateComposition(pilotTemplateFixture, validInput)).toEqual({ valid: true, errors: [] })
  })

  test('rejects an unsupported requested ratio', () => {
    const result = validateComposition(pilotTemplateFixture, { ...validInput, ratioIds: ['story'] })

    expect(result).toEqual({ valid: false, errors: ['Unsupported ratio: story.'] })
  })

  test('rejects a missing required slot', () => {
    const { cta: _cta, ...slotValues } = validInput.slotValues
    const result = validateComposition(pilotTemplateFixture, { ...validInput, slotValues })

    expect(result).toEqual({ valid: false, errors: ['Missing required slot: cta.'] })
  })

  test('rejects headline copy over its character limit', () => {
    const result = validateComposition(pilotTemplateFixture, {
      ...validInput,
      slotValues: { ...validInput.slotValues, headline: 'a'.repeat(81) },
    })

    expect(result).toEqual({ valid: false, errors: ['Slot headline exceeds its 80 character limit.'] })
  })

  test('rejects text that exceeds its maximum line count', () => {
    const result = validateComposition(pilotTemplateFixture, {
      ...validInput,
      slotValues: { ...validInput.slotValues, body: 'One\nTwo\nThree\nFour' },
    })

    expect(result).toEqual({ valid: false, errors: ['Slot body exceeds its 3 line limit.'] })
  })

  test('rejects a slot that is not defined by the manifest', () => {
    const result = validateComposition(pilotTemplateFixture, {
      ...validInput,
      slotValues: { ...validInput.slotValues, eyebrow: 'New' },
    })

    expect(result).toEqual({ valid: false, errors: ['Unknown slot: eyebrow.'] })
  })

  test('rejects image metadata below the slot minimum dimensions', () => {
    const result = validateComposition(pilotTemplateFixture, {
      ...validInput,
      assetMetadata: {
        'asset-direction-1': { width: 799, height: 800, mimeType: 'image/jpeg' },
      },
    })

    expect(result).toEqual({ valid: false, errors: ['Asset asset-direction-1 is smaller than image slot image minimum dimensions (800×800).'] })
  })

  test('returns deterministic validation errors for malformed composition input', () => {
    expect(validateComposition(pilotTemplateFixture, {})).toEqual({
      valid: false,
      errors: ['Invalid composition input.'],
    })
  })
})
