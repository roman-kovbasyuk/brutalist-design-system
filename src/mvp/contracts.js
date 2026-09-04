import { z } from 'zod'

export const canonicalStatuses = [
  'draft',
  'copy_ready',
  'direction_selected',
  'composed',
  'in_review',
  'changes_requested',
  'ready',
  'approved',
  'delivered',
]

export const actorRoleSchema = z.enum(['marketer', 'designer', 'admin'])
export const actorSchema = z.object({ id: z.string().min(1), role: actorRoleSchema })

export const briefSchema = z.object({
  product: z.string(),
  audience: z.string(),
  goal: z.string(),
  offer: z.string(),
  notes: z.string(),
})

export const copyCandidateSchema = z.object({
  id: z.string().min(1),
  headline: z.string(),
  body: z.string(),
  offer: z.string(),
  cta: z.string(),
})

export const copySetSchema = z.object({
  id: z.string().min(1),
  candidates: z.array(copyCandidateSchema).min(1),
  createdAt: z.string().datetime(),
})

export const visualDirectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  prompt: z.string().min(1),
  status: z.enum(['pending', 'ready', 'blocked', 'failed']),
  assetId: z.string().min(1).nullable(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
})

export const compositionSchema = z.object({
  templateId: z.string().min(1),
  templateVersion: z.number().int().positive(),
  slots: z.record(z.string(), z.string()),
  ratios: z.array(z.string().min(1)).min(1),
  validation: z.object({
    valid: z.boolean(),
    errors: z.array(z.string()),
  }),
  stale: z.boolean().default(false),
})

export const versionSnapshotSchema = z.object({
  copy: copyCandidateSchema.omit({ id: true }),
  direction: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    prompt: z.string().min(1),
    assetId: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  composition: compositionSchema.pick({
    templateId: true,
    templateVersion: true,
    slots: true,
    ratios: true,
  }),
})

export const campaignVersionSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().positive(),
  status: z.enum(['in_review', 'changes_requested', 'ready', 'approved', 'delivered', 'superseded']),
  snapshot: versionSnapshotSchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  assetHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)),
  createdAt: z.string().datetime(),
  createdBy: z.string().min(1),
  readyBy: z.string().min(1).nullable().default(null),
  figmaUrl: z.string().url().nullable().default(null),
})

export const reviewEventSchema = z.object({
  id: z.string().min(1),
  versionId: z.string().min(1),
  type: z.enum(['sent', 'changes_requested', 'ready', 'approved', 'rejected', 'delivered']),
  actorId: z.string().min(1),
  actorRole: actorRoleSchema,
  comment: z.string(),
  createdAt: z.string().datetime(),
})

export const deliverySchema = z.object({
  id: z.string().min(1),
  versionId: z.string().min(1),
  files: z.array(z.string().min(1)).min(1),
  manifestFile: z.literal('manifest.json'),
  createdAt: z.string().datetime(),
  createdBy: z.string().min(1),
})

export const campaignSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(canonicalStatuses),
  brief: briefSchema,
  copySets: z.array(copySetSchema),
  selectedCopyId: z.string().min(1).nullable(),
  directions: z.array(visualDirectionSchema),
  selectedDirectionId: z.string().min(1).nullable(),
  composition: compositionSchema.nullable(),
  versions: z.array(campaignVersionSchema),
  reviewEvents: z.array(reviewEventSchema),
  delivery: deliverySchema.nullable(),
  providerMode: z.enum(['mock', 'gemini']),
  updatedAt: z.string().datetime(),
})
