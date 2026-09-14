import 'server-only'
import { desc, eq, max } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  authUser,
  gameSession,
  scheduleProposal,
  scheduleRun,
  sessionParticipant,
} from '@/db/schema'
import { NotFoundError } from '@/lib/errors'
import { requireSessionKeeper } from '@/modules/sessions/data/guards'
import { proposalPayloadSchema, rejectionSummarySchema } from '../domain/schemas'
import type { ProposalView, SchedulingView } from '../domain/types'

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
