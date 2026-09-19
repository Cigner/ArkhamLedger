import { describe, expect, it } from 'vitest'
import { evaluateCreationRoll } from '@/modules/investigators/domain/rolls'

/**
 * Characteristic roll formulas.
 *
 * Randomness is outside the domain. The engine receives recorded dice and
 * validates them before applying the formula, which makes manual and generated
 * rolls follow the same rules and preserves their provenance.
 */
describe('evaluateCreationRoll', () => {
  it('evaluates three six-sided dice multiplied by five', () => {
    expect(evaluateCreationRoll('THREE_D6_TIMES_FIVE', [3, 4, 4])).toEqual({
      ok: true,
      value: 55,
    })
  })

  it('evaluates two six-sided dice plus six, multiplied by five', () => {
    expect(evaluateCreationRoll('TWO_D6_PLUS_SIX_TIMES_FIVE', [3, 4])).toEqual({
      ok: true,
      value: 65,
    })
  })

  it('rejects the wrong number of dice', () => {
    expect(evaluateCreationRoll('THREE_D6_TIMES_FIVE', [3, 4])).toEqual({
      ok: false,
      error: {
        key: 'investigators.errors.wrongDiceCount',
        params: { expected: 3, actual: 2 },
      },
    })
  })

  it.each([0, 7, 2.5])('rejects an invalid six-sided die value %s', (invalid) => {
    expect(evaluateCreationRoll('THREE_D6_TIMES_FIVE', [1, 1, invalid])).toEqual({
      ok: false,
      error: {
        key: 'investigators.errors.invalidDieValue',
        params: { position: 3, value: invalid },
      },
    })
  })
})
