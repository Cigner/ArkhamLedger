import { z } from 'zod'

/**
 * Input schemas for availability.
 *
 * The payload carries no user id. Whose answer this is comes from the session,
 * so there is no field through which one participant could submit another's
 * availability.
 */
export const dayRangeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'availability.errors.malformedDate' }),
  state: z.enum(['YES', 'IF_NEED_BE', 'NO']).nullable(),
  fromHour: z.number().int().min(0).max(24),
  toHour: z.number().int().min(0).max(24),
})

export const saveAvailabilitySchema = z.object({
  sessionId: z.string().length(26),
  ranges: z.array(dayRangeSchema).max(90, { error: 'availability.errors.tooManyDays' }),
})

export const sessionIdSchema = z.object({ sessionId: z.string().length(26) })

export type SaveAvailabilityInput = z.infer<typeof saveAvailabilitySchema>
