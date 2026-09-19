import 'server-only'
import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  investigatorBackstoryEntry,
  investigatorCharacteristic,
  investigatorPossession,
  investigatorProfile,
  investigatorSkill,
  investigatorState,
  investigatorWeapon,
} from '@/db/schema'
import { newId } from '@/lib/ids'
import { sanitizeOptionalText, sanitizeUserText } from '@/lib/text/sanitize'
import type { InvestigatorImport } from '../domain/import'

/**
 * Writing an imported character onto a freshly created one.
 *
 * Everything user-authored is cleaned on the way in, because a file is a less
 * trustworthy source than a form: nobody typed it into this application, and it
 * may carry whatever an exporter or an editor put there.
 *
 * Nothing earned is carried. Play improvement and development marks start at
 * zero however generous the file was, and the current value is written as the
 * file's value so a character keeps the numbers somebody agreed to - the point
 * of disagreement is the sheet a Keeper reads, not a silent recomputation.
 */
export async function applyImportedSheet(input: {
  investigatorId: string
  sheet: InvestigatorImport['sheet']
  skills: InvestigatorImport['sheet']['skills']
  occupationIsKnown: boolean
  now: Date
  executor: DbOrTx
}): Promise<void> {
  const { sheet } = input

  await input.executor
    .update(investigatorProfile)
    .set({
      age: sheet.identity.age,
      sex: sanitizeOptionalText(sheet.identity.sex, { maxLength: 80 }),
      residence: sanitizeOptionalText(sheet.identity.residence, { maxLength: 200 }),
      birthplace: sanitizeOptionalText(sheet.identity.birthplace, { maxLength: 200 }),
      species: sanitizeUserText(sheet.identity.species, { maxLength: 80 }) || 'Human',
      occupationContact: sanitizeOptionalText(sheet.identity.occupationContact, {
        maxLength: 300,
      }),
      // An occupation this build has never heard of is dropped, not stored.
      occupationId: input.occupationIsKnown ? sheet.identity.occupationId : null,
      updatedAt: input.now,
    })
    .where(eq(investigatorProfile.investigatorId, input.investigatorId))

  await input.executor
    .update(investigatorCharacteristic)
    .set({
      strength: sheet.characteristics.STR,
      constitution: sheet.characteristics.CON,
      size: sheet.characteristics.SIZ,
      dexterity: sheet.characteristics.DEX,
      appearance: sheet.characteristics.APP,
      intelligence: sheet.characteristics.INT,
      power: sheet.characteristics.POW,
      education: sheet.characteristics.EDU,
      startingLuck: sheet.luck.current,
      rollRecord: { source: 'IMPORTED', recordedAt: input.now.toISOString() },
      updatedAt: input.now,
    })
    .where(eq(investigatorCharacteristic.investigatorId, input.investigatorId))

  /*
   * Resources are left unset rather than imported. A character arrives as a
   * draft, and the values it starts play with are seeded from its
   * characteristics when it is finished - importing somebody mid-wound would
   * make a new character begin bleeding for reasons nobody at this table saw.
   */
  await input.executor
    .update(investigatorState)
    .set({ updatedAt: input.now })
    .where(eq(investigatorState.investigatorId, input.investigatorId))

  for (const skill of input.skills) {
    await input.executor.insert(investigatorSkill).values({
      id: newId(),
      investigatorId: input.investigatorId,
      definitionId: skill.definitionId,
      specializationKey: skill.specializationKey,
      familyId: skill.specializationKey === '' ? null : skill.definitionId,
      baseValue: 0,
      occupationPoints: 0,
      personalInterestPoints: 0,
      playImprovement: 0,
      otherAdjustment: 0,
      currentValue: skill.currentValue,
      isOccupationSkill: false,
      createdAt: input.now,
      updatedAt: input.now,
    })
  }

  for (const [position, entry] of sheet.backstory.entries()) {
    const content = sanitizeUserText(entry.content, { maxLength: 4000, allowLineBreaks: true })
    if (content.length === 0) continue

    await input.executor.insert(investigatorBackstoryEntry).values({
      id: newId(),
      investigatorId: input.investigatorId,
      category: entry.category,
      content,
      position,
      isKeyConnection: entry.isKeyConnection,
      createdAt: input.now,
      updatedAt: input.now,
    })
  }

  for (const [position, item] of sheet.possessions.entries()) {
    const name = sanitizeUserText(item.name, { maxLength: 200 })
    if (name.length === 0) continue

    await input.executor.insert(investigatorPossession).values({
      id: newId(),
      investigatorId: input.investigatorId,
      name,
      description: sanitizeOptionalText(item.description, {
        maxLength: 1000,
        allowLineBreaks: true,
      }),
      quantity: item.quantity,
      value: item.value,
      isTreasured: item.isTreasured,
      position,
      createdAt: input.now,
      updatedAt: input.now,
    })
  }

  for (const [position, weapon] of sheet.weapons.entries()) {
    const name = sanitizeUserText(weapon.name, { maxLength: 160 })
    const damage = sanitizeUserText(weapon.damage, { maxLength: 80 })
    if (name.length === 0 || damage.length === 0) continue

    await input.executor.insert(investigatorWeapon).values({
      id: newId(),
      investigatorId: input.investigatorId,
      name,
      skillKey: sanitizeUserText(weapon.skillKey, { maxLength: 160 }),
      damage,
      range: sanitizeOptionalText(weapon.range, { maxLength: 80 }),
      attacks: sanitizeOptionalText(weapon.attacks, { maxLength: 80 }),
      ammunition: weapon.ammunition,
      malfunction: weapon.malfunction,
      position,
      createdAt: input.now,
      updatedAt: input.now,
    })
  }
}
