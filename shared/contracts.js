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
  product: z.string().trim().max(200).default(''),
  audience: z.string().trim().max(500).default(''),
  objective: z.string().trim().max(500).default(''),
  offer: z.string().trim().max(500).default(''),
  locale: z.string().trim().min(1).max(35).default('auto'),
  notes: z.string().trim().max(20_000).default(''),
}).refine(
  (brief) => brief.notes.length > 0 || (brief.product.length > 0 && brief.audience.length > 0 && brief.objective.length > 0),
  { message: 'Provide campaign notes or the product, audience, and objective fields.' },
)

export const createCampaignRequestSchema = z.strictObject({
  title: nonEmptyString.max(200),
  brief: briefSchema,
})

export const extractBriefFileRequestSchema = z.strictObject({
  name: nonEmptyString.max(255),
  mimeType: nonEmptyString.max(200),
  data: z.string().max(7_000_000),
})

export const extractBriefFileResponseSchema = z.strictObject({
  text: nonEmptyString.max(20_000),
  requestId: requestIdSchema,
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

export const generatedBannerCopySchema = z.strictObject({
  id: nonEmptyString,
  headline: nonEmptyString.max(80),
  body: nonEmptyString.max(160),
  offer: z.string().trim().max(40).default(''),
  cta: nonEmptyString.max(24),
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

export const saveCompositionRequestSchema = z.strictObject({
  templateId: nonEmptyString,
  templateVersion: nonEmptyString,
  ratioIds: z.array(nonEmptyString).min(1).refine((values) => new Set(values).size === values.length, 'Ratio ids must be unique'),
  slotValues: z.record(z.string(), z.string()),
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

const campaignVersionFields = {
  id: nonEmptyString,
  campaignId: nonEmptyString,
  versionNumber: z.number().int().positive(),
  snapshot: campaignVersionSnapshotSchema,
  contentHash: assetHashSchema,
  createdBy: nonEmptyString,
  createdAt: timestampSchema,
}

export const campaignVersionRecordSchema = z.strictObject(campaignVersionFields).superRefine((version, context) => {
  if (version.contentHash !== hashCanonical(version.snapshot)) {
    context.addIssue({ code: 'custom', path: ['contentHash'], message: 'Version content hash must match its canonical snapshot.' })
  }
})

export const createCampaignVersionRequestSchema = z.strictObject({})

export const compositionCommandResponseSchema = z.strictObject({
  composition: compositionSchema,
  campaign: campaignRecordSchema,
  requestId: requestIdSchema,
})

export const campaignVersionCommandResponseSchema = z.strictObject({
  version: campaignVersionRecordSchema,
  campaign: campaignRecordSchema,
  requestId: requestIdSchema,
})

export const campaignVersionResponseSchema = z.strictObject({
  ...campaignVersionFields,
  requestId: requestIdSchema,
}).superRefine((version, context) => {
  if (version.contentHash !== hashCanonical(version.snapshot)) {
    context.addIssue({ code: 'custom', path: ['contentHash'], message: 'Version content hash must match its canonical snapshot.' })
  }
})

export const campaignVersionListResponseSchema = z.strictObject({
  versions: z.array(campaignVersionRecordSchema),
  requestId: requestIdSchema,
})

const reviewCommentSchema = z.string().trim().min(1).max(2_000)

function isFigmaHttpsUrl(value) {
  try {
    const authority = /^https:\/\/([^/?#]*)(?:[/?#]|$)/i.exec(value)?.[1]
    if (!authority || !/^[\x00-\x7f]+$/.test(authority) || authority.includes('@')) return false
    const rawHostname = authority.toLowerCase().endsWith(':443') ? authority.slice(0, -4) : authority
    if (rawHostname.includes(':')) return false
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    const labels = hostname.split('.')
    return url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && (url.port === '' || url.port === '443')
      && rawHostname.toLowerCase() === hostname
      && hostname.length <= 253
      && labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
      && (hostname === 'figma.com' || hostname.endsWith('.figma.com'))
  } catch {
    return false
  }
}

export const reviewChecklistSchema = z.strictObject({
  copyAccuracy: z.literal(true),
  layoutQuality: z.literal(true),
  exportReadiness: z.literal(true),
})

export const requestVersionChangesRequestSchema = z.strictObject({ comment: reviewCommentSchema })
export const rejectVersionRequestSchema = requestVersionChangesRequestSchema
export const markVersionReadyRequestSchema = z.strictObject({
  figmaUrl: z.string().trim().max(2_000).refine(isFigmaHttpsUrl, 'A valid HTTPS Figma URL is required'),
  checklistAnswers: reviewChecklistSchema,
})
export const approveVersionRequestSchema = z.strictObject({})
export const reopenCampaignRequestSchema = z.strictObject({})

const reviewEventBase = {
  id: nonEmptyString,
  campaignId: nonEmptyString,
  versionId: nonEmptyString,
  actorId: nonEmptyString,
  createdAt: timestampSchema,
}

const sentReviewEventSchema = z.strictObject({
  ...reviewEventBase,
  actorRole: z.enum(['marketer', 'admin']),
  eventType: z.literal('sent'),
  payload: z.strictObject({ contentHash: assetHashSchema, assetHashes: z.array(assetHashSchema) }),
})
const changesRequestedReviewEventSchema = z.strictObject({
  ...reviewEventBase,
  actorRole: z.literal('designer'),
  eventType: z.literal('changes_requested'),
  payload: z.strictObject({ comment: reviewCommentSchema }),
})
const readyReviewEventSchema = z.strictObject({
  ...reviewEventBase,
  actorRole: z.literal('designer'),
  eventType: z.literal('ready'),
  payload: z.strictObject({
    figmaUrl: markVersionReadyRequestSchema.shape.figmaUrl,
    checklistAnswers: reviewChecklistSchema,
    readyActorId: nonEmptyString,
    contentHash: assetHashSchema,
    assetHashes: z.array(assetHashSchema).optional(),
  }),
})
const rejectedReviewEventSchema = z.strictObject({
  ...reviewEventBase,
  actorRole: z.enum(['marketer', 'admin']),
  eventType: z.literal('rejected'),
  payload: z.strictObject({ comment: reviewCommentSchema }),
})
const approvedReviewEventSchema = z.strictObject({
  ...reviewEventBase,
  actorRole: z.enum(['marketer', 'admin']),
  eventType: z.literal('approved'),
  payload: z.strictObject({ contentHash: assetHashSchema, assetHashes: z.array(assetHashSchema).optional() }),
})
const deliveredReviewEventSchema = z.strictObject({
  ...reviewEventBase,
  actorRole: z.enum(['marketer', 'admin']),
  eventType: z.literal('delivered'),
  payload: z.strictObject({
    deliveryId: nonEmptyString,
    contentHash: assetHashSchema,
    assetHashes: z.array(assetHashSchema),
  }),
})

export const reviewEventRecordSchema = z.discriminatedUnion('eventType', [
  sentReviewEventSchema,
  changesRequestedReviewEventSchema,
  readyReviewEventSchema,
  rejectedReviewEventSchema,
  approvedReviewEventSchema,
  deliveredReviewEventSchema,
])

export const reviewCommandResponseSchema = z.strictObject({
  version: campaignVersionRecordSchema,
  campaign: campaignRecordSchema,
  reviewStatus: reviewStatusSchema,
  event: reviewEventRecordSchema,
  requestId: requestIdSchema,
})

export const reopenCampaignResponseSchema = z.strictObject({
  campaign: campaignRecordSchema,
  requestId: requestIdSchema,
})

export const reviewHistoryResponseSchema = z.strictObject({
  version: campaignVersionRecordSchema,
  status: reviewStatusSchema,
  events: z.array(reviewEventRecordSchema),
  requestId: requestIdSchema,
})

const safeArchiveFilenameSchema = z.string().regex(
  /^(?:banners\/banner-[0-9]{3}\.png|render-manifest\.json)$/,
  'Delivery filenames must be server-owned safe POSIX paths',
)

const deliveryFileSchema = z.strictObject({
  filename: safeArchiveFilenameSchema,
  assetId: nonEmptyString,
  mimeType: z.enum(['image/png', 'application/json']),
  byteSize: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  width: z.number().int().positive().max(4_096).nullable(),
  height: z.number().int().positive().max(4_096).nullable(),
  sha256: assetHashSchema,
}).superRefine((file, context) => {
  const image = file.mimeType === 'image/png'
  if (image !== (file.width !== null && file.height !== null)) {
    context.addIssue({ code: 'custom', path: ['width'], message: 'Only PNG files have dimensions.' })
  }
  if (image !== file.filename.startsWith('banners/')) {
    context.addIssue({ code: 'custom', path: ['filename'], message: 'Filename does not match its MIME type.' })
  }
})

export const deliveryManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  campaignId: nonEmptyString,
  versionId: nonEmptyString,
  versionNumber: z.number().int().positive(),
  contentHash: assetHashSchema,
  approval: z.strictObject({ actorId: nonEmptyString, at: timestampSchema }),
  files: z.array(deliveryFileSchema).min(2),
}).superRefine((manifest, context) => {
  const filenames = manifest.files.map((file) => file.filename)
  const sorted = [...filenames].sort()
  if (new Set(filenames).size !== filenames.length || filenames.some((value, index) => value !== sorted[index])) {
    context.addIssue({ code: 'custom', path: ['files'], message: 'Delivery files must be unique and sorted by filename.' })
  }
  if (manifest.files.filter((file) => file.filename === 'render-manifest.json').length !== 1) {
    context.addIssue({ code: 'custom', path: ['files'], message: 'One render manifest is required.' })
  }
  if (!manifest.files.some((file) => file.mimeType === 'image/png')) {
    context.addIssue({ code: 'custom', path: ['files'], message: 'At least one banner PNG is required.' })
  }
})

export const createDeliveryRequestSchema = z.strictObject({})

const deliveryFields = {
  id: nonEmptyString,
  campaignId: nonEmptyString,
  versionId: nonEmptyString,
  contentHash: assetHashSchema,
  asset: assetReferenceSchema.refine((asset) => asset.kind === 'delivery_zip', 'A delivery ZIP asset is required'),
  byteSize: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdBy: nonEmptyString,
  createdAt: timestampSchema,
}

export const deliveryRecordSchema = z.strictObject(deliveryFields)

export const deliveryCommandResponseSchema = z.strictObject({
  delivery: deliveryRecordSchema,
  campaign: campaignRecordSchema,
  reviewStatus: z.literal('delivered'),
  event: deliveredReviewEventSchema,
  requestId: requestIdSchema,
})

export const deliveryResponseSchema = z.strictObject({
  ...deliveryFields,
  requestId: requestIdSchema,
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
  z.strictObject({ ...providerMetadataFields, copies: z.array(generatedBannerCopySchema).length(5) }),
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

const historicalImageMetadataFields = {
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  width: z.number().int().positive().max(4_096),
  height: z.number().int().positive().max(4_096),
  byteSize: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}

const legacyImageResultMetadataSchema = z.strictObject({
  image: z.strictObject(historicalImageMetadataFields),
})

const interimImageResultMetadataSchema = z.strictObject({
  image: z.strictObject({ assetId: nonEmptyString, ...historicalImageMetadataFields }),
})

const durableImageResultMetadataSchema = z.strictObject({
  image: z.strictObject({ asset: assetReferenceSchema, ...historicalImageMetadataFields }),
})

export const generationResultMetadataSchema = z.union([
  z.strictObject({ analysis: briefAnalysisSchema }),
  z.strictObject({ copySetId: nonEmptyString, copies: z.array(copyVariantSchema) }),
  z.strictObject({ directions: z.array(visualDirectionSchema) }),
  legacyImageResultMetadataSchema,
  interimImageResultMetadataSchema,
  durableImageResultMetadataSchema,
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
