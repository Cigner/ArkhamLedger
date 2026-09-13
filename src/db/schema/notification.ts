import { relations } from 'drizzle-orm'
import {
  datetime,
  index,
  json,
  mysqlEnum,
  mysqlTable,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'
import { idColumn, timestamps } from './_shared'
import { authUser } from './auth'
import { campaign } from './campaign'
import { gameSession } from './session'

/**
 * Notifications and their per-channel delivery records.
 *
 * The two tables implement a transactional outbox: the notification is written
 * in the same transaction as the domain change, and the worker delivers it
 * afterwards. A crash between the two can therefore never lose a notification,
 * and the unique (notification, channel) constraint makes redelivery after a
 * restart idempotent.
 */
export const notificationTypes = [
  'CAMPAIGN_INVITED',
  'CAMPAIGN_MEMBER_JOINED',
  'SESSION_CREATED',
  'AVAILABILITY_REQUESTED',
  'AVAILABILITY_REMINDER',
  'SESSION_SCHEDULED',
  'SESSION_RESCHEDULED',
  'SESSION_CANCELLED',
  'NO_NEXT_SESSION',
] as const

export const deliveryChannels = ['IN_APP', 'EMAIL', 'DISCORD'] as const
export const deliveryStatuses = ['PENDING', 'SENDING', 'SENT', 'FAILED'] as const

export const notification = mysqlTable(
  'notification',
  {
    id: idColumn().primaryKey(),
    userId: idColumn('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    type: mysqlEnum('type', notificationTypes).notNull(),
    campaignId: idColumn('campaign_id').references(() => campaign.id, { onDelete: 'cascade' }),
    gameSessionId: idColumn('game_session_id').references(() => gameSession.id, {
      onDelete: 'cascade',
    }),
    /** i18n key parameters; never a pre-rendered sentence. */
    payload: json('payload').notNull(),
    readAt: datetime('read_at', { mode: 'date', fsp: 3 }),
    ...timestamps,
  },
  (t) => [index('ix_notification_inbox').on(t.userId, t.readAt, t.createdAt)],
)

export const notificationDelivery = mysqlTable(
  'notification_delivery',
  {
    id: idColumn().primaryKey(),
    notificationId: idColumn('notification_id')
      .notNull()
      .references(() => notification.id, { onDelete: 'cascade' }),
    channel: mysqlEnum('channel', deliveryChannels).notNull(),
    status: mysqlEnum('status', deliveryStatuses).notNull().default('PENDING'),
    attempts: tinyint('attempts', { unsigned: true }).notNull().default(0),
    nextAttemptAt: datetime('next_attempt_at', { mode: 'date', fsp: 3 }).notNull(),
    lastError: varchar('last_error', { length: 500 }),
    sentAt: datetime('sent_at', { mode: 'date', fsp: 3 }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('uq_delivery_notification_channel').on(t.notificationId, t.channel),
    // Claim query: PENDING rows whose backoff has elapsed.
    index('ix_delivery_queue').on(t.status, t.nextAttemptAt),
  ],
)

export const notificationRelations = relations(notification, ({ one, many }) => ({
  user: one(authUser, { fields: [notification.userId], references: [authUser.id] }),
  deliveries: many(notificationDelivery),
}))

export const notificationDeliveryRelations = relations(notificationDelivery, ({ one }) => ({
  notification: one(notification, {
    fields: [notificationDelivery.notificationId],
    references: [notification.id],
  }),
}))
