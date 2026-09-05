import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)
const pixel = z.number().int().nonnegative()
const positivePixel = z.number().int().positive()
const semanticVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/

const placementSchema = z.strictObject({
  x: pixel,
  y: pixel,
  width: positivePixel,
  height: positivePixel,
})

const placementsSchema = z.record(z.string(), placementSchema)
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const presentationSchema = z.strictObject({
  backgroundColor: colorSchema,
  slotColors: z.record(z.string(), colorSchema),
  shapes: z.array(z.strictObject({
    type: z.enum(['rect', 'ellipse']),
    fill: colorSchema,
    placements: placementsSchema,
  })).max(12),
})

const ratioSchema = z.strictObject({
  id: nonEmptyString,
  width: positivePixel,
  height: positivePixel,
  safeArea: z.strictObject({
    top: pixel,
    right: pixel,
    bottom: pixel,
    left: pixel,
  }),
})

const textSlotSchema = z.strictObject({
  id: nonEmptyString,
  type: z.enum(['text', 'cta']),
  required: z.boolean(),
  maxCharacters: z.number().int().positive(),
  maxLines: z.number().int().positive(),
  fontFamily: nonEmptyString,
  fontWeight: z.number().int().positive(),
  fontSize: positivePixel,
  minFontSize: positivePixel,
  placements: placementsSchema,
})

const imageSlotSchema = z.strictObject({
  id: nonEmptyString,
  type: z.literal('image'),
  required: z.boolean(),
  minWidth: positivePixel,
  minHeight: positivePixel,
  acceptedMimeTypes: z.array(nonEmptyString).min(1),
  placements: placementsSchema,
})

const slotSchema = z.union([textSlotSchema, imageSlotSchema])

const compositionInputSchema = z.strictObject({
  ratioIds: z.array(nonEmptyString).min(1),
  slotValues: z.record(z.string(), z.string()),
  assetMetadata: z.record(z.string(), z.strictObject({
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
    mimeType: nonEmptyString,
  })),
})

export const templateManifestSchema = z.strictObject({
  id: nonEmptyString,
  version: z.string().regex(semanticVersion),
  name: nonEmptyString,
  ratios: z.array(ratioSchema).min(1),
  slots: z.array(slotSchema).min(1),
  presentation: presentationSchema.optional(),
}).superRefine((manifest, context) => {
  const ratios = new Map()
  const slots = new Set()

  for (const ratio of manifest.ratios) {
    if (ratios.has(ratio.id)) {
      context.addIssue({ code: 'custom', path: ['ratios'], message: `Duplicate ratio: ${ratio.id}.` })
      continue
    }
    ratios.set(ratio.id, ratio)
    if (ratio.safeArea.left + ratio.safeArea.right >= ratio.width || ratio.safeArea.top + ratio.safeArea.bottom >= ratio.height) {
      context.addIssue({ code: 'custom', path: ['ratios'], message: `Safe area leaves no usable space for ratio: ${ratio.id}.` })
    }
  }

  for (const [slotIndex, slot] of manifest.slots.entries()) {
    if (slots.has(slot.id)) {
      context.addIssue({ code: 'custom', path: ['slots', slotIndex, 'id'], message: `Duplicate slot: ${slot.id}.` })
    }
    slots.add(slot.id)

    if (slot.type !== 'image' && slot.fontSize < slot.minFontSize) {
      context.addIssue({ code: 'custom', path: ['slots', slotIndex, 'fontSize'], message: `Slot ${slot.id} font size is below its minimum.` })
    }

    for (const ratio of manifest.ratios) {
      const placement = slot.placements[ratio.id]
      if (!placement) {
        context.addIssue({ code: 'custom', path: ['slots', slotIndex, 'placements'], message: `Slot ${slot.id} is missing a placement for ratio: ${ratio.id}.` })
        continue
      }

      if (placement.x + placement.width > ratio.width || placement.y + placement.height > ratio.height) {
        context.addIssue({ code: 'custom', path: ['slots', slotIndex, 'placements', ratio.id], message: `Slot ${slot.id} placement exceeds the ${ratio.id} canvas.` })
        continue
      }

      if (slot.type !== 'image') {
        const { left, right, top, bottom } = ratio.safeArea
        if (
          placement.x < left ||
          placement.y < top ||
          placement.x + placement.width > ratio.width - right ||
          placement.y + placement.height > ratio.height - bottom
        ) {
          context.addIssue({ code: 'custom', path: ['slots', slotIndex, 'placements', ratio.id], message: `Slot ${slot.id} placement exceeds the ${ratio.id} safe area.` })
        }
      }
    }

    for (const placementRatioId of Object.keys(slot.placements)) {
      if (!ratios.has(placementRatioId)) {
        context.addIssue({ code: 'custom', path: ['slots', slotIndex, 'placements', placementRatioId], message: `Slot ${slot.id} has a placement for unknown ratio: ${placementRatioId}.` })
      }
    }
  }
  if (manifest.presentation) {
    for (const id of Object.keys(manifest.presentation.slotColors)) {
      if (!manifest.slots.some((slot) => slot.id === id && slot.type !== 'image')) {
        context.addIssue({ code: 'custom', path: ['presentation', 'slotColors', id], message: 'Color must reference a text slot.' })
      }
    }
    for (const [index, shape] of manifest.presentation.shapes.entries()) {
      for (const ratio of manifest.ratios) {
        const placement = shape.placements[ratio.id]
        if (!placement || placement.x + placement.width > ratio.width || placement.y + placement.height > ratio.height) {
          context.addIssue({ code: 'custom', path: ['presentation', 'shapes', index], message: `Shape must fit ratio ${ratio.id}.` })
        }
      }
      for (const id of Object.keys(shape.placements)) {
        if (!ratios.has(id)) context.addIssue({ code: 'custom', path: ['presentation', 'shapes', index], message: 'Unknown shape ratio.' })
      }
    }
  }
})

const hasValue = (value) => typeof value === 'string' && value.trim().length > 0

export function validateComposition(manifest, compositionInput) {
  const parsedInput = compositionInputSchema.safeParse(compositionInput)
  if (!parsedInput.success) return { valid: false, errors: ['Invalid composition input.'] }

  const errors = []
  const { ratioIds, slotValues, assetMetadata } = parsedInput.data
  const ratios = new Map(manifest.ratios.map((ratio) => [ratio.id, ratio]))
  const slots = new Map(manifest.slots.map((slot) => [slot.id, slot]))

  if (ratioIds.length === 0) errors.push('At least one ratio is required.')

  for (const ratioId of ratioIds) {
    if (!ratios.has(ratioId)) errors.push(`Unsupported ratio: ${ratioId}.`)
  }

  for (const slotId of Object.keys(slotValues).sort()) {
    if (!slots.has(slotId)) errors.push(`Unknown slot: ${slotId}.`)
  }

  for (const slot of manifest.slots) {
    const value = slotValues[slot.id]
    if (slot.required && !hasValue(value)) {
      errors.push(`Missing required slot: ${slot.id}.`)
      continue
    }
    if (!hasValue(value)) continue

    if (slot.type === 'image') {
      const asset = assetMetadata[value]
      if (!asset) {
        errors.push(`Missing metadata for image asset: ${value}.`)
        continue
      }
      if (!Number.isInteger(asset.width) || !Number.isInteger(asset.height) || asset.width < slot.minWidth || asset.height < slot.minHeight) {
        errors.push(`Asset ${value} is smaller than image slot ${slot.id} minimum dimensions (${slot.minWidth}×${slot.minHeight}).`)
      }
      if (!slot.acceptedMimeTypes.includes(asset.mimeType)) {
        errors.push(`Asset ${value} MIME type is not accepted by image slot ${slot.id}.`)
      }
      continue
    }

    if (value.length > slot.maxCharacters) {
      errors.push(`Slot ${slot.id} exceeds its ${slot.maxCharacters} character limit.`)
    }
    if (value.split(/\r?\n/).length > slot.maxLines) {
      errors.push(`Slot ${slot.id} exceeds its ${slot.maxLines} line limit.`)
    }
  }

  return { valid: errors.length === 0, errors }
}
