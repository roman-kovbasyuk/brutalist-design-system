import { z } from 'zod'

export const MAX_VISUAL_UPLOAD_BYTES = 5 * 1024 * 1024
export const visualUploadRequestSchema = z.strictObject({
  target: z.union([
    z.strictObject({ directionId: z.string().min(1) }),
    z.strictObject({ mode: z.literal('campaign') }),
    z.strictObject({ mode: z.literal('selected_copy'), copyId: z.string().min(1) }),
  ]),
  name: z.string().trim().min(1).max(255),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  data: z.string().min(4).max(Math.ceil(MAX_VISUAL_UPLOAD_BYTES / 3) * 4),
})
export const visualUploadResponseSchema = z.strictObject({
  directionId: z.string().min(1), assetId: z.string().min(1), requestId: z.string().min(1).max(128),
})
