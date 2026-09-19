import { describe, expect, it } from 'vitest'
import {
  type CreationDraft,
  CHARACTERISTIC_KEYS,
  ageGuidance,
  reviewDraft,
  validateAge,
  validateCharacteristic,
} from '@/modules/investigators/domain/creation'

/**
 * Creation-time validation.
 *
 * The review is read continuously while somebody writes a character, so its job
 * is to be exhaustive rather than to stop at the first problem: a list that
 * reveals one missing field at a time turns a long sheet into a guessing game.
 */
function complete(overrides: Partial<CreationDraft> = {}): CreationDraft {
  return {
    name: 'Harriet Vane',
    age: 34,
    characteristics: {
      STR: 50,
      CON: 60,
      SIZ: 55,
      DEX: 65,
      APP: 70,
      INT: 80,
      POW: 75,
      EDU: 85,
    },
    startingLuck: 55,
    occupationId: 'author',
    ...overrides,
  }
}

describe('validateCharacteristic', () => {
  it('accepts the span the dice can produce', () => {
    expect(validateCharacteristic('STR', 15).ok).toBe(true)
    expect(validateCharacteristic('STR', 90).ok).toBe(true)
  })

  it('refuses zero, negatives and values past the scale', () => {
    expect(validateCharacteristic('STR', 0).ok).toBe(false)
    expect(validateCharacteristic('STR', -5).ok).toBe(false)
    expect(validateCharacteristic('STR', 100).ok).toBe(false)
  })

  it('refuses a fraction', () => {
    expect(validateCharacteristic('STR', 50.5).ok).toBe(false)
  })

  it('names the characteristic it refused', () => {
    const result = validateCharacteristic('POW', 0)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.params?.['characteristic']).toBe('POW')
  })
})

describe('validateAge', () => {
  it('accepts the ends of the range', () => {
    expect(validateAge(15).ok).toBe(true)
    expect(validateAge(90).ok).toBe(true)
  })

  it('refuses either side of it', () => {
    expect(validateAge(14).ok).toBe(false)
    expect(validateAge(91).ok).toBe(false)
  })
})

describe('reviewDraft', () => {
  it('passes a finished character', () => {
    const review = reviewDraft(complete())

    expect(review.errors).toEqual([])
    expect(review.complete).toBe(true)
  })

  /*
   * All of them at once. Somebody who has filled in nothing should be told what
   * the sheet needs, not handed one requirement per attempt.
   */
  it('reports every missing thing together', () => {
    const review = reviewDraft({
      name: null,
      age: null,
      characteristics: {},
      startingLuck: null,
      occupationId: null,
    })

    const keys = review.errors.map((error) => error.key)
    expect(keys).toContain('investigators.errors.nameRequired')
    expect(keys).toContain('investigators.errors.ageRequired')
    expect(keys).toContain('investigators.errors.luckRequired')
    expect(keys).toContain('investigators.errors.occupationRequired')
    expect(
      keys.filter((key) => key === 'investigators.errors.characteristicRequired'),
    ).toHaveLength(CHARACTERISTIC_KEYS.length)
    expect(review.complete).toBe(false)
  })

  it('treats a blank name as no name', () => {
    expect(reviewDraft(complete({ name: '   ' })).complete).toBe(false)
  })

  it('catches a characteristic that was filled in wrongly', () => {
    const review = reviewDraft(
      complete({ characteristics: { ...complete().characteristics, POW: 0 } }),
    )

    expect(review.complete).toBe(false)
    expect(review.errors.map((error) => error.key)).toContain(
      'investigators.errors.characteristicOutOfRange',
    )
  })

  it('needs an occupation, because the skill budget comes from it', () => {
    expect(reviewDraft(complete({ occupationId: null })).complete).toBe(false)
  })
})

describe('ageGuidance', () => {
  /*
   * Guidance, not an adjustment. The rules let the player choose which physical
   * characteristics take the reduction, and deciding for them would be writing
   * somebody else's character.
   */
  it('describes what an age costs without applying it', () => {
    const guidance = ageGuidance(75)

    expect(guidance).not.toBeNull()
    expect(guidance?.physicalReduction.total).toBeGreaterThan(0)
    expect(guidance?.physicalReduction.eligible.length).toBeGreaterThan(1)
  })

  it('is nothing at all for an age outside the rules', () => {
    expect(ageGuidance(12)).toBeNull()
  })
})
