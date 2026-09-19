import { describe, expect, it } from 'vitest'
import {
  type Conditions,
  NO_CONDITIONS,
  adjustResource,
  applyDamage,
  applySanityLoss,
} from '@/modules/investigators/domain/resources'

/**
 * Wounds and Sanity.
 *
 * The thresholds are from the Keeper Rulebook - wounds on page 131, Sanity on
 * pages 172 and 173 - and the worked example in the book is used as a test,
 * because a rules engine that disagrees with the printed example is wrong no
 * matter how reasonable it looks.
 */
function conditions(overrides: Partial<Conditions> = {}): Conditions {
  return { ...NO_CONDITIONS, ...overrides }
}

describe('applyDamage', () => {
  /*
   * Harvey has 15 hit points, so 8 or more is a major wound. He takes 3 and then
   * 8: the first is ordinary, the second floors him. Keeper Rulebook, page 131.
   */
  it('matches the worked example in the rulebook', () => {
    const first = applyDamage({
      damage: 3,
      hitPoints: 15,
      maximumHitPoints: 15,
      conditions: conditions(),
      status: 'ACTIVE',
    })

    expect(first.hitPoints).toBe(12)
    expect(first.majorWoundInflicted).toBe(false)

    const second = applyDamage({
      damage: 8,
      hitPoints: 12,
      maximumHitPoints: 15,
      conditions: first.conditions,
      status: 'ACTIVE',
    })

    expect(second.hitPoints).toBe(4)
    expect(second.majorWoundInflicted).toBe(true)
    expect(second.conditions.majorWound).toBe(true)
    expect(second.constitutionRollRequired).toBe(true)
    expect(second.conditions.dying).toBe(false)
  })

  it('treats exactly half the maximum as a major wound', () => {
    const outcome = applyDamage({
      damage: 5,
      hitPoints: 10,
      maximumHitPoints: 10,
      conditions: conditions(),
      status: 'ACTIVE',
    })

    expect(outcome.majorWoundInflicted).toBe(true)
  })

  it('rounds the threshold up on an odd maximum', () => {
    const under = applyDamage({
      damage: 7,
      hitPoints: 13,
      maximumHitPoints: 13,
      conditions: conditions(),
      status: 'ACTIVE',
    })
    const over = applyDamage({
      damage: 6,
      hitPoints: 13,
      maximumHitPoints: 13,
      conditions: conditions(),
      status: 'ACTIVE',
    })

    expect(under.majorWoundInflicted).toBe(true)
    expect(over.majorWoundInflicted).toBe(false)
  })

  /*
   * Two blows of four are not one blow of eight. This is the distinction the
   * whole rule exists to make, and the one a running total would lose.
   */
  it('does not accumulate small hits into a major wound', () => {
    let state = { hitPoints: 15, conditions: conditions() }

    for (let blow = 0; blow < 3; blow += 1) {
      const outcome = applyDamage({
        damage: 4,
        hitPoints: state.hitPoints,
        maximumHitPoints: 15,
        conditions: state.conditions,
        status: 'ACTIVE',
      })
      state = { hitPoints: outcome.hitPoints, conditions: outcome.conditions }
    }

    expect(state.hitPoints).toBe(3)
    expect(state.conditions.majorWound).toBe(false)
  })

  it('never goes below zero', () => {
    const outcome = applyDamage({
      damage: 40,
      hitPoints: 4,
      maximumHitPoints: 15,
      conditions: conditions(),
      status: 'ACTIVE',
    })

    expect(outcome.hitPoints).toBe(0)
  })

  it('knocks out a character whose hit points reach zero', () => {
    const outcome = applyDamage({
      damage: 4,
      hitPoints: 4,
      maximumHitPoints: 15,
      conditions: conditions(),
      status: 'ACTIVE',
    })

    expect(outcome.conditions.unconscious).toBe(true)
    // Only normal damage: they will come round.
    expect(outcome.conditions.dying).toBe(false)
  })

  it('leaves a wounded character dying at zero', () => {
    const outcome = applyDamage({
      damage: 4,
      hitPoints: 4,
      maximumHitPoints: 15,
      conditions: conditions({ majorWound: true }),
      status: 'ACTIVE',
    })

    expect(outcome.conditions.dying).toBe(true)
  })

  /*
   * More than the maximum in one blow. No roll, no First Aid, no argument.
   */
  it('kills outright when a single blow exceeds the maximum', () => {
    const outcome = applyDamage({
      damage: 16,
      hitPoints: 15,
      maximumHitPoints: 15,
      conditions: conditions(),
      status: 'ACTIVE',
    })

    expect(outcome.killedOutright).toBe(true)
    expect(outcome.constitutionRollRequired).toBe(false)
    expect(outcome.conditions.dying).toBe(true)
  })

  it('ignores a negative or fractional figure', () => {
    expect(
      applyDamage({
        damage: -5,
        hitPoints: 10,
        maximumHitPoints: 15,
        conditions: conditions(),
        status: 'ACTIVE',
      }).hitPoints,
    ).toBe(10)
  })
})

describe('applySanityLoss', () => {
  it('calls for an Intelligence roll at five points from one roll', () => {
    const four = applySanityLoss({
      loss: 4,
      sanity: 60,
      conditions: conditions(),
      sanityAtStartOfDay: 60,
      lostToday: 0,
    })
    const five = applySanityLoss({
      loss: 5,
      sanity: 60,
      conditions: conditions(),
      sanityAtStartOfDay: 60,
      lostToday: 0,
    })

    expect(four.intelligenceRollRequired).toBe(false)
    expect(five.intelligenceRollRequired).toBe(true)
  })

  /*
   * A fifth of the Sanity the day started with, however it accumulated. The
   * running total is what matters here, unlike wounds.
   */
  it('reaches indefinite insanity at a fifth of the day’s Sanity', () => {
    const outcome = applySanityLoss({
      loss: 4,
      sanity: 52,
      conditions: conditions(),
      sanityAtStartOfDay: 60,
      lostToday: 8,
    })

    expect(outcome.indefiniteInsanityThresholdReached).toBe(true)
    expect(outcome.conditions.indefiniteInsanity).toBe(true)
  })

  it('does not reach it one point short', () => {
    const outcome = applySanityLoss({
      loss: 3,
      sanity: 52,
      conditions: conditions(),
      sanityAtStartOfDay: 60,
      lostToday: 8,
    })

    expect(outcome.indefiniteInsanityThresholdReached).toBe(false)
  })

  it('is permanent madness at zero', () => {
    const outcome = applySanityLoss({
      loss: 10,
      sanity: 6,
      conditions: conditions(),
      sanityAtStartOfDay: 40,
      lostToday: 0,
    })

    expect(outcome.sanity).toBe(0)
    expect(outcome.permanentlyInsane).toBe(true)
  })

  it('never unsets a condition the character already had', () => {
    const outcome = applySanityLoss({
      loss: 1,
      sanity: 40,
      conditions: conditions({ indefiniteInsanity: true }),
      sanityAtStartOfDay: 60,
      lostToday: 0,
    })

    expect(outcome.conditions.indefiniteInsanity).toBe(true)
  })
})

describe('adjustResource', () => {
  it('moves up and down', () => {
    expect(adjustResource({ current: 10, delta: 3, maximum: 15 })).toBe(13)
    expect(adjustResource({ current: 10, delta: -3, maximum: 15 })).toBe(7)
  })

  it('stops at the maximum and at zero', () => {
    expect(adjustResource({ current: 14, delta: 5, maximum: 15 })).toBe(15)
    expect(adjustResource({ current: 2, delta: -9, maximum: 15 })).toBe(0)
  })

  it('has no ceiling when there is no maximum', () => {
    expect(adjustResource({ current: 90, delta: 20, maximum: null })).toBe(110)
  })
})
