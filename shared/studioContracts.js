import { z } from 'zod'
import { campaignRecordSchema, copyVariantSchema, visualDirectionSchema, compositionSchema, campaignVersionRecordSchema, generationJobDetailsSchema, deliveryRecordSchema } from './contracts.js'

export const workspaceRecordSchema = z.strictObject({
  campaign: campaignRecordSchema,
  copies: z.array(z.strictObject({ id: z.string().min(1), candidates: z.array(copyVariantSchema), selectedCandidateId: z.string().nullable(), approvedCandidateIds: z.array(z.string().min(1)).default([]), stale: z.boolean() })),
  directions: z.array(visualDirectionSchema.extend({ stale: z.boolean(),
    scope: z.enum(['legacy', 'campaign', 'selected_copy']).default('legacy'),
    copy: copyVariantSchema.nullable().default(null), batchId: z.string().nullable().default(null),
    source: z.enum(['upload', 'generation']).nullable().default(null),
    generation: z.strictObject({ id: z.string(), status: z.enum(['pending', 'unknown', 'succeeded', 'failed', 'blocked']), errorCode: z.string().nullable() }).nullable().default(null),
  })),
  composition: compositionSchema.nullable(),
  versions: z.array(campaignVersionRecordSchema),
  jobs: z.array(generationJobDetailsSchema),
  delivery: deliveryRecordSchema.nullable(),
})
export const workspaceResponseSchema = workspaceRecordSchema.extend({ requestId: z.string().min(1).max(128) })
