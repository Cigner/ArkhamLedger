import { describe, expect, it } from 'vitest'
import {
  canPermanentlyDeleteInvestigator,
  transitionInvestigator,
} from '@/modules/investigators/domain/lifecycle'

describe('Investigator lifecycle', () => {
  it.each([
    ['DRAFT', 'ACTIVE'],
    ['ACTIVE', 'RETIRED'],
    ['RETIRED', 'ACTIVE'],
    ['ACTIVE', 'DECEASED'],
  ] as const)('allows %s to %s', (from, to) => {
    expect(transitionInvestigator(from, to)).toEqual({ ok: true, value: to })
  })

  it.each([
    ['DRAFT', 'RETIRED'],
    ['DRAFT', 'DECEASED'],
    ['RETIRED', 'DECEASED'],
    ['DECEASED', 'ACTIVE'],
    ['DECEASED', 'RETIRED'],
  ] as const)('rejects %s to %s', (from, to) => {
    expect(transitionInvestigator(from, to)).toEqual({
      ok: false,
      error: {
        key: 'investigators.errors.invalidStatusTransition',
        params: { from, to },
      },
    })
  })

  it('allows permanent deletion only for an unshared and unused draft', () => {
    expect(
      canPermanentlyDeleteInvestigator({
        status: 'DRAFT',
        hasBeenShared: false,
        hasBeenUsed: false,
      }),
    ).toBe(true)
    expect(
      canPermanentlyDeleteInvestigator({
        status: 'DRAFT',
        hasBeenShared: true,
        hasBeenUsed: false,
      }),
    ).toBe(false)
    expect(
      canPermanentlyDeleteInvestigator({
        status: 'ACTIVE',
        hasBeenShared: false,
        hasBeenUsed: false,
      }),
    ).toBe(false)
  })
})
