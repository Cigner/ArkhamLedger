import { relations } from 'drizzle-orm'
import {
  boolean,
  char,
  datetime,
  index,
  json,
  mysqlEnum,
  mysqlTable,
  smallint,
  text,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'
import { TOKEN_HASH_LENGTH, idColumn, softDelete, timestamps } from './_shared'
import { authUser } from './auth'

/**
 * Campaigns, membership and invitations.
 *
 * A campaign owns its members, its sessions and its scheduling defaults. The
 * owner is an attribute rather than a role: owners are always Keepers, but hold
 * additional rights (archive, transfer ownership, remove members).
 */
export const campaignStatuses = [
  'PLANNING',
  'ACTIVE',
  'ON_HIATUS',
  'COMPLETED',
  'ARCHIVED',
] as const

export const campaignRoles = ['KEEPER', 'INVESTIGATOR'] as const
export const membershipStatuses = ['ACTIVE', 'LEFT', 'REMOVED'] as const
export const quorumModes = ['HALF_PLUS_ONE', 'ALL', 'CUSTOM'] as const

/**
 * Scenario metadata.
 *
 * Text only in the MVP. A null campaignId marks a shared library entry, which is
 * the extension point for cross-campaign scenario reuse; attached materials will
 * hang off this table rather than off campaigns or sessions.
 */
export const scenario = mysqlTable(
  'scenario',
  {
    id: idColumn().primaryKey(),
    campaignId: idColumn('campaign_id'),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    createdBy: idColumn('created_by')
      .notNull()
      .references(() => authUser.id),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index('ix_scenario_campaign').on(t.campaignId)],
)

export const campaign = mysqlTable(
  'campaign',
  {
    id: idColumn().primaryKey(),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    ownerId: idColumn('owner_id')
      .notNull()
      .references(() => authUser.id),
    scenarioId: idColumn('scenario_id').references(() => scenario.id, { onDelete: 'set null' }),
    status: mysqlEnum('status', campaignStatuses).notNull().default('PLANNING'),

    /** IANA zone the availability grid is rendered in for every member. */
    timezone: varchar('timezone', { length: 64 }).notNull().default('Europe/Warsaw'),
    defaultMinSessionHours: tinyint('default_min_session_hours', { unsigned: true })
      .notNull()
      .default(6),
    defaultQuorumMode: mysqlEnum('default_quorum_mode', quorumModes)
      .notNull()
      .default('HALF_PLUS_ONE'),
    defaultQuorumValue: tinyint('default_quorum_value', { unsigned: true }),

    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index('ix_campaign_owner').on(t.ownerId),
    index('ix_campaign_status').on(t.status, t.deletedAt),
  ],
)

/**
 * Campaign membership.
 *
 * Unique on (campaign, user) so that rejoining after leaving reactivates the
 * existing row instead of creating a second one — this preserves the member's
 * historical availability and attendance.
 */
export const campaignMember = mysqlTable(
  'campaign_member',
  {
    id: idColumn().primaryKey(),
    campaignId: idColumn('campaign_id')
      .notNull()
      .references(() => campaign.id, { onDelete: 'cascade' }),
    userId: idColumn('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    role: mysqlEnum('role', campaignRoles).notNull().default('INVESTIGATOR'),
    status: mysqlEnum('status', membershipStatuses).notNull().default('ACTIVE'),
    joinedAt: datetime('joined_at', { mode: 'date', fsp: 3 }).notNull(),
    leftAt: datetime('left_at', { mode: 'date', fsp: 3 }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('uq_campaign_member').on(t.campaignId, t.userId),
    index('ix_member_user').on(t.userId, t.status),
    index('ix_member_campaign_role').on(t.campaignId, t.status, t.role),
  ],
)

/**
 * Invitation links.
 *
 * One shape covers both modes: a personal invitation pins targetUserId and
 * maxUses = 1, a shared link leaves the target null with a higher use count.
 * Revocation is a flag rather than a delete so the audit trail survives.
 */
export const campaignInvitation = mysqlTable(
  'campaign_invitation',
  {
    id: idColumn().primaryKey(),
    campaignId: idColumn('campaign_id')
      .notNull()
      .references(() => campaign.id, { onDelete: 'cascade' }),
    tokenHash: char('token_hash', { length: TOKEN_HASH_LENGTH }).notNull(),
    targetUserId: idColumn('target_user_id').references(() => authUser.id, {
      onDelete: 'cascade',
    }),
    roleOnJoin: mysqlEnum('role_on_join', campaignRoles).notNull().default('INVESTIGATOR'),
    maxUses: smallint('max_uses', { unsigned: true }).notNull().default(1),
    usedCount: smallint('used_count', { unsigned: true }).notNull().default(0),
    expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
    revokedAt: datetime('revoked_at', { mode: 'date', fsp: 3 }),
    createdBy: idColumn('created_by')
      .notNull()
      .references(() => authUser.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('uq_invitation_token_hash').on(t.tokenHash),
    index('ix_invitation_campaign').on(t.campaignId, t.revokedAt),
    index('ix_invitation_expires').on(t.expiresAt),
  ],
)

export const integrationTypes = ['DISCORD_WEBHOOK'] as const

/**
 * Outbound integrations configured per campaign.
 *
 * The config payload holds the webhook URL encrypted with AES-256-GCM; the URL
 * is a bearer credential and must never be readable from a database dump.
 */
export const campaignIntegration = mysqlTable(
  'campaign_integration',
  {
    id: idColumn().primaryKey(),
    campaignId: idColumn('campaign_id')
      .notNull()
      .references(() => campaign.id, { onDelete: 'cascade' }),
    type: mysqlEnum('type', integrationTypes).notNull(),
    config: json('config').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('uq_integration_campaign_type').on(t.campaignId, t.type)],
)

export const campaignRelations = relations(campaign, ({ one, many }) => ({
  owner: one(authUser, { fields: [campaign.ownerId], references: [authUser.id] }),
  scenario: one(scenario, { fields: [campaign.scenarioId], references: [scenario.id] }),
  members: many(campaignMember),
  invitations: many(campaignInvitation),
}))

export const campaignMemberRelations = relations(campaignMember, ({ one }) => ({
  campaign: one(campaign, { fields: [campaignMember.campaignId], references: [campaign.id] }),
  user: one(authUser, { fields: [campaignMember.userId], references: [authUser.id] }),
}))

export const campaignInvitationRelations = relations(campaignInvitation, ({ one }) => ({
  campaign: one(campaign, { fields: [campaignInvitation.campaignId], references: [campaign.id] }),
  targetUser: one(authUser, {
    fields: [campaignInvitation.targetUserId],
    references: [authUser.id],
  }),
}))
