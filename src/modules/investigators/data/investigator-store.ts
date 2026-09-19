import 'server-only'
import { and, count, eq, isNull } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import {
  campaignInvestigator,
  investigator,
  investigatorBackstoryEntry,
  investigatorCharacteristic,
  investigatorDisclosureSnapshot,
  investigatorFieldVisibility,
  investigatorFinance,
  investigatorLineage,
  investigatorPossession,
  investigatorProfile,
  investigatorSnapshot,
  investigatorState,
  investigatorWeapon,
  sessionInvestigatorAssignment,
} from '@/db/schema'
import { newId } from '@/lib/ids'
import { NotFoundError } from '@/lib/errors'
import type { InvestigatorStatus } from '../domain/lifecycle'
import type { CreationMethod } from '../domain/ruleset'

/**
 * Investigator persistence, without a viewer.
 *
 * Callers authorize before they arrive, exactly as the session store does. The
 * split exists so the worker and the transfer flow can write without the
 * authentication stack in them.
 *
 * Every mutation of a sheet starts by claiming the version. An Investigator is
 * edited from more than one place at once in normal use - the owner on their
 * phone at the table while the Keeper who made the sheet is still tidying it up
 * - and last-write-wins would silently discard whichever of them was slower.
 */
export type InvestigatorState = {
  readonly id: string
  readonly ownerId: string
  readonly lineageId: string
  readonly status: InvestigatorStatus
  readonly rulesetId: string
  readonly rulesetVersion: string
  readonly era: string
  readonly firstUsedAt: Date | null
  readonly archivedAt: Date | null
  readonly lockVersion: number
}

export async function findInvestigatorState(
  investigatorId: string,
  executor: DbOrTx = db,
): Promise<InvestigatorState> {
  const row = await executor.query.investigator.findFirst({
    where: eq(investigator.id, investigatorId),
    columns: {
      id: true,
      ownerId: true,
      lineageId: true,
      status: true,
      rulesetId: true,
      rulesetVersion: true,
      era: true,
      firstUsedAt: true,
      archivedAt: true,
      lockVersion: true,
    },
  })

  if (!row) throw new NotFoundError()
  return row
}

/**
 * Takes the aggregate's next version, or reports that somebody else took it.
 *
 * The expected version is part of the WHERE clause, so two writers starting from
 * the same state cannot both succeed: the second affects no rows and is told to
 * re-read rather than overwriting a change it never saw. Callers run this first
 * inside the transaction that performs the write, so the claim and the write
 * either both land or neither does.
 */
export async function claimVersion(input: {
  investigatorId: string
  expectedVersion: number
  now: Date
  executor: DbOrTx
}): Promise<boolean> {
  const [result] = await input.executor
    .update(investigator)
    .set({ lockVersion: input.expectedVersion + 1, updatedAt: input.now })
    .where(
      and(
        eq(investigator.id, input.investigatorId),
        eq(investigator.lockVersion, input.expectedVersion),
      ),
    )

  return result.affectedRows === 1
}

/**
 * Records that an Investigator has been played.
 *
 * Idempotent by construction: only the first use sets the stamp, because it is
 * what closes the creating Keeper's edit grant, and a later session must not
 * move that moment.
 */
export async function markFirstUse(input: {
  investigatorId: string
  now: Date
  executor: DbOrTx
}): Promise<boolean> {
  const [result] = await input.executor
    .update(investigator)
    .set({ firstUsedAt: input.now, updatedAt: input.now })
    .where(and(eq(investigator.id, input.investigatorId), isNull(investigator.firstUsedAt)))

  return result.affectedRows === 1
}

/**
 * Creates a character and the rows every sheet has.
 *
 * The four satellite rows are written empty rather than on demand. A sheet with
 * no characteristics row and a sheet with an empty one are the same thing to a
 * reader, and creating them here means every later update is an update rather
 * than an upsert that has to guess whether it is the first.
 *
 * The lineage is created with it: a character is the first branch of its own
 * history, and a transfer later adds branches rather than inventing a lineage
 * retrospectively.
 */
export async function insertInvestigator(input: {
  ownerId: string
  creatorId: string
  creatorCampaignId: string | null
  name: string | null
  creationMethod: CreationMethod
  rulesetId: string
  rulesetVersion: string
  era: string
  now: Date
  executor: DbOrTx
}): Promise<{ investigatorId: string; lineageId: string }> {
  const lineageId = newId()
  const investigatorId = newId()

  await input.executor.insert(investigatorLineage).values({
    id: lineageId,
    createdBy: input.creatorId,
    createdAt: input.now,
  })

  await input.executor.insert(investigator).values({
    id: investigatorId,
    lineageId,
    ownerId: input.ownerId,
    creatorId: input.creatorId,
    creatorCampaignId: input.creatorCampaignId,
    status: 'DRAFT',
    creationMethod: input.creationMethod,
    rulesetId: input.rulesetId,
    rulesetVersion: input.rulesetVersion,
    era: input.era as 'CLASSIC_1920S' | 'MODERN',
    createdAt: input.now,
    updatedAt: input.now,
  })

  await input.executor
    .insert(investigatorProfile)
    .values({ investigatorId, name: input.name, createdAt: input.now, updatedAt: input.now })
  await input.executor
    .insert(investigatorCharacteristic)
    .values({ investigatorId, createdAt: input.now, updatedAt: input.now })
  await input.executor
    .insert(investigatorState)
    .values({ investigatorId, createdAt: input.now, updatedAt: input.now })
  await input.executor
    .insert(investigatorFinance)
    .values({ investigatorId, createdAt: input.now, updatedAt: input.now })

  return { investigatorId, lineageId }
}

/**
 * Saves the identity section.
 *
 * Every write goes through the version claim, so a Keeper tidying a sheet while
 * its owner edits it on their phone cannot silently discard the other's change.
 * The caller reports the conflict; this only says whether it happened.
 */
export async function saveProfile(input: {
  investigatorId: string
  expectedVersion: number
  /** Identity only. The occupation is written by its own section. */
  values: {
    name: string | null
    age: number | null
    sex: string | null
    residence: string | null
    birthplace: string | null
    species: string
  }
  now: Date
  executor: DbOrTx
}): Promise<boolean> {
  const claimed = await claimVersion({
    investigatorId: input.investigatorId,
    expectedVersion: input.expectedVersion,
    now: input.now,
    executor: input.executor,
  })
  if (!claimed) return false

  await input.executor
    .update(investigatorProfile)
    .set({ ...input.values, updatedAt: input.now })
    .where(eq(investigatorProfile.investigatorId, input.investigatorId))

  return true
}

/**
 * Saves the eight characteristics, starting Luck, and where the numbers came
 * from.
 *
 * The roll record travels with the values so a sheet can always answer "was this
 * rolled or decided". It is stored as given rather than recomputed: the point of
 * recording physical dice is that the application did not produce them.
 */
export async function saveCharacteristics(input: {
  investigatorId: string
  expectedVersion: number
  values: {
    strength: number | null
    constitution: number | null
    size: number | null
    dexterity: number | null
    appearance: number | null
    intelligence: number | null
    power: number | null
    education: number | null
    startingLuck: number | null
  }
  rollRecord: unknown
  now: Date
  executor: DbOrTx
}): Promise<boolean> {
  const claimed = await claimVersion({
    investigatorId: input.investigatorId,
    expectedVersion: input.expectedVersion,
    now: input.now,
    executor: input.executor,
  })
  if (!claimed) return false

  await input.executor
    .update(investigatorCharacteristic)
    .set({ ...input.values, rollRecord: input.rollRecord, updatedAt: input.now })
    .where(eq(investigatorCharacteristic.investigatorId, input.investigatorId))

  return true
}

/** Sets a character's status, which is how a draft becomes playable. */
export async function setInvestigatorStatus(input: {
  investigatorId: string
  expectedVersion: number
  status: InvestigatorStatus
  now: Date
  executor: DbOrTx
}): Promise<boolean> {
  const claimed = await claimVersion({
    investigatorId: input.investigatorId,
    expectedVersion: input.expectedVersion,
    now: input.now,
    executor: input.executor,
  })
  if (!claimed) return false

  await input.executor
    .update(investigator)
    .set({ status: input.status, updatedAt: input.now })
    .where(eq(investigator.id, input.investigatorId))

  return true
}

/** Seeds the resources a finished character starts play with. */
export async function seedStartingResources(input: {
  investigatorId: string
  values: { hitPoints: number; sanity: number; magicPoints: number; luck: number }
  now: Date
  executor: DbOrTx
}): Promise<void> {
  await input.executor
    .update(investigatorState)
    .set({
      hitPoints: input.values.hitPoints,
      sanity: input.values.sanity,
      magicPoints: input.values.magicPoints,
      luck: input.values.luck,
      updatedAt: input.now,
    })
    .where(eq(investigatorState.investigatorId, input.investigatorId))
}

/**
 * Saves the money a character carries.
 *
 * Credit Rating is not written here: it is a skill, and the figures below are
 * read out of it. What is stored is what play changes - cash spent, assets sold
 * - which is why these drift away from the starting values and should.
 */
export async function saveFinances(input: {
  investigatorId: string
  expectedVersion: number
  values: {
    cash: number | null
    assets: number | null
    spendingLevel: number | null
    assetsUnboundedAbove: boolean
    notes: string | null
  }
  now: Date
  executor: DbOrTx
}): Promise<boolean> {
  const claimed = await claimVersion({
    investigatorId: input.investigatorId,
    expectedVersion: input.expectedVersion,
    now: input.now,
    executor: input.executor,
  })
  if (!claimed) return false

  await input.executor
    .update(investigatorFinance)
    .set({ ...input.values, updatedAt: input.now })
    .where(eq(investigatorFinance.investigatorId, input.investigatorId))

  return true
}

/**
 * Replaces the backstory wholesale.
 *
 * The section expresses a complete intent - ten boxes, each either written in or
 * empty - so reconciling entry by entry would be more machinery for the same
 * outcome. Nothing else references these rows.
 */
export async function replaceBackstory(input: {
  investigatorId: string
  expectedVersion: number
  entries: readonly {
    category: string
    content: string
    position: number
    isKeyConnection: boolean
  }[]
  now: Date
  executor: DbOrTx
}): Promise<boolean> {
  const claimed = await claimVersion({
    investigatorId: input.investigatorId,
    expectedVersion: input.expectedVersion,
    now: input.now,
    executor: input.executor,
  })
  if (!claimed) return false

  await input.executor
    .delete(investigatorBackstoryEntry)
    .where(eq(investigatorBackstoryEntry.investigatorId, input.investigatorId))

  for (const entry of input.entries) {
    await input.executor.insert(investigatorBackstoryEntry).values({
      id: newId(),
      investigatorId: input.investigatorId,
      category: entry.category,
      content: entry.content,
      position: entry.position,
      isKeyConnection: entry.isKeyConnection,
      createdAt: input.now,
      updatedAt: input.now,
    })
  }

  return true
}

/**
 * Replaces a character's privacy settings.
 *
 * Stored as exceptions: only the hidden fields get a row, because everything is
 * public by default and a table with an entry per field per character would be
 * mostly the word PUBLIC.
 *
 * No version claim. Privacy is not part of the sheet's content and two people
 * cannot both be setting it - only the owner and a creating Keeper may, and a
 * conflict between them would be over which of two complete intents wins, which
 * is what "last one saved" means here.
 */
export async function replaceFieldVisibility(input: {
  investigatorId: string
  hidden: readonly string[]
  updatedBy: string
  now: Date
  executor: DbOrTx
}): Promise<void> {
  await input.executor
    .delete(investigatorFieldVisibility)
    .where(eq(investigatorFieldVisibility.investigatorId, input.investigatorId))

  for (const fieldKey of input.hidden) {
    await input.executor.insert(investigatorFieldVisibility).values({
      id: newId(),
      investigatorId: input.investigatorId,
      fieldKey,
      visibility: 'HIDDEN',
      updatedBy: input.updatedBy,
      createdAt: input.now,
      updatedAt: input.now,
    })
  }
}

/**
 * Replaces the character's possessions.
 *
 * Wholesale, like the backstory and for the same reason: the section is a list
 * somebody edits as a whole, and reconciling row by row would be machinery in
 * service of an identity nothing else references.
 */
export async function replacePossessions(input: {
  investigatorId: string
  expectedVersion: number
  entries: readonly {
    name: string
    description: string | null
    quantity: number
    value: number | null
    isTreasured: boolean
  }[]
  now: Date
  executor: DbOrTx
}): Promise<boolean> {
  const claimed = await claimVersion({
    investigatorId: input.investigatorId,
    expectedVersion: input.expectedVersion,
    now: input.now,
    executor: input.executor,
  })
  if (!claimed) return false

  await input.executor
    .delete(investigatorPossession)
    .where(eq(investigatorPossession.investigatorId, input.investigatorId))

  for (const [position, entry] of input.entries.entries()) {
    await input.executor.insert(investigatorPossession).values({
      id: newId(),
      investigatorId: input.investigatorId,
      name: entry.name,
      description: entry.description,
      quantity: entry.quantity,
      value: entry.value,
      isTreasured: entry.isTreasured,
      position,
      createdAt: input.now,
      updatedAt: input.now,
    })
  }

  return true
}

/** Replaces the weapons, on the same terms as the possessions. */
export async function replaceWeapons(input: {
  investigatorId: string
  expectedVersion: number
  entries: readonly {
    name: string
    skillKey: string
    damage: string
    range: string | null
    attacks: string | null
    ammunition: number | null
    malfunction: number | null
    notes: string | null
  }[]
  now: Date
  executor: DbOrTx
}): Promise<boolean> {
  const claimed = await claimVersion({
    investigatorId: input.investigatorId,
    expectedVersion: input.expectedVersion,
    now: input.now,
    executor: input.executor,
  })
  if (!claimed) return false

  await input.executor
    .delete(investigatorWeapon)
    .where(eq(investigatorWeapon.investigatorId, input.investigatorId))

  for (const [position, entry] of input.entries.entries()) {
    await input.executor.insert(investigatorWeapon).values({
      id: newId(),
      investigatorId: input.investigatorId,
      name: entry.name,
      skillKey: entry.skillKey,
      damage: entry.damage,
      range: entry.range,
      attacks: entry.attacks,
      ammunition: entry.ammunition,
      malfunction: entry.malfunction,
      notes: entry.notes,
      position,
      createdAt: input.now,
      updatedAt: input.now,
    })
  }

  return true
}

/** Puts a character away, or brings it back out. */
export async function setArchived(input: {
  investigatorId: string
  archivedAt: Date | null
  now: Date
  executor: DbOrTx
}): Promise<void> {
  await input.executor
    .update(investigator)
    .set({ archivedAt: input.archivedAt, updatedAt: input.now })
    .where(eq(investigator.id, input.investigatorId))
}

/**
 * What stops a character being deleted outright.
 *
 * Deletion is only ever allowed for a draft nobody has seen, so the question is
 * whether anybody has: a campaign it was linked to, a session it was played in,
 * a snapshot, or a disclosure. Each of those is somebody else's record, and
 * deleting the character would take it from them.
 */
export async function countDeletionBlockers(
  investigatorId: string,
  executor: DbOrTx = db,
): Promise<{ campaigns: number; assignments: number; snapshots: number; disclosures: number }> {
  const [campaigns, assignments, snapshots, disclosures] = await Promise.all([
    executor
      .select({ total: count() })
      .from(campaignInvestigator)
      .where(eq(campaignInvestigator.investigatorId, investigatorId))
      .then((rows) => Number(rows[0]?.total ?? 0)),
    executor
      .select({ total: count() })
      .from(sessionInvestigatorAssignment)
      .where(eq(sessionInvestigatorAssignment.investigatorId, investigatorId))
      .then((rows) => Number(rows[0]?.total ?? 0)),
    executor
      .select({ total: count() })
      .from(investigatorSnapshot)
      .where(eq(investigatorSnapshot.investigatorId, investigatorId))
      .then((rows) => Number(rows[0]?.total ?? 0)),
    executor
      .select({ total: count() })
      .from(investigatorDisclosureSnapshot)
      .where(eq(investigatorDisclosureSnapshot.investigatorId, investigatorId))
      .then((rows) => Number(rows[0]?.total ?? 0)),
  ])

  return { campaigns, assignments, snapshots, disclosures }
}

/**
 * Removes a draft nobody has seen.
 *
 * The satellite rows cascade; the lineage is left behind deliberately. It costs
 * one row and it is the only thing that would say a character had ever been
 * started, which is occasionally the question somebody is asking.
 */
export async function deleteInvestigator(input: {
  investigatorId: string
  executor: DbOrTx
}): Promise<void> {
  await input.executor.delete(investigator).where(eq(investigator.id, input.investigatorId))
}
