import { z } from 'zod'
import { campaignRecordSchema, copyVariantSchema, visualDirectionSchema, compositionSchema, campaignVersionRecordSchema, generationJobDetailsSchema, deliveryRecordSchema } from './contracts.js'

export const workspaceRecordSchema = z.strictObject({
  campaign: campaignRecordSchema,
  copies: z.array(z.strictObject({ id: z.string().min(1), candidates: z.array(copyVariantSchema), selectedCandidateId: z.string().nullable(), stale: z.boolean() })),
  directions: z.array(visualDirectionSchema.extend({ stale: z.boolean() })),
  composition: compositionSchema.nullable(),
  versions: z.array(campaignVersionRecordSchema),
  jobs: z.array(generationJobDetailsSchema),
  delivery: deliveryRecordSchema.nullable(),
})
export const workspaceResponseSchema = workspaceRecordSchema.extend({ requestId: z.string().min(1).max(128) })
