import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  investigator,
  investigatorCharacteristic,
  investigatorLineage,
  investigatorProfile,
  investigatorState,
} from '@/db/schema'
import { newId } from '@/lib/ids'
import {
  applyResourceChange,
  findReversibleEvent,
  listResourceEvents,
  sanityLostSince,
} from '@/modules/investigators/data/resources'
import { loadSheet } from '@/modules/investigators/data/sheet'
import { createUserRow, truncateAll } from './helpers/fixtures'

/**
 * The resource journal.
 *
 * Every change is an event and the state moves with it, in one transaction.
 * What is checked here is that the two never come apart, and that undoing reads
 * the journal rather than trusting a number somebody passed in.
 */
const NOW = new Date('2026-09-14T20:00:00.000Z')

async function createPlayable(ownerId: string) {
  const lineageId = newId()
  const investigatorId = newId()

  await db.insert(investigatorLineage).values({ id: lineageId, createdBy: ownerId, createdAt: NOW })
  await db.insert(investigator).values({
    id: investigatorId,
    lineageId,
    ownerId,
    creatorId: ownerId,
    status: 'ACTIVE',
    creationMethod: 'STANDARD_ROLLS',
    rulesetId: 'coc7-classic-1920s',
    rulesetVersion: '1.0.0',
    era: 'CLASSIC_1920S',
    createdAt: NOW,
    updatedAt: NOW,
  })
  await db.insert(investigatorProfile).values({ investigatorId, createdAt: NOW, updatedAt: NOW })
  await db.insert(investigatorCharacteristic).values({
    investigatorId,
    constitution: 60,
    size: 55,
    power: 75,
    createdAt: NOW,
    updatedAt: NOW,
  })
  await db.insert(investigatorState).values({
    investigatorId,
    hitPoints: 11,
    sanity: 75,
    magicPoints: 15,
    luck: 55,
    createdAt: NOW,
    updatedAt: NOW,
  })

  return investigatorId
}

beforeEach(async () => {
  await truncateAll()
})

describe('applyResourceChange', () => {
  it('moves the value and records why in one go', async () => {
    const owner = await createUserRow({ status: 'ACTIVE', name: 'Keeper' })
    const investigatorId = await createPlayable(owner.id)

    await db.transaction((tx) =>
      applyResourceChange({
        investigatorId,
        resource: 'HP',
        previousValue: 11,
        currentValue: 3,
        conditions: {
          majorWound: true,
          temporaryInsanity: false,
          indefiniteInsanity: false,
          unconscious: false,
          dying: false,
        },
        actorId: owner.id,
        reason: 'Shot on the stairs',
        now: NOW,
        executor: tx,
      }),
    )

    const sheet = await loadSheet(investigatorId)
    expect(sheet.hitPoints.current).toBe(3)
    expect(sheet.conditions.majorWound).toBe(true)

    const [event] = await listResourceEvents(investigatorId)
    expect(event?.delta).toBe(-8)
    expect(event?.reason).toBe('Shot on the stairs')
    expect(event?.actorName).toBe('Keeper')
  })
})

describe('reversal', () => {
  it('offers the most recent change', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createPlayable(owner.id)

    await db.transaction((tx) =>
      applyResourceChange({
        investigatorId,
        resource: 'MP',
        previousValue: 15,
        currentValue: 12,
        actorId: owner.id,
        reason: null,
        now: NOW,
        executor: tx,
      }),
    )
    await db.transaction((tx) =>
      applyResourceChange({
        investigatorId,
        resource: 'HP',
        previousValue: 11,
        currentValue: 8,
        actorId: owner.id,
        reason: null,
        now: new Date(NOW.getTime() + 1000),
        executor: tx,
      }),
    )

    const reversible = await findReversibleEvent({ investigatorId })
    expect(reversible?.resource).toBe('HP')
    expect(reversible?.previousValue).toBe(11)
  })

  /*
   * Undoing is itself an event. Offering the same change twice would let one
   * mistake be undone repeatedly, walking the value backwards.
   */
  it('does not offer a change that has already been undone', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createPlayable(owner.id)

    const eventId = await db.transaction((tx) =>
      applyResourceChange({
        investigatorId,
        resource: 'HP',
        previousValue: 11,
        currentValue: 8,
        actorId: owner.id,
        reason: null,
        now: NOW,
        executor: tx,
      }),
    )

    await db.transaction((tx) =>
      applyResourceChange({
        investigatorId,
        resource: 'HP',
        previousValue: 8,
        currentValue: 11,
        actorId: owner.id,
        reason: null,
        reversesEventId: eventId,
        now: new Date(NOW.getTime() + 1000),
        executor: tx,
      }),
    )

    expect(await findReversibleEvent({ investigatorId })).toBeNull()
  })
})

describe('sanityLostSince', () => {
  it('adds up the day’s losses and remembers where it started', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createPlayable(owner.id)
    const midnight = new Date('2026-09-14T00:00:00.000Z')

    await db.transaction((tx) =>
      applyResourceChange({
        investigatorId,
        resource: 'SAN',
        previousValue: 75,
        currentValue: 70,
        actorId: owner.id,
        reason: null,
        now: NOW,
        executor: tx,
      }),
    )
    await db.transaction((tx) =>
      applyResourceChange({
        investigatorId,
        resource: 'SAN',
        previousValue: 70,
        currentValue: 66,
        actorId: owner.id,
        reason: null,
        now: new Date(NOW.getTime() + 60_000),
        executor: tx,
      }),
    )

    const today = await sanityLostSince({ investigatorId, since: midnight })
    expect(today.lost).toBe(9)
    expect(today.sanityAtStart).toBe(75)
  })

  /*
   * Recovery is not a loss. Counting it would make a character who rested and
   * then saw something terrible reach the one-fifth threshold early.
   */
  it('counts only what went down', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createPlayable(owner.id)
    const midnight = new Date('2026-09-14T00:00:00.000Z')

    await db.transaction((tx) =>
      applyResourceChange({
        investigatorId,
        resource: 'SAN',
        previousValue: 75,
        currentValue: 70,
        actorId: owner.id,
        reason: null,
        now: NOW,
        executor: tx,
      }),
    )
    await db.transaction((tx) =>
      applyResourceChange({
        investigatorId,
        resource: 'SAN',
        previousValue: 70,
        currentValue: 74,
        actorId: owner.id,
        reason: null,
        now: new Date(NOW.getTime() + 60_000),
        executor: tx,
      }),
    )

    expect((await sanityLostSince({ investigatorId, since: midnight })).lost).toBe(5)
  })

  /*
   * A mistyped loss corrected a moment later did not happen. Counting it would
   * push a character into indefinite insanity over a number nobody at the table
   * ever heard.
   */
  it('forgets a loss that was undone', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createPlayable(owner.id)
    const midnight = new Date('2026-09-14T00:00:00.000Z')

    const mistake = await db.transaction((tx) =>
      applyResourceChange({
        investigatorId,
        resource: 'SAN',
        previousValue: 75,
        currentValue: 55,
        actorId: owner.id,
        reason: null,
        now: NOW,
        executor: tx,
      }),
    )

    await db.transaction((tx) =>
      applyResourceChange({
        investigatorId,
        resource: 'SAN',
        previousValue: 55,
        currentValue: 75,
        actorId: owner.id,
        reason: null,
        reversesEventId: mistake,
        now: new Date(NOW.getTime() + 60_000),
        executor: tx,
      }),
    )

    await db.transaction((tx) =>
      applyResourceChange({
        investigatorId,
        resource: 'SAN',
        previousValue: 75,
        currentValue: 70,
        actorId: owner.id,
        reason: null,
        now: new Date(NOW.getTime() + 120_000),
        executor: tx,
      }),
    )

    expect((await sanityLostSince({ investigatorId, since: midnight })).lost).toBe(5)
  })

  it('ignores yesterday', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createPlayable(owner.id)

    await db.transaction((tx) =>
      applyResourceChange({
        investigatorId,
        resource: 'SAN',
        previousValue: 75,
        currentValue: 60,
        actorId: owner.id,
        reason: null,
        now: new Date('2026-09-13T20:00:00.000Z'),
        executor: tx,
      }),
    )

    const today = await sanityLostSince({
      investigatorId,
      since: new Date('2026-09-14T00:00:00.000Z'),
    })

    expect(today.lost).toBe(0)
    expect(today.sanityAtStart).toBeNull()
  })
})

describe('the state row', () => {
  it('never drifts from the last event', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createPlayable(owner.id)

    const blows = [
      [11, 8],
      [8, 4],
      [4, 0],
    ] as const

    for (const [index, [previous, current]] of blows.entries()) {
      await db.transaction((tx) =>
        applyResourceChange({
          investigatorId,
          resource: 'HP',
          previousValue: previous,
          currentValue: current,
          actorId: owner.id,
          reason: null,
          now: new Date(NOW.getTime() + index * 1000),
          executor: tx,
        }),
      )
    }

    const [row] = await db
      .select()
      .from(investigatorState)
      .where(eq(investigatorState.investigatorId, investigatorId))
    const [latest] = await listResourceEvents(investigatorId, 1)

    expect(row?.hitPoints).toBe(latest?.currentValue)
  })
})

describe('events written in the same instant', () => {
  /*
   * A single action can write two events, and they then share a timestamp to the
   * millisecond. Ordering has to stay deterministic or the undo picks between
   * them at random.
   */
  it('still orders deterministically', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createPlayable(owner.id)

    await db.transaction(async (tx) => {
      await applyResourceChange({
        investigatorId,
        resource: 'HP',
        previousValue: 11,
        currentValue: 8,
        actorId: owner.id,
        reason: 'first',
        now: NOW,
        executor: tx,
      })
      await applyResourceChange({
        investigatorId,
        resource: 'SAN',
        previousValue: 75,
        currentValue: 70,
        actorId: owner.id,
        reason: 'second',
        now: NOW,
        executor: tx,
      })
    })

    const reversible = await findReversibleEvent({ investigatorId })
    expect(reversible?.resource).toBe('SAN')

    const [latest] = await listResourceEvents(investigatorId, 1)
    expect(latest?.reason).toBe('second')
  })
})
