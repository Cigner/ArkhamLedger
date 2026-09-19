import { type Result, collectErrors, fail, ok } from '@/lib/result'
import type { DomainError } from '@/lib/result'
import { MAXIMUM_INVESTIGATOR_AGE, MINIMUM_INVESTIGATOR_AGE } from './constants'
import { ageAdjustmentFor } from './age'
import type { CharacteristicKey } from './types'

/**
 * Validation while a character is being written.
 *
 * Two kinds of answer, and keeping them apart is the whole point. A blocking
 * error means the sheet cannot be played - a characteristic outside what the
 * dice can produce is not a character. A warning means it can be played but
 * something was probably not finished, like points left unspent.
 *
 * Nothing here refuses to save. A half-written sheet is the normal state of a
 * character being made, and a creator that rejects incomplete work forces people
 * to keep it somewhere else until it is perfect.
 */
export const CHARACTERISTIC_KEYS: readonly CharacteristicKey[] = [
  'STR',
  'CON',
  'SIZ',
  'DEX',
  'APP',
  'INT',
  'POW',
  'EDU',
]

/** What the dice can produce: 3D6×5 spans 15-90, 2D6+6×5 spans 40-90. */
const CHARACTERISTIC_MINIMUM = 1
const CHARACTERISTIC_MAXIMUM = 99

export type CharacteristicDraft = Partial<Record<CharacteristicKey, number | null>>

export type CreationDraft = {
  readonly name: string | null
  readonly age: number | null
  readonly characteristics: CharacteristicDraft
  readonly startingLuck: number | null
  readonly occupationId: string | null
}

export type DraftReview = {
  readonly errors: readonly DomainError[]
  readonly warnings: readonly DomainError[]
  readonly complete: boolean
}

export function validateCharacteristic(key: CharacteristicKey, value: number): Result<void> {
  if (
    !Number.isInteger(value) ||
    value < CHARACTERISTIC_MINIMUM ||
    value > CHARACTERISTIC_MAXIMUM
  ) {
    return fail('investigators.errors.characteristicOutOfRange', {
      characteristic: key,
      minimum: CHARACTERISTIC_MINIMUM,
      maximum: CHARACTERISTIC_MAXIMUM,
    })
  }
  return ok()
}

export function validateAge(age: number): Result<void> {
  if (!Number.isInteger(age) || age < MINIMUM_INVESTIGATOR_AGE || age > MAXIMUM_INVESTIGATOR_AGE) {
    return fail('investigators.errors.ageOutOfRange', {
      minimum: MINIMUM_INVESTIGATOR_AGE,
      maximum: MAXIMUM_INVESTIGATOR_AGE,
    })
  }
  return ageAdjustmentFor(age).ok ? ok() : fail('investigators.errors.ageOutOfRange')
}

/**
 * Whether a draft is finished enough to become a character.
 *
 * Read continuously while the sheet is open rather than only at the end, because
 * "what is still missing" is the question somebody filling in a long form
 * actually has, and answering it at the bottom of the page is answering it too
 * late.
 */
export function reviewDraft(draft: CreationDraft): DraftReview {
  const errors: Result<unknown>[] = []
  const warnings: DomainError[] = []

  if (draft.name === null || draft.name.trim().length === 0) {
    errors.push(fail('investigators.errors.nameRequired'))
  }

  if (draft.age === null) {
    errors.push(fail('investigators.errors.ageRequired'))
  } else {
    errors.push(validateAge(draft.age))
  }

  for (const key of CHARACTERISTIC_KEYS) {
    const value = draft.characteristics[key]
    if (value === null || value === undefined) {
      errors.push(fail('investigators.errors.characteristicRequired', { characteristic: key }))
      continue
    }
    errors.push(validateCharacteristic(key, value))
  }

  if (draft.startingLuck === null) {
    errors.push(fail('investigators.errors.luckRequired'))
  } else if (!Number.isInteger(draft.startingLuck) || draft.startingLuck < 0) {
    errors.push(fail('investigators.errors.luckOutOfRange'))
  }

  if (draft.occupationId === null) {
    errors.push(fail('investigators.errors.occupationRequired'))
  }

  const blocking = collectErrors(errors)

  return {
    errors: blocking,
    warnings,
    complete: blocking.length === 0,
  }
}

/**
 * What the character's age costs and grants.
 *
 * Returned as guidance rather than applied automatically. The rules let the
 * player choose which physical characteristics take the reduction, and a creator
 * that decided for them would be making a character they did not write.
 */
export function ageGuidance(age: number) {
  const adjustment = ageAdjustmentFor(age)
  return adjustment.ok ? adjustment.value : null
}
