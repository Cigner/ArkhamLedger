import { relations } from 'drizzle-orm'
import {
  date,
  datetime,
  index,
  mysqlEnum,
  mysqlTable,
  tinyint,
  uniqueIndex,
} from 'drizzle-orm/mysql-core'
import { idColumn, timestamps } from './_shared'
import { authUser } from './auth'
import { gameSession } from './session'

/**
 * Per-participant availability, one row per hour slot.
 *
 * Time is stored twice on purpose. `slotStartUtc` is the canonical key: it is
 * unambiguous across daylight-saving transitions, so a 25-hour day simply yields
 * 25 rows and a 23-hour day yields 23. `localDate` and `localHour` are a
 * denormalization that lets the grid render and lets a human read the table
 * without converting timezones in every query.
 *
 * The absence of a row means "no answer", which is deliberately distinct from an
 * explicit NO.
 */
export const availabilityStates = ['YES', 'IF_NEED_BE', 'NO'] as const

export const availabilitySlot = mysqlTable(
  'availability_slot',
  {
    id: idColumn().primaryKey(),
    gameSessionId: idColumn('game_session_id')
      .notNull()
      .references(() => gameSession.id, { onDelete: 'cascade' }),
    userId: idColumn('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    slotStartUtc: datetime('slot_start_utc', { mode: 'date', fsp: 3 }).notNull(),
    localDate: date('local_date', { mode: 'string' }).notNull(),
    localHour: tinyint('local_hour', { unsigned: true }).notNull(),
    state: mysqlEnum('state', availabilityStates).notNull(),
    ...timestamps,
  },
  (t) => [
    // Last line of defence against duplicate slots from rapid autosave.
    uniqueIndex('uq_availability_slot').on(t.gameSessionId, t.userId, t.slotStartUtc),
    index('ix_availability_aggregate').on(t.gameSessionId, t.slotStartUtc),
    index('ix_availability_user').on(t.gameSessionId, t.userId),
  ],
)

export const availabilitySlotRelations = relations(availabilitySlot, ({ one }) => ({
  session: one(gameSession, {
    fields: [availabilitySlot.gameSessionId],
    references: [gameSession.id],
  }),
  user: one(authUser, { fields: [availabilitySlot.userId], references: [authUser.id] }),
}))
