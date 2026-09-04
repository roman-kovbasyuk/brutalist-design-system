import { z } from 'zod'
import { templateManifestSchema } from './templateManifest.js'

const nonEmptyString = z.string().trim().min(1)
const nullableAssetId = nonEmptyString.nullable().optional()

export const roleSchema = z.enum(['marketer', 'designer', 'admin'])

export const campaignStatusSchema = z.enum([
  'draft',
  'copy_ready',
  'direction_selected',
  'composed',
  'in_review',
  'changes_requested',
  'ready',
  'approved',
  'delivered',
])

export const reviewStatusSchema = z.enum([
  'in_review',
  'changes_requested',
  'ready',
  'approved',
  'delivered',
  'superseded',
])

export const assetHashSchema = z.string().regex(/^[a-f0-9]{64}$/)

export const briefSchema = z.strictObject({
  product: nonEmptyString.max(200),
  audience: nonEmptyString.max(500),
  objective: nonEmptyString.max(500),
  offer: z.string().trim().max(500),
  locale: nonEmptyString.max(35),
  notes: z.string().trim().max(2_000),
})

export const copyVariantSchema = z.strictObject({
  id: nonEmptyString,
  headline: nonEmptyString.max(160),
  body: nonEmptyString.max(500),
  offer: z.string().trim().max(200),
  cta: nonEmptyString.max(80),
  visualPrompt: nonEmptyString.max(2_000),
})

export const visualDirectionSchema = z.strictObject({
  id: nonEmptyString,
  title: nonEmptyString.max(160),
  prompt: nonEmptyString.max(2_000),
  status: z.enum(['pending', 'ready', 'blocked', 'failed']),
  previewAssetId: nullableAssetId,
})

const compositionValidationSchema = z.strictObject({
  valid: z.boolean(),
  errors: z.array(z.string()),
})

export const compositionSchema = z.strictObject({
  id: nonEmptyString,
  templateId: nonEmptyString,
  templateVersion: nonEmptyString,
  ratioIds: z.array(nonEmptyString).min(1),
  slotValues: z.record(z.string(), z.string()),
  validation: compositionValidationSchema,
  stale: z.boolean(),
})

export const assetReferenceSchema = z.strictObject({
  id: nonEmptyString,
  kind: z.enum(['direction', 'final_image', 'review_png', 'manifest', 'delivery_zip']),
  sha256: assetHashSchema,
})

export const campaignVersionSnapshotSchema = z.strictObject({
  selectedCopy: copyVariantSchema,
  selectedDirection: visualDirectionSchema,
  composition: compositionSchema,
  assets: z.array(assetReferenceSchema),
  templateManifest: templateManifestSchema,
  templateManifestHash: assetHashSchema,
})

export const campaignSchema = z.strictObject({
  id: nonEmptyString,
  title: nonEmptyString.max(200),
  status: campaignStatusSchema,
  revision: z.number().int().nonnegative(),
  brief: briefSchema,
  selectedCopy: copyVariantSchema.optional(),
  selectedDirection: visualDirectionSchema.optional(),
  composition: compositionSchema.optional(),
})

export const generationJobSchema = z.strictObject({
  id: nonEmptyString,
  campaignId: nonEmptyString,
  step: z.enum(['brief_analysis', 'copy', 'directions', 'image']),
  provider: z.enum(['mock', 'gemini']),
  model: nonEmptyString,
  region: nonEmptyString,
  status: z.enum(['pending', 'succeeded', 'failed', 'blocked', 'unknown']),
  attempts: z.number().int().min(0),
  safety: z.record(z.string(), z.unknown()),
  usage: z.record(z.string(), z.number().nonnegative()),
  reservedCostMicrounits: z.number().int().nonnegative(),
  actualCostMicrounits: z.number().int().nonnegative().nullable(),
  timeoutAt: z.string().datetime({ offset: true }),
})
