import { describe, expect, test } from 'vitest'
import {
  analyseBriefInputSchema,
  analyseBriefResultSchema,
  copyGenerationRequestSchema,
  directionGenerationRequestSchema,
  generateCopyInputSchema,
  generateCopyResultSchema,
  generateDirectionsInputSchema,
  generateDirectionsResultSchema,
  generateImageInputSchema,
  generateImageResultSchema,
  imageGenerationRequestSchema,
} from './contracts.js'

const brief = {
  product: 'Nordic language course',
  audience: 'Busy adults',
  objective: 'Trial signups',
  offer: 'First week free',
  locale: 'en-GB',
  notes: 'Keep the tone direct.',
}

describe('strict generation contracts', () => {
  test('accepts the four validated provider inputs and rejects undeclared controls', () => {
    expect(analyseBriefInputSchema.safeParse({ brief }).success).toBe(true)
    expect(generateCopyInputSchema.safeParse({ brief, analysis: { summary: 'A focused course launch.', themes: ['speed'], warnings: [] } }).success).toBe(true)
    expect(generateDirectionsInputSchema.safeParse({ brief, copy: { id: 'copy-1', headline: 'Learn now', body: 'Short daily lessons.', offer: '', cta: 'Start', visualPrompt: 'A clear Nordic desk scene.' } }).success).toBe(true)
    expect(generateImageInputSchema.safeParse({ direction: { id: 'direction-1', title: 'Nordic focus', prompt: 'Soft daylight on a clean desk.', status: 'pending', previewAssetId: null }, width: 1200, height: 628 }).success).toBe(true)
    expect(generateImageInputSchema.safeParse({ direction: { id: 'direction-1', title: 'Nordic focus', prompt: 'Soft daylight on a clean desk.', status: 'pending', previewAssetId: null }, width: 1200, height: 628, video: true }).success).toBe(false)
  })

  test('requires provider, model, region, safe integer cost, usage, and safety on every result', () => {
    const metadata = {
      provider: 'mock', model: 'mock-v1', region: 'europe-west6',
      usage: { inputUnits: 20, outputUnits: 10 }, actualCostMicrounits: 120,
      safety: { verdict: 'safe', categories: [] },
    }
    expect(analyseBriefResultSchema.safeParse({ ...metadata, analysis: { summary: 'A launch.', themes: ['clarity'], warnings: [] } }).success).toBe(true)
    const copies = Array.from({ length: 5 }, (_, index) => ({
      id: `copy-${index + 1}`, headline: `Learn now ${index + 1}`, body: 'Short lessons.', offer: '', cta: 'Start', visualPrompt: 'A Nordic desk.',
    }))
    expect(generateCopyResultSchema.safeParse({ ...metadata, copies }).success).toBe(true)
    expect(generateCopyResultSchema.safeParse({ ...metadata, copies: copies.slice(0, 4) }).success).toBe(false)
    expect(generateDirectionsResultSchema.safeParse({ ...metadata, directions: [{ id: 'direction-1', title: 'Nordic focus', prompt: 'Soft daylight.', status: 'pending', previewAssetId: null }] }).success).toBe(true)
    expect(generateImageResultSchema.safeParse({ ...metadata, image: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png', width: 1200, height: 628 } }).success).toBe(true)
    expect(generateImageResultSchema.safeParse({ ...metadata, actualCostMicrounits: 1.5, image: { bytes: new Uint8Array([1]), mimeType: 'image/png', width: 1, height: 1 } }).success).toBe(false)
  })

  test('keeps public generation request bodies narrow and video-free', () => {
    expect(copyGenerationRequestSchema.safeParse({}).success).toBe(true)
    expect(directionGenerationRequestSchema.safeParse({}).success).toBe(true)
    expect(imageGenerationRequestSchema.safeParse({ directionId: 'direction-1', width: 1200, height: 628 }).success).toBe(true)
    expect(imageGenerationRequestSchema.safeParse({ directionId: 'direction-1', width: 1200, height: 628, mediaType: 'video' }).success).toBe(false)
  })
})
