import { type Result, fail, ok } from '@/lib/result'

export type InvestigatorEra = 'CLASSIC_1920S' | 'MODERN'
export type LivingStandard = 'PENNILESS' | 'POOR' | 'AVERAGE' | 'WEALTHY' | 'RICH' | 'SUPER_RICH'

export type StartingFinances = {
  readonly livingStandard: LivingStandard
  readonly cash: number
  readonly assets: number
  readonly assetsUnboundedAbove: boolean
  readonly spendingLevel: number
}

type FinanceBand = {
  readonly minimum: number
  readonly maximum: number
  readonly livingStandard: LivingStandard
  readonly cash: { readonly kind: 'FIXED' | 'MULTIPLIER'; readonly value: number }
  readonly assets: { readonly kind: 'FIXED' | 'MULTIPLIER'; readonly value: number }
  readonly assetsUnboundedAbove?: boolean
  readonly spendingLevel: number
}

const FINANCE_BANDS = {
  CLASSIC_1920S: [
    {
      minimum: 0,
      maximum: 0,
      livingStandard: 'PENNILESS',
      cash: { kind: 'FIXED', value: 0.5 },
      assets: { kind: 'FIXED', value: 0 },
      spendingLevel: 0.5,
    },
    {
      minimum: 1,
      maximum: 9,
      livingStandard: 'POOR',
      cash: { kind: 'MULTIPLIER', value: 1 },
      assets: { kind: 'MULTIPLIER', value: 10 },
      spendingLevel: 2,
    },
    {
      minimum: 10,
      maximum: 49,
      livingStandard: 'AVERAGE',
      cash: { kind: 'MULTIPLIER', value: 2 },
      assets: { kind: 'MULTIPLIER', value: 50 },
      spendingLevel: 10,
    },
    {
      minimum: 50,
      maximum: 89,
      livingStandard: 'WEALTHY',
      cash: { kind: 'MULTIPLIER', value: 5 },
      assets: { kind: 'MULTIPLIER', value: 500 },
      spendingLevel: 50,
    },
    {
      minimum: 90,
      maximum: 98,
      livingStandard: 'RICH',
      cash: { kind: 'MULTIPLIER', value: 20 },
      assets: { kind: 'MULTIPLIER', value: 2000 },
      spendingLevel: 250,
    },
    {
      minimum: 99,
      maximum: 99,
      livingStandard: 'SUPER_RICH',
      cash: { kind: 'FIXED', value: 50000 },
      assets: { kind: 'FIXED', value: 5000000 },
      assetsUnboundedAbove: true,
      spendingLevel: 5000,
    },
  ],
  MODERN: [
    {
      minimum: 0,
      maximum: 0,
      livingStandard: 'PENNILESS',
      cash: { kind: 'FIXED', value: 10 },
      assets: { kind: 'FIXED', value: 0 },
      spendingLevel: 10,
    },
    {
      minimum: 1,
      maximum: 9,
      livingStandard: 'POOR',
      cash: { kind: 'MULTIPLIER', value: 20 },
      assets: { kind: 'MULTIPLIER', value: 200 },
      spendingLevel: 40,
    },
    {
      minimum: 10,
      maximum: 49,
      livingStandard: 'AVERAGE',
      cash: { kind: 'MULTIPLIER', value: 40 },
      assets: { kind: 'MULTIPLIER', value: 1000 },
      spendingLevel: 200,
    },
    {
      minimum: 50,
      maximum: 89,
      livingStandard: 'WEALTHY',
      cash: { kind: 'MULTIPLIER', value: 100 },
      assets: { kind: 'MULTIPLIER', value: 10000 },
      spendingLevel: 1000,
    },
    {
      minimum: 90,
      maximum: 98,
      livingStandard: 'RICH',
      cash: { kind: 'MULTIPLIER', value: 400 },
      assets: { kind: 'MULTIPLIER', value: 40000 },
      spendingLevel: 5000,
    },
    {
      minimum: 99,
      maximum: 99,
      livingStandard: 'SUPER_RICH',
      cash: { kind: 'FIXED', value: 1000000 },
      assets: { kind: 'FIXED', value: 100000000 },
      assetsUnboundedAbove: true,
      spendingLevel: 100000,
    },
  ],
} as const satisfies Readonly<Record<InvestigatorEra, readonly FinanceBand[]>>

function resolveAmount(
  formula: FinanceBand['cash'] | FinanceBand['assets'],
  creditRating: number,
): number {
  return formula.kind === 'FIXED' ? formula.value : formula.value * creditRating
}

export function calculateStartingFinances(
  era: InvestigatorEra,
  creditRating: number,
): Result<StartingFinances> {
  if (!Number.isInteger(creditRating) || creditRating < 0 || creditRating > 99) {
    return fail('investigators.errors.invalidCreditRating', { minimum: 0, maximum: 99 })
  }

  const bands: readonly FinanceBand[] = FINANCE_BANDS[era]
  const band = bands.find(
    ({ minimum, maximum }) => creditRating >= minimum && creditRating <= maximum,
  )
  if (!band) {
    return fail('investigators.errors.invalidCreditRating', { minimum: 0, maximum: 99 })
  }

  return ok({
    livingStandard: band.livingStandard,
    cash: resolveAmount(band.cash, creditRating),
    assets: resolveAmount(band.assets, creditRating),
    assetsUnboundedAbove: band.assetsUnboundedAbove ?? false,
    spendingLevel: band.spendingLevel,
  })
}
