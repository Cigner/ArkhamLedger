import { describe, expect, it } from 'vitest'
import { calculateStartingFinances } from '@/modules/investigators/domain/finances'

describe('calculateStartingFinances', () => {
  it.each([
    [0, 'PENNILESS', 0.5, 0, 0.5, false],
    [9, 'POOR', 9, 90, 2, false],
    [41, 'AVERAGE', 82, 2050, 10, false],
    [70, 'WEALTHY', 350, 35000, 50, false],
    [95, 'RICH', 1900, 190000, 250, false],
    [99, 'SUPER_RICH', 50000, 5000000, 5000, true],
  ] as const)(
    'calculates Classic 1920s Credit Rating %i',
    (creditRating, livingStandard, cash, assets, spendingLevel, assetsUnboundedAbove) => {
      expect(calculateStartingFinances('CLASSIC_1920S', creditRating)).toEqual({
        ok: true,
        value: {
          livingStandard,
          cash,
          assets,
          assetsUnboundedAbove,
          spendingLevel,
        },
      })
    },
  )

  it.each([
    [0, 'PENNILESS', 10, 0, 10, false],
    [9, 'POOR', 180, 1800, 40, false],
    [41, 'AVERAGE', 1640, 41000, 200, false],
    [70, 'WEALTHY', 7000, 700000, 1000, false],
    [95, 'RICH', 38000, 3800000, 5000, false],
    [99, 'SUPER_RICH', 1000000, 100000000, 100000, true],
  ] as const)(
    'calculates Modern Credit Rating %i',
    (creditRating, livingStandard, cash, assets, spendingLevel, assetsUnboundedAbove) => {
      expect(calculateStartingFinances('MODERN', creditRating)).toEqual({
        ok: true,
        value: {
          livingStandard,
          cash,
          assets,
          assetsUnboundedAbove,
          spendingLevel,
        },
      })
    },
  )

  it.each([-1, 100, 10.5])('rejects invalid Credit Rating %s', (creditRating) => {
    expect(calculateStartingFinances('CLASSIC_1920S', creditRating)).toEqual({
      ok: false,
      error: {
        key: 'investigators.errors.invalidCreditRating',
        params: { minimum: 0, maximum: 99 },
      },
    })
  })
})
