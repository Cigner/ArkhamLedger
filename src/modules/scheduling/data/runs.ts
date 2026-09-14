import 'server-only'
import { and, desc, eq, max } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import {
  authUser,
  availabilitySlot,
  gameSession,
  scheduleProposal,
  scheduleRun,
  sessionParticipant,
} from '@/db/schema'
import { addHours, generateGridSlots } from '@/lib/datetime/slots'
import { instantFromDate } from '@/lib/datetime/temporal'
import { NotFoundError } from '@/lib/errors'
import { newId } from '@/lib/ids'
import type { SlotState } from '@/modules/availability/domain/types'
import { requireSessionKeeper } from '@/modules/sessions/data/guards'
import { findSessionState } from '@/modules/sessions/data/sessions'
import {
  proposalPayloadSchema,
  rejectionSummarySchema,
  type RunParams,
} from '../domain/schemas'
import type {
  ProposalView,
  SchedulingInput,
  SchedulingOutput,
  SchedulingView,
} from '../domain/types'

/**
 * Reading the input a search needs, and storing what it produced.
 *
 * The algorithm is pure, so everything time-shaped happens here: the grid is
 * generated once, each stored answer is matched to the hour it belongs to, and
 * the result comes back as plain data the domain can score without knowing what
 * a time zone is.
 *
 * Runs are kept rather than overwritten. A proposal that was accepted stays
 * explainable afterwards, including under a later algorithm version, which is
 * the whole reason the version is stamped on the run.
 */

/**
 * Builds the algorithm's input from what is stored.
 *
 * Instants are canonicalised through Temporal on both sides of the match.
 * MySQL returns a Date that stringifies with milliseconds and the grid generator
 * produces one without, so comparing the two raw would miss every single hour —
 * silently, as an empty availability map rather than as an error.
 */
export async function loadSchedulingInput(
  sessionId: string,
  executor: DbOrTx = db,
): Promise<{ input: SchedulingInput; params: RunParams }> {
  const session = await findSessionState(sessionId, executor)

  const slots = generateGridSlots({
    startDate: session.searchWindowStart,
    endDate: session.searchWindowEnd,
    startHour: session.gridStartHour,
    endHour: session.gridEndHour,
    timeZone: session.timezone,
  }).map((slot) => ({
    startUtc: slot.startUtc,
    endUtc: addHours(slot.startUtc, 1),
    localDate: slot.localDate,
    localHour: slot.localHour,
  }))

  const participants = await executor
    .select({
      userId: sessionParticipant.userId,
      priority: sessionParticipant.priority,
      isKeeper: sessionParticipant.isKeeper,
      respondedAt: sessionParticipant.respondedAt,
    })
    .from(sessionParticipant)
    .where(eq(sessionParticipant.gameSessionId, sessionId))

  const cells = await executor
    .select({
      userId: availabilitySlot.userId,
      slotStartUtc: availabilitySlot.slotStartUtc,
      state: availabilitySlot.state,
    })
    .from(availabilitySlot)
    .where(eq(availabilitySlot.gameSessionId, sessionId))

  const byUser = new Map<string, Map<string, SlotState>>()
  for (const cell of cells) {
    const key = instantFromDate(cell.slotStartUtc).toString()
    const bucket = byUser.get(cell.userId)
    if (bucket) bucket.set(key, cell.state)
    else byUser.set(cell.userId, new Map([[key, cell.state]]))
  }

  const respondentCount = participants.filter(
    (participant) => participant.respondedAt !== null,
  ).length

  return {
    input: {
      slots,
      minSessionHours: session.minSessionHours,
      quorum: session.quorum,
      participants: participants.map((participant) => ({
        userId: participant.userId,
        priority: participant.priority,
        isKeeper: participant.isKeeper,
        hasResponded: participant.respondedAt !== null,
        availability: byUser.get(participant.userId) ?? new Map<string, SlotState>(),
      })),
    },
    params: {
      searchWindowStart: session.searchWindowStart,
      searchWindowEnd: session.searchWindowEnd,
      gridStartHour: session.gridStartHour,
      gridEndHour: session.gridEndHour,
      minSessionHours: session.minSessionHours,
      quorum: session.quorum,
      timezone: session.timezone,
      participantCount: participants.length,
      respondentCount,
    },
  }
}

export async function insertRun(input: {
  sessionId: string
  output: SchedulingOutput
  params: RunParams
  triggeredBy: string | null
  now: Date
  executor: DbOrTx
}): Promise<{ runId: string }> {
  const runId = newId()

  await input.executor.insert(scheduleRun).values({
    id: runId,
    gameSessionId: input.sessionId,
    algorithmVersion: input.output.algorithmVersion,
    params: input.params,
    triggeredBy: input.triggeredBy,
    candidateCount: input.output.ranked.length,
    rejectionSummary: input.output.summary,
    createdAt: input.now,
    updatedAt: input.now,
  })

  if (input.output.ranked.length > 0) {
    await input.executor.insert(scheduleProposal).values(
      input.output.ranked.map((candidate) => ({
        id: newId(),
        scheduleRunId: runId,
        gameSessionId: input.sessionId,
        rank: candidate.rank,
        startUtc: new Date(candidate.startUtc),
        endUtc: new Date(candidate.endUtc),
        score: candidate.score.toFixed(2),
        breakdown: { breakdown: candidate.breakdown, explanation: candidate.explanation },
        createdAt: input.now,
        updatedAt: input.now,
      })),
    )
  }

  return { runId }
}

/**
 * One proposal, confirmed to belong to this session's most recent search.
 *
 * Accepting a proposal from an older run would confirm a date computed from
 * answers that have since changed — the Keeper would be agreeing to something
 * the screen no longer says.
 */
export async function findAcceptableProposal(input: {
  sessionId: string
  proposalId: string
  executor: DbOrTx
}): Promise<{ startUtc: Date; endUtc: Date; rank: number } | null> {
  const latestRun = await input.executor
    .select({ id: scheduleRun.id })
    .from(scheduleRun)
    .where(eq(scheduleRun.gameSessionId, input.sessionId))
    .orderBy(desc(scheduleRun.createdAt), desc(scheduleRun.id))
    .limit(1)
    .then((rows) => rows[0])

  if (!latestRun) return null

  const proposal = await input.executor
    .select({
      startUtc: scheduleProposal.startUtc,
      endUtc: scheduleProposal.endUtc,
      rank: scheduleProposal.rank,
    })
    .from(scheduleProposal)
    .where(
      and(
        eq(scheduleProposal.id, input.proposalId),
        eq(scheduleProposal.gameSessionId, input.sessionId),
        eq(scheduleProposal.scheduleRunId, latestRun.id),
      ),
    )
    .limit(1)
    .then((rows) => rows[0])

  return proposal ?? null
}

/**
 * The scheduling screen, for a Keeper.
 *
 * Authorization comes first and is the reason this returns names at all: the
 * same data narrowed for an Investigator would be a different DTO, not this one
 * with fields blanked.
 */
export async function getSchedulingView(sessionId: string): Promise<SchedulingView> {
  await requireSessionKeeper(sessionId)

  const session = await db
    .select({
      status: gameSession.status,
      timezone: gameSession.timezone,
      quorum: gameSession.quorum,
      minSessionHours: gameSession.minSessionHours,
      searchWindowStart: gameSession.searchWindowStart,
      searchWindowEnd: gameSession.searchWindowEnd,
      acceptedProposalId: gameSession.acceptedProposalId,
      confirmedStartUtc: gameSession.confirmedStartUtc,
      confirmedEndUtc: gameSession.confirmedEndUtc,
    })
    .from(gameSession)
    .where(eq(gameSession.id, sessionId))
    .limit(1)
    .then((rows) => rows[0])

  if (!session) throw new NotFoundError()

  const participants = await db
    .select({
      userId: sessionParticipant.userId,
      name: authUser.name,
      respondedAt: sessionParticipant.respondedAt,
    })
    .from(sessionParticipant)
    .innerJoin(authUser, eq(authUser.id, sessionParticipant.userId))
    .where(eq(sessionParticipant.gameSessionId, sessionId))

  const latestAnswer = await db
    .select({ at: max(sessionParticipant.respondedAt) })
    .from(sessionParticipant)
    .where(eq(sessionParticipant.gameSessionId, sessionId))
    .then((rows) => rows[0]?.at ?? null)

  const run = await db
    .select({
      id: scheduleRun.id,
      createdAt: scheduleRun.createdAt,
      algorithmVersion: scheduleRun.algorithmVersion,
      rejectionSummary: scheduleRun.rejectionSummary,
    })
    .from(scheduleRun)
    .where(eq(scheduleRun.gameSessionId, sessionId))
    .orderBy(desc(scheduleRun.createdAt), desc(scheduleRun.id))
    .limit(1)
    .then((rows) => rows[0])

  const proposals = run ? await loadProposals(run.id) : []

  return {
    sessionId,
    timezone: session.timezone,
    quorum: session.quorum,
    minSessionHours: session.minSessionHours,
    searchWindowStart: session.searchWindowStart,
    searchWindowEnd: session.searchWindowEnd,
    participantCount: participants.length,
    respondentCount: participants.filter((entry) => entry.respondedAt !== null).length,
    names: Object.fromEntries(participants.map((entry) => [entry.userId, entry.name])),
    run: run
      ? {
          id: run.id,
          createdAt: run.createdAt,
          algorithmVersion: run.algorithmVersion,
          summary: rejectionSummarySchema.parse(run.rejectionSummary),
          staleAnswers: latestAnswer !== null && latestAnswer > run.createdAt,
        }
      : null,
    proposals,
    acceptedProposalId: session.acceptedProposalId,
    confirmedStartUtc: session.confirmedStartUtc,
    confirmedEndUtc: session.confirmedEndUtc,
    canRun: session.status === 'COLLECTING' || session.status === 'PROPOSED',
  }
}

async function loadProposals(runId: string): Promise<ProposalView[]> {
  const rows = await db
    .select({
      id: scheduleProposal.id,
      rank: scheduleProposal.rank,
      startUtc: scheduleProposal.startUtc,
      endUtc: scheduleProposal.endUtc,
      score: scheduleProposal.score,
      breakdown: scheduleProposal.breakdown,
    })
    .from(scheduleProposal)
    .where(eq(scheduleProposal.scheduleRunId, runId))
    .orderBy(scheduleProposal.rank)

  return rows.map((row) => {
    const payload = proposalPayloadSchema.parse(row.breakdown)

    return {
      id: row.id,
      rank: row.rank,
      startUtc: row.startUtc,
      endUtc: row.endUtc,
      score: Number(row.score),
      breakdown: payload.breakdown,
      explanation: payload.explanation,
    }
  })
}
