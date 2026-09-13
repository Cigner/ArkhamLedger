import { relations } from 'drizzle-orm'
import {
  bigint,
  boolean,
  char,
  datetime,
  int,
  index,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'
import { ID_LENGTH, TOKEN_HASH_LENGTH, idColumn, softDelete, timestamps } from './_shared'

/**
 * Identity and session storage.
 *
 * These tables are owned by the auth library and therefore carry an `auth_`
 * prefix: the domain has its own notion of a "session" (a game session), and an
 * unprefixed `session` table would collide with it in every query and migration.
 *
 * Columns beyond the library's own schema — status, timezone, locale — are
 * application data attached to the same row to avoid a join on every request.
 */
/**
 * Global roles use the auth library's own lowercase vocabulary so that no
 * translation layer sits between the session and the database; a mapping here
 * would be one more thing that can silently drift out of sync.
 */
export const globalRoles = ['user', 'admin'] as const
export const userStatuses = ['PENDING_ACTIVATION', 'ACTIVE', 'DISABLED'] as const

export const authUser = mysqlTable(
  'auth_user',
  {
    id: idColumn().primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    email: varchar('email', { length: 254 }).notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: varchar('image', { length: 512 }),

    role: mysqlEnum('role', globalRoles).notNull().default('user'),
    banned: boolean('banned').notNull().default(false),
    banReason: varchar('ban_reason', { length: 255 }),
    banExpires: datetime('ban_expires', { mode: 'date', fsp: 3 }),

    status: mysqlEnum('status', userStatuses).notNull().default('PENDING_ACTIVATION'),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Europe/Warsaw'),
    locale: varchar('locale', { length: 10 }).notNull().default('en'),

    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex('uq_auth_user_email').on(t.email),
    index('ix_auth_user_status').on(t.status),
    index('ix_auth_user_deleted').on(t.deletedAt),
  ],
)

export const authSession = mysqlTable(
  'auth_session',
  {
    id: idColumn().primaryKey(),
    userId: idColumn('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 255 }).notNull(),
    expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: varchar('user_agent', { length: 512 }),
    impersonatedBy: varchar('impersonated_by', { length: ID_LENGTH }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('uq_auth_session_token').on(t.token),
    index('ix_auth_session_user').on(t.userId),
    index('ix_auth_session_expires').on(t.expiresAt),
  ],
)

export const authAccount = mysqlTable(
  'auth_account',
  {
    id: idColumn().primaryKey(),
    userId: idColumn('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    accountId: varchar('account_id', { length: 255 }).notNull(),
    providerId: varchar('provider_id', { length: 64 }).notNull(),
    /** Argon2id digest for the credential provider; null for external providers. */
    password: text('password'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: datetime('access_token_expires_at', { mode: 'date', fsp: 3 }),
    refreshTokenExpiresAt: datetime('refresh_token_expires_at', { mode: 'date', fsp: 3 }),
    scope: text('scope'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('uq_auth_account_provider').on(t.providerId, t.accountId),
    index('ix_auth_account_user').on(t.userId),
  ],
)

export const authVerification = mysqlTable(
  'auth_verification',
  {
    id: idColumn().primaryKey(),
    identifier: varchar('identifier', { length: 254 }).notNull(),
    value: varchar('value', { length: 255 }).notNull(),
    expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
    ...timestamps,
  },
  (t) => [
    index('ix_auth_verification_identifier').on(t.identifier),
    index('ix_auth_verification_expires').on(t.expiresAt),
  ],
)

/**
 * Rate-limit counters.
 *
 * Owned by the auth library, which keeps one row per throttled key. Stored in
 * the database rather than in process memory so that limits survive a restart —
 * an in-memory counter resets on every deploy, which is precisely when an
 * attacker benefits.
 */
export const authRateLimit = mysqlTable(
  'auth_rate_limit',
  {
    id: idColumn().primaryKey(),
    key: varchar('key', { length: 255 }).notNull(),
    count: int('count').notNull().default(0),
    /** Epoch milliseconds of the most recent request against this key. */
    lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
  },
  (t) => [uniqueIndex('uq_rate_limit_key').on(t.key)],
)

/**
 * Per-identity throttle counters.
 *
 * Separate from the library's own IP-keyed table because it answers a different
 * question: how many times has anyone tried THIS address, from anywhere. IP
 * rotation is free; a target address is not.
 *
 * Defined here rather than left to the rate-limiting library's automatic table
 * creation, so the schema stays entirely inside the migrations.
 */
export const identityThrottle = mysqlTable(
  'identity_throttle',
  {
    /** `<scope>:<lowercased identifier>`, e.g. `signin:anna@example.test`. */
    id: varchar('id', { length: 320 }).primaryKey(),
    attempts: int('attempts').notNull().default(0),
    /** Start of the current counting window. */
    windowStartedAt: datetime('window_started_at', { mode: 'date', fsp: 3 }).notNull(),
    /** Set once the limit is exceeded; requests are refused until it passes. */
    blockedUntil: datetime('blocked_until', { mode: 'date', fsp: 3 }),
  },
  (t) => [index('ix_throttle_window').on(t.windowStartedAt)],
)

/**
 * First-login activation links.
 *
 * Kept out of `auth_verification` because the lifecycle differs: an activation
 * token is issued by an administrator, handed over out of band, and consumed
 * exactly once to set the initial password.
 */
export const userActivationToken = mysqlTable(
  'user_activation_token',
  {
    id: idColumn().primaryKey(),
    userId: idColumn('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    tokenHash: char('token_hash', { length: TOKEN_HASH_LENGTH }).notNull(),
    expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
    usedAt: datetime('used_at', { mode: 'date', fsp: 3 }),
    createdBy: idColumn('created_by')
      .notNull()
      .references(() => authUser.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('uq_activation_token_hash').on(t.tokenHash),
    index('ix_activation_token_user').on(t.userId),
    index('ix_activation_token_expires').on(t.expiresAt),
  ],
)

export const authUserRelations = relations(authUser, ({ many }) => ({
  sessions: many(authSession),
  accounts: many(authAccount),
}))

export const authSessionRelations = relations(authSession, ({ one }) => ({
  user: one(authUser, { fields: [authSession.userId], references: [authUser.id] }),
}))

export const authAccountRelations = relations(authAccount, ({ one }) => ({
  user: one(authUser, { fields: [authAccount.userId], references: [authUser.id] }),
}))

export const userActivationTokenRelations = relations(userActivationToken, ({ one }) => ({
  user: one(authUser, { fields: [userActivationToken.userId], references: [authUser.id] }),
}))
