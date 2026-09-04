import { z } from 'zod'
import { hashCanonical } from './canonicalJson.js'
import { templateManifestSchema } from './templateManifest.js'

const nonEmptyString = z.string().trim().min(1)
const nullableAssetId = nonEmptyString.nullable().optional()
const timestampSchema = z.union([
  z.date().transform((value) => value.toISOString()),
  z.string().datetime({ offset: true }),
])
const requestIdSchema = nonEmptyString.max(128)

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

export const createCampaignRequestSchema = z.strictObject({
  title: nonEmptyString.max(200),
  brief: briefSchema,
})

export const campaignPatchRequestSchema = z.strictObject({
  title: nonEmptyString.max(200).optional(),
  brief: briefSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one editable field is required')

const persistedCampaignFields = {
  id: nonEmptyString,
  title: nonEmptyString.max(200),
  brief: briefSchema,
  status: campaignStatusSchema,
  revision: z.number().int().nonnegative(),
  selectedCopyId: nonEmptyString.nullable(),
  selectedDirectionId: nonEmptyString.nullable(),
  compositionId: nonEmptyString.nullable(),
  currentVersionNumber: z.number().int().nonnegative(),
  openVersionId: nonEmptyString.nullable(),
  createdBy: nonEmptyString,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  archivedAt: timestampSchema.nullable(),
}

export const campaignRecordSchema = z.strictObject(persistedCampaignFields)

export const campaignResponseSchema = z.strictObject({
  ...persistedCampaignFields,
  requestId: requestIdSchema,
})

export const campaignListResponseSchema = z.strictObject({
  campaigns: z.array(campaignRecordSchema),
  requestId: requestIdSchema,
})

export const createInvitationRequestSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(320),
  role: roleSchema,
})

const invitationFields = {
  id: nonEmptyString,
  email: z.string().email(),
  role: roleSchema,
  invitedBy: nonEmptyString,
  acceptedUserId: nonEmptyString.nullable(),
  expiresAt: timestampSchema,
  acceptedAt: timestampSchema.nullable(),
  revokedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
}

export const invitationResponseSchema = z.strictObject({
  ...invitationFields,
  requestId: requestIdSchema,
})

export const userResponseSchema = z.strictObject({
  id: nonEmptyString,
  email: z.string().email(),
  firebaseUid: nonEmptyString.nullable(),
  role: roleSchema,
  displayName: nonEmptyString,
  disabled: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  requestId: requestIdSchema,
})

export const sessionResponseSchema = z.strictObject({
  id: nonEmptyString,
  email: z.string().email(),
  role: roleSchema,
  displayName: nonEmptyString,
  requestId: requestIdSchema,
})

export const createTemplateVersionRequestSchema = z.strictObject({
  id: nonEmptyString.max(200),
  version: nonEmptyString.max(100),
  name: nonEmptyString.max(200),
  manifest: templateManifestSchema,
})

const templateVersionFields = {
  id: nonEmptyString,
  version: nonEmptyString,
  name: nonEmptyString,
  manifest: templateManifestSchema,
  manifestHash: assetHashSchema,
  createdBy: nonEmptyString,
  createdAt: timestampSchema,
}

export const templateVersionResponseSchema = z.strictObject({
  ...templateVersionFields,
  requestId: requestIdSchema,
})

export const templateListResponseSchema = z.strictObject({
  templates: z.array(z.strictObject(templateVersionFields)),
  requestId: requestIdSchema,
})

const settingsFields = {
  provider: z.enum(['mock', 'gemini']),
  model: nonEmptyString.max(200),
  region: nonEmptyString.max(100),
  dailyBudgetMicrounits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  perStepRegenerationLimit: z.number().int().nonnegative(),
  generationDisabled: z.boolean(),
}

export const settingsPatchRequestSchema = z.strictObject({
  provider: settingsFields.provider.optional(),
  model: settingsFields.model.optional(),
  region: settingsFields.region.optional(),
  dailyBudgetMicrounits: settingsFields.dailyBudgetMicrounits.optional(),
  perStepRegenerationLimit: settingsFields.perStepRegenerationLimit.optional(),
  generationDisabled: settingsFields.generationDisabled.optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one setting is required')

export const settingsResponseSchema = z.strictObject({
  ...settingsFields,
  revision: z.number().int().nonnegative(),
  updatedBy: nonEmptyString.nullable(),
  updatedAt: timestampSchema,
  requestId: requestIdSchema,
})

export const apiErrorResponseSchema = z.strictObject({
  code: nonEmptyString,
  message: nonEmptyString,
  details: z.unknown().optional(),
  requestId: requestIdSchema,
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
}).superRefine((snapshot, context) => {
  if (snapshot.templateManifestHash !== hashCanonical(snapshot.templateManifest)) {
    context.addIssue({ code: 'custom', path: ['templateManifestHash'], message: 'Template manifest hash must match its canonical manifest.' })
  }
  if (snapshot.composition.templateId !== snapshot.templateManifest.id) {
    context.addIssue({ code: 'custom', path: ['composition', 'templateId'], message: 'Composition template id must match its manifest.' })
  }
  if (snapshot.composition.templateVersion !== snapshot.templateManifest.version) {
    context.addIssue({ code: 'custom', path: ['composition', 'templateVersion'], message: 'Composition template version must match its manifest.' })
  }
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

const providerMetadataFields = {
  provider: z.enum(['mock', 'gemini']),
  model: nonEmptyString.max(200),
  region: nonEmptyString.max(100),
  usage: z.record(z.string(), z.number().int().nonnegative()),
  actualCostMicrounits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  safety: z.strictObject({
    verdict: z.enum(['safe', 'blocked']),
    categories: z.array(nonEmptyString.max(100)),
  }),
}

export const briefAnalysisSchema = z.strictObject({
  summary: nonEmptyString.max(1_000),
  themes: z.array(nonEmptyString.max(160)).max(10),
  warnings: z.array(nonEmptyString.max(500)).max(10),
})

export const analyseBriefInputSchema = z.strictObject({ brief: briefSchema })
export const generateCopyInputSchema = z.strictObject({ brief: briefSchema, analysis: briefAnalysisSchema })
export const generateDirectionsInputSchema = z.strictObject({ brief: briefSchema, copy: copyVariantSchema })
export const generateImageInputSchema = z.strictObject({
  direction: visualDirectionSchema,
  width: z.number().int().min(64).max(4_096),
  height: z.number().int().min(64).max(4_096),
})

const providerErrorSchema = z.strictObject({
  code: z.enum(['content_rejected', 'provider_blocked', 'rate_limited', 'provider_unavailable', 'invalid_output']),
  message: nonEmptyString.max(500),
  retryable: z.boolean(),
})

const providerFailureSchema = z.strictObject({ ...providerMetadataFields, error: providerErrorSchema })
export const analyseBriefResultSchema = z.union([
  z.strictObject({ ...providerMetadataFields, analysis: briefAnalysisSchema }),
  providerFailureSchema,
])
export const generateCopyResultSchema = z.union([
  z.strictObject({ ...providerMetadataFields, copies: z.array(copyVariantSchema).min(1).max(10) }),
  providerFailureSchema,
])
export const generateDirectionsResultSchema = z.union([
  z.strictObject({ ...providerMetadataFields, directions: z.array(visualDirectionSchema).min(1).max(10) }),
  providerFailureSchema,
])
export const generateImageResultSchema = z.union([
  z.strictObject({
    ...providerMetadataFields,
    image: z.strictObject({
      bytes: z.instanceof(Uint8Array),
      mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
      width: z.number().int().positive().max(4_096),
      height: z.number().int().positive().max(4_096),
    }),
  }),
  providerFailureSchema,
])

export const analyseBriefRequestSchema = z.strictObject({})
export const copyGenerationRequestSchema = z.strictObject({})
export const directionGenerationRequestSchema = z.strictObject({})
export const imageGenerationRequestSchema = z.strictObject({
  directionId: nonEmptyString,
  width: z.number().int().min(64).max(4_096),
  height: z.number().int().min(64).max(4_096),
})
export const copySelectionRequestSchema = z.strictObject({ copyId: nonEmptyString })
export const directionSelectionRequestSchema = z.strictObject({ directionId: nonEmptyString })

export const imageResultSinkReceiptSchema = z.strictObject({
  assetId: nonEmptyString,
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  width: z.number().int().positive().max(4_096),
  height: z.number().int().positive().max(4_096),
  byteSize: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
})

export const generationResultMetadataSchema = z.union([
  z.strictObject({ analysis: briefAnalysisSchema }),
  z.strictObject({ copySetId: nonEmptyString, copies: z.array(copyVariantSchema) }),
  z.strictObject({ directions: z.array(visualDirectionSchema) }),
  z.strictObject({ image: imageResultSinkReceiptSchema }),
])

export const generationJobDetailsSchema = generationJobSchema.extend({
  result: generationResultMetadataSchema.nullable(),
  errorCode: nonEmptyString.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export const generationCommandResponseSchema = z.strictObject({
  job: generationJobDetailsSchema,
  requestId: requestIdSchema,
})

export const generationJobResponseSchema = z.strictObject({
  ...generationJobDetailsSchema.shape,
  requestId: requestIdSchema,
})
