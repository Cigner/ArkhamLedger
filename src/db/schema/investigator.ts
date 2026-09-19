import { relations } from 'drizzle-orm'
import {
  type AnyMySqlColumn,
  type MySqlTableExtraConfigValue,
  boolean,
  char,
  datetime,
  decimal,
  foreignKey,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  smallint,
  text,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'
import { idColumn, timestamps } from './_shared'
import { authUser } from './auth'
import { campaign } from './campaign'
import { gameSession, sessionParticipant } from './session'

export const investigatorStatuses = ['DRAFT', 'ACTIVE', 'RETIRED', 'DECEASED'] as const
export const investigatorCreationMethods = [
  'STANDARD_ROLLS',
  'ASSIGNED_ROLLS',
  'MANUAL_ENTRY',
] as const
export const investigatorEras = ['CLASSIC_1920S', 'MODERN'] as const
export const resourceKinds = ['HP', 'SAN', 'MP', 'LUCK'] as const
export const visibilityLevels = ['PUBLIC', 'HIDDEN'] as const
export const accessLevels = ['OWNER', 'KEEPER', 'PLAYER', 'HISTORICAL'] as const
export const snapshotKinds = [
  'SESSION_START',
  'SESSION_END',
  'TRANSFER',
  'ACCESS_REDUCTION',
  'MANUAL',
] as const
export const disclosureReasons = [
  'FIELD_HIDDEN',
  'CAMPAIGN_UNLINKED',
  'CAMPAIGN_LEFT',
  'CAMPAIGN_ENDED',
  'TRANSFERRED',
  'NOTE_RESTRICTED',
  'MANUAL',
] as const
export const transferStatuses = ['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'] as const
export const noteKinds = ['OWNER_PRIVATE', 'KEEPER', 'PLAYER_OBSERVATION'] as const
export const noteVisibilityLevels = [
  'AUTHOR_ONLY',
  'KEEPERS',
  'KEEPERS_AND_OWNER',
  'CAMPAIGN',
] as const

/**
 * Investigator aggregate persistence.
 *
 * Mutable current state is normalized for authorization and updates. Immutable
 * JSON snapshots preserve exact historical state and previously disclosed data.
 */
export const investigatorLineage = mysqlTable('investigator_lineage', {
  id: idColumn().primaryKey(),
  createdBy: idColumn('created_by')
    .notNull()
    .references(() => authUser.id),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
})

export const investigator = mysqlTable(
  'investigator',
  {
    id: idColumn().primaryKey(),
    lineageId: idColumn('lineage_id')
      .notNull()
      .references(() => investigatorLineage.id),
    branchedFromId: idColumn('branched_from_id').references((): AnyMySqlColumn => investigator.id, {
      onDelete: 'set null',
    }),
    ownerId: idColumn('owner_id')
      .notNull()
      .references(() => authUser.id),
    creatorId: idColumn('creator_id').references(() => authUser.id, {
      onDelete: 'set null',
    }),
    creatorCampaignId: idColumn('creator_campaign_id').references(() => campaign.id, {
      onDelete: 'set null',
    }),
    status: mysqlEnum('status', investigatorStatuses).notNull().default('DRAFT'),
    creationMethod: mysqlEnum('creation_method', investigatorCreationMethods).notNull(),
    rulesetId: varchar('ruleset_id', { length: 80 }).notNull(),
    rulesetVersion: varchar('ruleset_version', { length: 20 }).notNull(),
    era: mysqlEnum('era', investigatorEras).notNull(),
    firstUsedAt: datetime('first_used_at', { mode: 'date', fsp: 3 }),
    archivedAt: datetime('archived_at', { mode: 'date', fsp: 3 }),
    lockVersion: int('lock_version', { unsigned: true }).notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index('ix_investigator_owner').on(t.ownerId, t.archivedAt, t.status),
    index('ix_investigator_lineage').on(t.lineageId, t.createdAt),
    index('ix_investigator_creator_campaign').on(t.creatorCampaignId, t.creatorId),
  ],
)

export const investigatorProfile = mysqlTable('investigator_profile', {
  investigatorId: idColumn('investigator_id')
    .primaryKey()
    .references(() => investigator.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 160 }),
  age: tinyint('age', { unsigned: true }),
  sex: varchar('sex', { length: 80 }),
  residence: varchar('residence', { length: 200 }),
  birthplace: varchar('birthplace', { length: 200 }),
  species: varchar('species', { length: 80 }).notNull().default('Human'),
  occupationId: varchar('occupation_id', { length: 100 }),
  occupationCharacteristic: char('occupation_characteristic', { length: 3 }),
  /** Section 7's optional line: who this character knows through the work. */
  occupationContact: varchar('occupation_contact', { length: 300 }),
  ...timestamps,
})

export const investigatorCharacteristic = mysqlTable('investigator_characteristic', {
  investigatorId: idColumn('investigator_id')
    .primaryKey()
    .references(() => investigator.id, { onDelete: 'cascade' }),
  strength: tinyint('strength', { unsigned: true }),
  constitution: tinyint('constitution', { unsigned: true }),
  size: tinyint('size', { unsigned: true }),
  dexterity: tinyint('dexterity', { unsigned: true }),
  appearance: tinyint('appearance', { unsigned: true }),
  intelligence: tinyint('intelligence', { unsigned: true }),
  power: tinyint('power', { unsigned: true }),
  education: tinyint('education', { unsigned: true }),
  startingLuck: tinyint('starting_luck', { unsigned: true }),
  rollRecord: json('roll_record'),
  ageAdjustment: json('age_adjustment'),
  ...timestamps,
})

export const investigatorState = mysqlTable('investigator_state', {
  investigatorId: idColumn('investigator_id')
    .primaryKey()
    .references(() => investigator.id, { onDelete: 'cascade' }),
  hitPoints: smallint('hit_points'),
  sanity: smallint('sanity'),
  magicPoints: smallint('magic_points'),
  luck: smallint('luck'),
  majorWound: boolean('major_wound').notNull().default(false),
  temporaryInsanity: boolean('temporary_insanity').notNull().default(false),
  indefiniteInsanity: boolean('indefinite_insanity').notNull().default(false),
  unconscious: boolean('unconscious').notNull().default(false),
  dying: boolean('dying').notNull().default(false),
  ...timestamps,
})

export const investigatorFinance = mysqlTable('investigator_finance', {
  investigatorId: idColumn('investigator_id')
    .primaryKey()
    .references(() => investigator.id, { onDelete: 'cascade' }),
  creditRating: tinyint('credit_rating', { unsigned: true }),
  cash: decimal('cash', { precision: 15, scale: 2, mode: 'number' }),
  assets: decimal('assets', { precision: 18, scale: 2, mode: 'number' }),
  spendingLevel: decimal('spending_level', { precision: 15, scale: 2, mode: 'number' }),
  assetsUnboundedAbove: boolean('assets_unbounded_above').notNull().default(false),
  notes: text('notes'),
  ...timestamps,
})

export const investigatorSkill = mysqlTable(
  'investigator_skill',
  {
    id: idColumn().primaryKey(),
    investigatorId: idColumn('investigator_id')
      .notNull()
      .references(() => investigator.id, { onDelete: 'cascade' }),
    definitionId: varchar('definition_id', { length: 100 }).notNull(),
    familyId: varchar('family_id', { length: 100 }),
    specializationKey: varchar('specialization_key', { length: 100 }).notNull().default(''),
    specializationLabel: varchar('specialization_label', { length: 160 }),
    baseValue: tinyint('base_value', { unsigned: true }).notNull(),
    occupationPoints: tinyint('occupation_points', { unsigned: true }).notNull().default(0),
    personalInterestPoints: tinyint('personal_interest_points', { unsigned: true })
      .notNull()
      .default(0),
    playImprovement: tinyint('play_improvement', { unsigned: true }).notNull().default(0),
    otherAdjustment: smallint('other_adjustment').notNull().default(0),
    currentValue: tinyint('current_value', { unsigned: true }).notNull(),
    isOccupationSkill: boolean('is_occupation_skill').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('uq_inv_skill_definition').on(
      t.investigatorId,
      t.definitionId,
      t.specializationKey,
    ),
    index('ix_inv_skill_investigator_value').on(t.investigatorId, t.currentValue),
  ],
)

export const investigatorSkillDevelopment = mysqlTable(
  'investigator_skill_development',
  {
    id: idColumn().primaryKey(),
    investigatorSkillId: idColumn('investigator_skill_id').notNull(),
    resolvedBy: idColumn('resolved_by').references(() => authUser.id, {
      onDelete: 'set null',
    }),
    percentileRoll: tinyint('percentile_roll', { unsigned: true }).notNull(),
    improvementRoll: tinyint('improvement_roll', { unsigned: true }),
    previousValue: tinyint('previous_value', { unsigned: true }).notNull(),
    currentValue: tinyint('current_value', { unsigned: true }).notNull(),
    resolvedAt: datetime('resolved_at', { mode: 'date', fsp: 3 }).notNull(),
  },
  (t) => [
    foreignKey({
      name: 'fk_skill_development_skill',
      columns: [t.investigatorSkillId],
      foreignColumns: [investigatorSkill.id],
    }).onDelete('cascade'),
    index('ix_skill_development_skill').on(t.investigatorSkillId, t.resolvedAt),
  ],
)

export const investigatorSkillMark = mysqlTable(
  'investigator_skill_mark',
  {
    id: idColumn().primaryKey(),
    investigatorSkillId: idColumn('investigator_skill_id').notNull(),
    gameSessionId: idColumn('game_session_id').references(() => gameSession.id, {
      onDelete: 'set null',
    }),
    developmentId: idColumn('development_id'),
    markedBy: idColumn('marked_by').references(() => authUser.id, {
      onDelete: 'set null',
    }),
    markedAt: datetime('marked_at', { mode: 'date', fsp: 3 }).notNull(),
  },
  (t) => [
    foreignKey({
      name: 'fk_skill_mark_skill',
      columns: [t.investigatorSkillId],
      foreignColumns: [investigatorSkill.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'fk_skill_mark_development',
      columns: [t.developmentId],
      foreignColumns: [investigatorSkillDevelopment.id],
    }).onDelete('set null'),
    uniqueIndex('uq_skill_mark_session').on(t.investigatorSkillId, t.gameSessionId),
    index('ix_skill_mark_pending').on(t.investigatorSkillId, t.developmentId),
  ],
)

export const investigatorBackstoryEntry = mysqlTable(
  'investigator_backstory_entry',
  {
    id: idColumn().primaryKey(),
    investigatorId: idColumn('investigator_id')
      .notNull()
      .references(() => investigator.id, { onDelete: 'cascade' }),
    category: varchar('category', { length: 80 }).notNull(),
    content: text('content').notNull(),
    position: smallint('position', { unsigned: true }).notNull().default(0),
    isKeyConnection: boolean('is_key_connection').notNull().default(false),
    ...timestamps,
  },
  (t) => [index('ix_backstory_investigator').on(t.investigatorId, t.category, t.position)],
)

export const investigatorWeapon = mysqlTable(
  'investigator_weapon',
  {
    id: idColumn().primaryKey(),
    investigatorId: idColumn('investigator_id')
      .notNull()
      .references(() => investigator.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    skillKey: varchar('skill_key', { length: 160 }).notNull(),
    damage: varchar('damage', { length: 80 }).notNull(),
    range: varchar('range', { length: 80 }),
    attacks: varchar('attacks', { length: 80 }),
    ammunition: smallint('ammunition'),
    malfunction: tinyint('malfunction', { unsigned: true }),
    notes: text('notes'),
    position: smallint('position', { unsigned: true }).notNull().default(0),
    ...timestamps,
  },
  (t) => [index('ix_weapon_investigator').on(t.investigatorId, t.position)],
)

export const investigatorPossession = mysqlTable(
  'investigator_possession',
  {
    id: idColumn().primaryKey(),
    investigatorId: idColumn('investigator_id')
      .notNull()
      .references(() => investigator.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    quantity: smallint('quantity', { unsigned: true }).notNull().default(1),
    value: decimal('value', { precision: 15, scale: 2, mode: 'number' }),
    isTreasured: boolean('is_treasured').notNull().default(false),
    position: smallint('position', { unsigned: true }).notNull().default(0),
    ...timestamps,
  },
  (t) => [index('ix_possession_investigator').on(t.investigatorId, t.position)],
)

export const investigatorResourceEvent = mysqlTable(
  'investigator_resource_event',
  {
    id: idColumn().primaryKey(),
    investigatorId: idColumn('investigator_id')
      .notNull()
      .references(() => investigator.id, { onDelete: 'cascade' }),
    resource: mysqlEnum('resource', resourceKinds).notNull(),
    previousValue: smallint('previous_value').notNull(),
    currentValue: smallint('current_value').notNull(),
    delta: smallint('delta').notNull(),
    actorId: idColumn('actor_id').references(() => authUser.id, { onDelete: 'set null' }),
    gameSessionId: idColumn('game_session_id').references(() => gameSession.id, {
      onDelete: 'set null',
    }),
    reason: varchar('reason', { length: 500 }),
    reversesEventId: idColumn('reverses_event_id'),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
  },
  (t): MySqlTableExtraConfigValue[] => [
    foreignKey({
      name: 'fk_resource_event_reversal',
      columns: [t.reversesEventId],
      foreignColumns: [investigatorResourceEvent.id],
    }).onDelete('set null'),
    index('ix_resource_event_investigator').on(t.investigatorId, t.createdAt),
    uniqueIndex('uq_resource_event_reversal').on(t.reversesEventId),
  ],
)

export const campaignInvestigator = mysqlTable(
  'campaign_investigator',
  {
    id: idColumn().primaryKey(),
    campaignId: idColumn('campaign_id')
      .notNull()
      .references(() => campaign.id),
    investigatorId: idColumn('investigator_id')
      .notNull()
      .references(() => investigator.id),
    linkedBy: idColumn('linked_by').references(() => authUser.id, { onDelete: 'set null' }),
    linkedAt: datetime('linked_at', { mode: 'date', fsp: 3 }).notNull(),
    unlinkedAt: datetime('unlinked_at', { mode: 'date', fsp: 3 }),
    unlinkReason: varchar('unlink_reason', { length: 500 }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('uq_campaign_investigator').on(t.campaignId, t.investigatorId),
    index('ix_campaign_investigator_active').on(t.campaignId, t.unlinkedAt),
    index('ix_investigator_campaign_active').on(t.investigatorId, t.unlinkedAt),
  ],
)

export const investigatorEditGrant = mysqlTable(
  'investigator_edit_grant',
  {
    id: idColumn().primaryKey(),
    investigatorId: idColumn('investigator_id')
      .notNull()
      .references(() => investigator.id),
    campaignId: idColumn('campaign_id')
      .notNull()
      .references(() => campaign.id),
    keeperId: idColumn('keeper_id')
      .notNull()
      .references(() => authUser.id),
    grantedAt: datetime('granted_at', { mode: 'date', fsp: 3 }).notNull(),
    closedAt: datetime('closed_at', { mode: 'date', fsp: 3 }),
    closedReason: varchar('closed_reason', { length: 100 }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('uq_edit_grant_creator').on(t.investigatorId, t.campaignId, t.keeperId),
    index('ix_edit_grant_keeper').on(t.keeperId, t.closedAt),
  ],
)

export const investigatorFieldVisibility = mysqlTable(
  'investigator_field_visibility',
  {
    id: idColumn().primaryKey(),
    investigatorId: idColumn('investigator_id')
      .notNull()
      .references(() => investigator.id, { onDelete: 'cascade' }),
    fieldKey: varchar('field_key', { length: 120 }).notNull(),
    visibility: mysqlEnum('visibility', visibilityLevels).notNull(),
    updatedBy: idColumn('updated_by').references(() => authUser.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => [uniqueIndex('uq_field_visibility').on(t.investigatorId, t.fieldKey)],
)

export const investigatorSnapshot = mysqlTable(
  'investigator_snapshot',
  {
    id: idColumn().primaryKey(),
    investigatorId: idColumn('investigator_id')
      .notNull()
      .references(() => investigator.id),
    kind: mysqlEnum('kind', snapshotKinds).notNull(),
    campaignId: idColumn('campaign_id').references(() => campaign.id, {
      onDelete: 'set null',
    }),
    gameSessionId: idColumn('game_session_id').references(() => gameSession.id, {
      onDelete: 'set null',
    }),
    schemaVersion: smallint('schema_version', { unsigned: true }).notNull(),
    state: json('state').notNull(),
    createdBy: idColumn('created_by').references(() => authUser.id, {
      onDelete: 'set null',
    }),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
  },
  (t) => [
    index('ix_snapshot_investigator').on(t.investigatorId, t.createdAt),
    index('ix_snapshot_session').on(t.gameSessionId, t.kind),
  ],
)

export const investigatorDisclosureSnapshot = mysqlTable(
  'investigator_disclosure_snapshot',
  {
    id: idColumn().primaryKey(),
    investigatorId: idColumn('investigator_id').notNull(),
    viewerId: idColumn('viewer_id')
      .notNull()
      .references(() => authUser.id),
    campaignId: idColumn('campaign_id').references(() => campaign.id, {
      onDelete: 'set null',
    }),
    sourceSnapshotId: idColumn('source_snapshot_id'),
    reason: mysqlEnum('reason', disclosureReasons).notNull(),
    schemaVersion: smallint('schema_version', { unsigned: true }).notNull(),
    projection: json('projection').notNull(),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
  },
  (t) => [
    foreignKey({
      name: 'fk_disclosure_investigator',
      columns: [t.investigatorId],
      foreignColumns: [investigator.id],
    }),
    foreignKey({
      name: 'fk_disclosure_source_snapshot',
      columns: [t.sourceSnapshotId],
      foreignColumns: [investigatorSnapshot.id],
    }).onDelete('set null'),
    index('ix_disclosure_viewer').on(t.viewerId, t.investigatorId, t.createdAt),
    index('ix_disclosure_campaign').on(t.campaignId, t.createdAt),
  ],
)

export const investigatorAccessGrant = mysqlTable(
  'investigator_access_grant',
  {
    id: idColumn().primaryKey(),
    investigatorId: idColumn('investigator_id')
      .notNull()
      .references(() => investigator.id),
    viewerId: idColumn('viewer_id')
      .notNull()
      .references(() => authUser.id),
    campaignId: idColumn('campaign_id').references(() => campaign.id, {
      onDelete: 'set null',
    }),
    level: mysqlEnum('level', accessLevels).notNull(),
    grantedAt: datetime('granted_at', { mode: 'date', fsp: 3 }).notNull(),
    endedAt: datetime('ended_at', { mode: 'date', fsp: 3 }),
    finalDisclosureSnapshotId: idColumn('final_disclosure_snapshot_id'),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: 'fk_access_final_disclosure',
      columns: [t.finalDisclosureSnapshotId],
      foreignColumns: [investigatorDisclosureSnapshot.id],
    }).onDelete('set null'),
    index('ix_access_viewer_active').on(t.viewerId, t.endedAt, t.level),
    index('ix_access_investigator_active').on(t.investigatorId, t.endedAt),
  ],
)

export const sessionInvestigatorAssignment = mysqlTable(
  'session_investigator_assignment',
  {
    id: idColumn().primaryKey(),
    sessionParticipantId: idColumn('session_participant_id').notNull(),
    investigatorId: idColumn('investigator_id').notNull(),
    campaignInvestigatorId: idColumn('campaign_investigator_id').notNull(),
    /**
     * The sheet as it stood when the evening began, and as it stood when it
     * ended. An assignment points at the character and at the version of it that
     * was played, so editing the sheet afterwards cannot change what the history
     * of that session shows.
     */
    startSnapshotId: idColumn('start_snapshot_id'),
    endSnapshotId: idColumn('end_snapshot_id'),
    assignedBy: idColumn('assigned_by').references(() => authUser.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: 'fk_session_assignment_participant',
      columns: [t.sessionParticipantId],
      foreignColumns: [sessionParticipant.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'fk_session_assignment_investigator',
      columns: [t.investigatorId],
      foreignColumns: [investigator.id],
    }),
    foreignKey({
      name: 'fk_assignment_start_snapshot',
      columns: [t.startSnapshotId],
      foreignColumns: [investigatorSnapshot.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'fk_assignment_end_snapshot',
      columns: [t.endSnapshotId],
      foreignColumns: [investigatorSnapshot.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'fk_session_assignment_campaign_investigator',
      columns: [t.campaignInvestigatorId],
      foreignColumns: [campaignInvestigator.id],
    }),
    uniqueIndex('uq_session_investigator_assignment').on(t.sessionParticipantId),
    index('ix_assignment_investigator').on(t.investigatorId),
  ],
)

export const investigatorTransfer = mysqlTable(
  'investigator_transfer',
  {
    id: idColumn().primaryKey(),
    campaignId: idColumn('campaign_id')
      .notNull()
      .references(() => campaign.id),
    sourceInvestigatorId: idColumn('source_investigator_id')
      .notNull()
      .references(() => investigator.id),
    continuationInvestigatorId: idColumn('continuation_investigator_id'),
    fromOwnerId: idColumn('from_owner_id')
      .notNull()
      .references(() => authUser.id),
    toOwnerId: idColumn('to_owner_id')
      .notNull()
      .references(() => authUser.id),
    requestedBy: idColumn('requested_by').references(() => authUser.id, {
      onDelete: 'set null',
    }),
    status: mysqlEnum('status', transferStatuses).notNull().default('PENDING'),
    reason: varchar('reason', { length: 500 }),
    expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
    decidedAt: datetime('decided_at', { mode: 'date', fsp: 3 }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: 'fk_transfer_continuation',
      columns: [t.continuationInvestigatorId],
      foreignColumns: [investigator.id],
    }),
    index('ix_transfer_owner_pending').on(t.fromOwnerId, t.status, t.expiresAt),
    index('ix_transfer_campaign').on(t.campaignId, t.createdAt),
  ],
)

export const investigatorDerivedOverride = mysqlTable(
  'investigator_derived_override',
  {
    id: idColumn().primaryKey(),
    investigatorId: idColumn('investigator_id')
      .notNull()
      .references(() => investigator.id),
    fieldKey: varchar('field_key', { length: 80 }).notNull(),
    value: varchar('value', { length: 120 }).notNull(),
    reason: varchar('reason', { length: 500 }).notNull(),
    setBy: idColumn('set_by').references(() => authUser.id, { onDelete: 'set null' }),
    endedAt: datetime('ended_at', { mode: 'date', fsp: 3 }),
    ...timestamps,
  },
  (t) => [index('ix_derived_override_active').on(t.investigatorId, t.fieldKey, t.endedAt)],
)

export const investigatorNote = mysqlTable(
  'investigator_note',
  {
    id: idColumn().primaryKey(),
    investigatorId: idColumn('investigator_id')
      .notNull()
      .references(() => investigator.id),
    campaignId: idColumn('campaign_id').references(() => campaign.id, {
      onDelete: 'set null',
    }),
    authorId: idColumn('author_id')
      .notNull()
      .references(() => authUser.id),
    kind: mysqlEnum('kind', noteKinds).notNull(),
    /**
     * The sheet this note was written about.
     *
     * Section 16: a player's observation references the latest disclosure
     * available to its author, so a note about a character they can no longer
     * see still has the character it describes attached to it. Null for notes
     * written by somebody who can read the sheet live.
     */
    disclosureSnapshotId: idColumn('disclosure_snapshot_id'),
    ...timestamps,
  },
  (t): MySqlTableExtraConfigValue[] => [
    foreignKey({
      name: 'fk_note_disclosure_snapshot',
      columns: [t.disclosureSnapshotId],
      foreignColumns: [investigatorDisclosureSnapshot.id],
    }).onDelete('set null'),
    index('ix_note_investigator').on(t.investigatorId, t.createdAt),
    index('ix_note_author').on(t.authorId, t.createdAt),
  ],
)

export const investigatorNoteRevision = mysqlTable(
  'investigator_note_revision',
  {
    id: idColumn().primaryKey(),
    noteId: idColumn('note_id')
      .notNull()
      .references(() => investigatorNote.id),
    revision: smallint('revision', { unsigned: true }).notNull(),
    content: text('content').notNull(),
    visibility: mysqlEnum('visibility', noteVisibilityLevels).notNull(),
    createdBy: idColumn('created_by').references(() => authUser.id, {
      onDelete: 'set null',
    }),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
  },
  (t) => [uniqueIndex('uq_note_revision').on(t.noteId, t.revision)],
)

export const investigatorNoteDisclosure = mysqlTable(
  'investigator_note_disclosure',
  {
    id: idColumn().primaryKey(),
    revisionId: idColumn('revision_id').notNull(),
    viewerId: idColumn('viewer_id')
      .notNull()
      .references(() => authUser.id),
    disclosedAt: datetime('disclosed_at', { mode: 'date', fsp: 3 }).notNull(),
  },
  (t) => [
    foreignKey({
      name: 'fk_note_disclosure_revision',
      columns: [t.revisionId],
      foreignColumns: [investigatorNoteRevision.id],
    }),
    uniqueIndex('uq_note_disclosure').on(t.revisionId, t.viewerId),
  ],
)

export const investigatorRelations = relations(investigator, ({ one, many }) => ({
  lineage: one(investigatorLineage, {
    fields: [investigator.lineageId],
    references: [investigatorLineage.id],
  }),
  owner: one(authUser, { fields: [investigator.ownerId], references: [authUser.id] }),
  profile: one(investigatorProfile),
  characteristics: one(investigatorCharacteristic),
  state: one(investigatorState),
  finance: one(investigatorFinance),
  skills: many(investigatorSkill),
  campaigns: many(campaignInvestigator),
  snapshots: many(investigatorSnapshot),
}))

export const investigatorSkillRelations = relations(investigatorSkill, ({ one, many }) => ({
  investigator: one(investigator, {
    fields: [investigatorSkill.investigatorId],
    references: [investigator.id],
  }),
  marks: many(investigatorSkillMark),
  developments: many(investigatorSkillDevelopment),
}))

export const campaignInvestigatorRelations = relations(campaignInvestigator, ({ one }) => ({
  campaign: one(campaign, {
    fields: [campaignInvestigator.campaignId],
    references: [campaign.id],
  }),
  investigator: one(investigator, {
    fields: [campaignInvestigator.investigatorId],
    references: [investigator.id],
  }),
}))
