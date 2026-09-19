import { relations } from 'drizzle-orm'
import {
  boolean,
  date,
  datetime,
  index,
  mysqlEnum,
  mysqlTable,
  text,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'
import { idColumn, timestamps } from './_shared'
import { authUser } from './auth'
import { campaign, scenario } from './campaign'

/**
 * Game sessions and their participants.
 *
 * Named `game_session` rather than `session` because the auth library owns
 * `auth_session`; the prefix keeps the two unambiguous in queries, migrations
 * and conversation.
 *
 * The search window, grid bounds and minimum length are captured on the session
 * rather than read from the campaign at scheduling time, so that re-running the
 * algorithm months later reproduces the original result.
 */
export const sessionStatuses = [
  'DRAFT',
  'COLLECTING',
  'PROPOSED',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const

export const participantPriorities = ['REQUIRED', 'PREFERRED', 'OPTIONAL'] as const
export const attendanceStates = ['UNKNOWN', 'ATTENDED', 'ABSENT'] as const

export const gameSession = mysqlTable(
  'game_session',
  {
    id: idColumn().primaryKey(),
    campaignId: idColumn('campaign_id')
      .notNull()
      .references(() => campaign.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    scenarioId: idColumn('scenario_id').references(() => scenario.id, { onDelete: 'set null' }),
    status: mysqlEnum('status', sessionStatuses).notNull().default('DRAFT'),

    /** Local dates in the session timezone, inclusive on both ends. */
    searchWindowStart: date('search_window_start', { mode: 'string' }).notNull(),
    searchWindowEnd: date('search_window_end', { mode: 'string' }).notNull(),
    /** Grid bounds as local hours; end is exclusive. */
    gridStartHour: tinyint('grid_start_hour', { unsigned: true }).notNull().default(16),
    gridEndHour: tinyint('grid_end_hour', { unsigned: true }).notNull().default(24),
    minSessionHours: tinyint('min_session_hours', { unsigned: true }).notNull().default(6),
    quorum: tinyint('quorum', { unsigned: true }).notNull().default(1),

    availabilityDeadline: datetime('availability_deadline', { mode: 'date', fsp: 3 }),
    timezone: varchar('timezone', { length: 64 }).notNull(),

    confirmedStartUtc: datetime('confirmed_start_utc', { mode: 'date', fsp: 3 }),
    confirmedEndUtc: datetime('confirmed_end_utc', { mode: 'date', fsp: 3 }),
    startedAt: datetime('started_at', { mode: 'date', fsp: 3 }),
    endedAt: datetime('ended_at', { mode: 'date', fsp: 3 }),
    acceptedProposalId: idColumn('accepted_proposal_id'),
    setManually: boolean('set_manually').notNull().default(false),
    cancelledReason: varchar('cancelled_reason', { length: 500 }),

    createdBy: idColumn('created_by')
      .notNull()
      .references(() => authUser.id),
    ...timestamps,
  },
  (t) => [
    index('ix_session_campaign_status').on(t.campaignId, t.status),
    // Scanned by the worker looking for collections past their deadline.
    index('ix_session_deadline').on(t.status, t.availabilityDeadline),
    index('ix_session_confirmed').on(t.campaignId, t.confirmedStartUtc),
  ],
)

/**
 * Per-session participation.
 *
 * Priority is stored here rather than on membership because it is a property of
 * one session, not of the person: the investigator whose thread drives this
 * scenario is REQUIRED this week and OPTIONAL the next.
 *
 * `isKeeper` is denormalized so that a later change of campaign role cannot
 * retroactively alter how a past session was scheduled.
 */
export const sessionParticipant = mysqlTable(
  'session_participant',
  {
    id: idColumn().primaryKey(),
    gameSessionId: idColumn('game_session_id')
      .notNull()
      .references(() => gameSession.id, { onDelete: 'cascade' }),
    userId: idColumn('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    priority: mysqlEnum('priority', participantPriorities).notNull().default('PREFERRED'),
    isKeeper: boolean('is_keeper').notNull().default(false),
    playsInvestigator: boolean('plays_investigator').notNull().default(false),
    /** Null means the participant has not answered; distinct from answering "no". */
    respondedAt: datetime('responded_at', { mode: 'date', fsp: 3 }),
    attendance: mysqlEnum('attendance', attendanceStates).notNull().default('UNKNOWN'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('uq_session_participant').on(t.gameSessionId, t.userId),
    index('ix_participant_user').on(t.userId),
    index('ix_participant_priority').on(t.gameSessionId, t.priority),
  ],
)

export const gameSessionRelations = relations(gameSession, ({ one, many }) => ({
  campaign: one(campaign, { fields: [gameSession.campaignId], references: [campaign.id] }),
  scenario: one(scenario, { fields: [gameSession.scenarioId], references: [scenario.id] }),
  participants: many(sessionParticipant),
}))

export const sessionParticipantRelations = relations(sessionParticipant, ({ one }) => ({
  session: one(gameSession, {
    fields: [sessionParticipant.gameSessionId],
    references: [gameSession.id],
  }),
  user: one(authUser, { fields: [sessionParticipant.userId], references: [authUser.id] }),
}))
