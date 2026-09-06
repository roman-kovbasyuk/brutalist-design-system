import { z } from 'zod'

// Optional facts keep historical analyses readable. New providers request every
// fact and return empty strings/lists for information the brief does not supply.
export const briefAnalysisSchema = z.strictObject({
  summary: z.string().trim().min(1).max(1000),
  themes: z.array(z.string().trim().min(1).max(160)).max(10),
  warnings: z.array(z.string().trim().min(1).max(500)).max(10),
  title: z.string().trim().max(200).optional(),
  audience: z.string().trim().max(500).optional(),
  objective: z.string().trim().max(500).optional(),
  channels: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  formats: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
})

/** Provider snapshots are immutable; editor-authored analysis is an override. */
export function rawBrief(brief) {
  const { analysis: _analysis, ...source } = brief
  return source
}
