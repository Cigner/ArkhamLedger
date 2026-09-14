import { z } from 'zod'

/**
 * Scheduling input schemas, and the shape of what a run stores.
 *
 * The stored shapes are parsed on the way back out rather than asserted. A
 * proposal written by an earlier algorithm version is still in the table long
 * after the code that wrote it is gone, and a run whose payload no longer fits
 * should be reported as unreadable rather than rendered as nonsense.
 */
const idSchema = z.string().length(26)

export const runSchedulingSchema = z.object({ sessionId: idSchema })

export const acceptProposalSchema = z.object({
  sessionId: idSchema,
  proposalId: idSchema,
})

const prioritySchema = z.enum(['REQUIRED', 'PREFERRED', 'OPTIONAL'])

const participantQualitySchema = z.object({
  userId: z.string(),
  priority: prioritySchema,
  isKeeper: z.boolean(),
  quality: z.number(),
})

const explanationNoteSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('AT_A_PUSH'), userIds: z.array(z.string()) }),
  z.object({ kind: z.literal('UNAVAILABLE'), userIds: z.array(z.string()) }),
  z.object({ kind: z.literal('NO_RESPONSE'), count: z.number().int() }),
])

export const proposalPayloadSchema = z.object({
  breakdown: z.object({
    coreHours: z.number().int(),
    extendedHours: z.number().int(),
    availableCount: z.number().int(),
    investigatorCount: z.number().int(),
    noResponseCount: z.number().int(),
    quorum: z.number().int(),
    quorumMet: z.boolean(),
    perParticipant: z.array(participantQualitySchema),
  }),
  explanation: z.object({
    headline: z.enum(['EVERYONE_FREE', 'ALL_REQUIRED_FREE']),
    requiredMet: z.number().int(),
    requiredTotal: z.number().int(),
    preferredMet: z.number().int(),
    preferredTotal: z.number().int(),
    optionalMet: z.number().int(),
    optionalTotal: z.number().int(),
    notes: z.array(explanationNoteSchema),
  }),
})

export const rejectionSummarySchema = z.object({
  windowsConsidered: z.number().int(),
  windowsRejected: z.number().int(),
  byReason: z.object({
    KEEPER_UNAVAILABLE: z.number().int(),
    REQUIRED_UNAVAILABLE: z.number().int(),
    QUORUM_NOT_MET: z.number().int(),
  }),
  blockedBy: z.array(z.object({ userId: z.string(), windows: z.number().int() })),
  bestAvailableCount: z.number().int(),
  quorum: z.number().int(),
})

/** Snapshot of what the run was asked to solve, kept for reproducibility. */
export const runParamsSchema = z.object({
  searchWindowStart: z.string(),
  searchWindowEnd: z.string(),
  gridStartHour: z.number().int(),
  gridEndHour: z.number().int(),
  minSessionHours: z.number().int(),
  quorum: z.number().int(),
  timezone: z.string(),
  participantCount: z.number().int(),
  respondentCount: z.number().int(),
})

export type RunParams = z.infer<typeof runParamsSchema>
export type ProposalPayload = z.infer<typeof proposalPayloadSchema>
