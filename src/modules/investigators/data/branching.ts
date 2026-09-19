import 'server-only'
import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  investigator,
  investigatorBackstoryEntry,
  investigatorCharacteristic,
  investigatorFieldVisibility,
  investigatorFinance,
  investigatorPossession,
  investigatorProfile,
  investigatorSkill,
  investigatorState,
  investigatorWeapon,
} from '@/db/schema'
import { NotFoundError } from '@/lib/errors'
import { newId } from '@/lib/ids'

/**
 * Copying a character into a new branch of its own lineage.
 *
 * Used by transfers, and later by duplication. The copy is a real character
 * with its own identifier and its own future, sharing only the lineage that
 * says where it came from - which is what lets the previous owner keep the
 * version they played while the new owner carries on from it.
 *
 * What is not copied is as deliberate as what is. History belongs to the branch
 * that lived it: snapshots, disclosures, resource events and grants all stay
 * with the original, because a new owner inheriting somebody else's record of
 * who saw what would hand them an audience they never had.
 *
 * Privacy settings *are* copied. They describe the character rather than the
 * owner, and starting a continuation wide open would publish everything its
 * previous owner had chosen to keep back.
 */
export async function branchInvestigator(input: {
  sourceInvestigatorId: string
  newOwnerId: string
  createdBy: string
  now: Date
  executor: DbOrTx
}): Promise<string> {
  const source = await input.executor
    .select()
    .from(investigator)
    .where(eq(investigator.id, input.sourceInvestigatorId))
    .limit(1)
    .then((rows) => rows[0])

  if (!source) throw new NotFoundError()

  const branchId = newId()

  await input.executor.insert(investigator).values({
    id: branchId,
    lineageId: source.lineageId,
    branchedFromId: source.id,
    ownerId: input.newOwnerId,
    creatorId: source.creatorId,
    creatorCampaignId: source.creatorCampaignId,
    status: source.status,
    creationMethod: source.creationMethod,
    rulesetId: source.rulesetId,
    rulesetVersion: source.rulesetVersion,
    era: source.era,
    /*
     * First use carries over. The character has been played; that it changed
     * hands afterwards does not reopen a creating Keeper's right to edit it.
     */
    firstUsedAt: source.firstUsedAt,
    lockVersion: 0,
    createdAt: input.now,
    updatedAt: input.now,
  })

  await copySingleton(investigatorProfile, input, branchId)
  await copySingleton(investigatorCharacteristic, input, branchId)
  await copySingleton(investigatorState, input, branchId)
  await copySingleton(investigatorFinance, input, branchId)

  await copyRows(investigatorSkill, input, branchId)
  await copyRows(investigatorBackstoryEntry, input, branchId)
  await copyRows(investigatorWeapon, input, branchId)
  await copyRows(investigatorPossession, input, branchId)
  await copyRows(investigatorFieldVisibility, input, branchId)

  return branchId
}

type Copyable = typeof investigatorProfile | typeof investigatorCharacteristic

/**
 * The one-per-character tables, keyed by the character itself.
 *
 * They have no identifier of their own, so the copy is the row with its key
 * swapped - which is also why they cannot share the helper below.
 */
async function copySingleton(
  table: Copyable | typeof investigatorState | typeof investigatorFinance,
  input: { sourceInvestigatorId: string; now: Date; executor: DbOrTx },
  branchId: string,
): Promise<void> {
  const row = await input.executor
    .select()
    .from(table)
    .where(eq(table.investigatorId, input.sourceInvestigatorId))
    .limit(1)
    .then((rows) => rows[0])

  if (!row) return

  await input.executor.insert(table).values({
    ...row,
    investigatorId: branchId,
    createdAt: input.now,
    updatedAt: input.now,
  })
}

/** The many-per-character tables, each row getting a fresh identifier. */
async function copyRows(
  table:
    | typeof investigatorSkill
    | typeof investigatorBackstoryEntry
    | typeof investigatorWeapon
    | typeof investigatorPossession
    | typeof investigatorFieldVisibility,
  input: { sourceInvestigatorId: string; now: Date; executor: DbOrTx },
  branchId: string,
): Promise<void> {
  const rows = await input.executor
    .select()
    .from(table)
    .where(eq(table.investigatorId, input.sourceInvestigatorId))

  for (const row of rows) {
    await input.executor.insert(table).values({
      ...row,
      id: newId(),
      investigatorId: branchId,
      createdAt: input.now,
      updatedAt: input.now,
    })
  }
}
