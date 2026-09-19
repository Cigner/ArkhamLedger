import { z } from 'zod'
import {
  CANCELLATION_REASON_MAX_LENGTH,
  DEFAULT_GRID_END_HOUR,
  DEFAULT_GRID_START_HOUR,
  DEFAULT_MIN_SESSION_HOURS,
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  TITLE_MIN_LENGTH,
} from './constants'

/**
 * Input schemas for session operations.
 */
export const idSchema = z.string().length(26)

export const prioritySchema = z.enum(['REQUIRED', 'PREFERRED', 'OPTIONAL'])
export const attendanceSchema = z.enum(['UNKNOWN', 'ATTENDED', 'ABSENT'])

/** ISO calendar date, `YYYY-MM-DD`, validated as a real date rather than a shape. */
const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'sessions.errors.malformedDate' })
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
    error: 'sessions.errors.malformedDate',
  })

const hourSchema = z.coerce.number().int().min(0).max(24)

const titleSchema = z.string().trim().min(TITLE_MIN_LENGTH).max(TITLE_MAX_LENGTH)

const descriptionSchema = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX_LENGTH)
  .optional()
  .transform((value) => (value === '' ? undefined : value))

export const createSessionSchema = z.object({
  campaignId: idSchema,
  title: titleSchema,
  description: descriptionSchema,
  searchWindowStart: localDateSchema,
  searchWindowEnd: localDateSchema,
  gridStartHour: hourSchema.default(DEFAULT_GRID_START_HOUR),
  gridEndHour: hourSchema.default(DEFAULT_GRID_END_HOUR),
  minSessionHours: z.coerce.number().int().min(1).max(24).default(DEFAULT_MIN_SESSION_HOURS),
  /**
   * The last day answers are accepted, as a local date. Answering closes when
   * that day ends in the campaign's zone - a deadline with a time of day is a
   * precision nobody wanted and everybody had to fill in.
   */
  availabilityDeadline: localDateSchema.optional(),
})

/**
 * Editing a session.
 *
 * The campaign is not an input: it is implied by the session, and accepting it
 * would be a field a caller could disagree with the database about.
 */
export const updateSessionSchema = createSessionSchema.omit({ campaignId: true }).extend({
  sessionId: idSchema,
  quorum: z.coerce.number().int().min(1).max(64),
})

export const sessionIdSchema = z.object({ sessionId: idSchema })

export const setParticipantsSchema = z.object({
  sessionId: idSchema,
  quorum: z.coerce.number().int().min(1).max(64),
  participants: z
    .array(
      z.object({
        userId: idSchema,
        priority: prioritySchema,
        /** Absent means the default: players bring a character, Keepers do not. */
        playsInvestigator: z.boolean().optional(),
      }),
    )
    .min(1, { error: 'sessions.errors.noParticipants' }),
})

export const cancelSessionSchema = z.object({
  sessionId: idSchema,
  reason: z.string().trim().min(1).max(CANCELLATION_REASON_MAX_LENGTH),
})

export const completeSessionSchema = z.object({
  sessionId: idSchema,
  attendance: z.array(z.object({ userId: idSchema, attendance: attendanceSchema })),
})

/**
 * Manual scheduling.
 *
 * Local wall-clock in the campaign's zone rather than an instant, because that
 * is what the Keeper types and what everybody will read back; the conversion
 * happens once, server-side, where the zone is known.
 */
export const setSessionDateSchema = z.object({
  sessionId: idSchema,
  date: localDateSchema,
  startHour: hourSchema,
  endHour: hourSchema,
  acknowledgeWarnings: z.boolean().default(false),
})

export const reopenCollectionSchema = z.object({
  sessionId: idSchema,
  availabilityDeadline: localDateSchema.optional(),
})

export type CreateSessionInput = z.infer<typeof createSessionSchema>
export type SetParticipantsInput = z.infer<typeof setParticipantsSchema>
export type SetSessionDateInput = z.infer<typeof setSessionDateSchema>
