import { relations } from 'drizzle-orm'
import {
  datetime,
  decimal,
  index,
  json,
  mysqlTable,
  smallint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'
import { idColumn, timestamps } from './_shared'
import { authUser } from './auth'
import { gameSession } from './session'

/**
 * Persisted output of the scheduling algorithm.
 *
 * A run snapshots both its input parameters and the algorithm version, so a
 * proposal generated before a weight change remains explainable afterwards.
 * Without that, historical scores would silently become impossible to reproduce.
 */
export const scheduleRun = mysqlTable(
  'schedule_run',
  {
    id: idColumn().primaryKey(),
    gameSessionId: idColumn('game_session_id')
      .notNull()
      .references(() => gameSession.id, { onDelete: 'cascade' }),
    algorithmVersion: varchar('algorithm_version', { length: 20 }).notNull(),
    params: json('params').notNull(),
    /** Null when the run was triggered automatically after the deadline. */
    triggeredBy: idColumn('triggered_by').references(() => authUser.id, { onDelete: 'set null' }),
    candidateCount: smallint('candidate_count', { unsigned: true }).notNull().default(0),
    rejectionSummary: json('rejection_summary'),
    ...timestamps,
  },
  (t) => [index('ix_run_session').on(t.gameSessionId, t.createdAt)],
)

export const scheduleProposal = mysqlTable(
  'schedule_proposal',
  {
    id: idColumn().primaryKey(),
    scheduleRunId: idColumn('schedule_run_id')
      .notNull()
      .references(() => scheduleRun.id, { onDelete: 'cascade' }),
    gameSessionId: idColumn('game_session_id')
      .notNull()
      .references(() => gameSession.id, { onDelete: 'cascade' }),
    rank: smallint('rank', { unsigned: true }).notNull(),
    startUtc: datetime('start_utc', { mode: 'date', fsp: 3 }).notNull(),
    endUtc: datetime('end_utc', { mode: 'date', fsp: 3 }).notNull(),
    score: decimal('score', { precision: 5, scale: 2 }).notNull(),
    /** Per-participant quality and counts, used to render the explanation. */
    breakdown: json('breakdown').notNull(),
    ...timestamps,
  },
  (t) => [
    index('ix_proposal_run_rank').on(t.scheduleRunId, t.rank),
    uniqueIndex('uq_proposal_run_start').on(t.scheduleRunId, t.startUtc),
  ],
)

export const scheduleRunRelations = relations(scheduleRun, ({ one, many }) => ({
  session: one(gameSession, {
    fields: [scheduleRun.gameSessionId],
    references: [gameSession.id],
  }),
  proposals: many(scheduleProposal),
}))

export const scheduleProposalRelations = relations(scheduleProposal, ({ one }) => ({
  run: one(scheduleRun, {
    fields: [scheduleProposal.scheduleRunId],
    references: [scheduleRun.id],
  }),
}))
