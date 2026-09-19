/**
 * Investigator domain types.
 */
export type CharacteristicKey = 'STR' | 'CON' | 'SIZ' | 'DEX' | 'APP' | 'INT' | 'POW' | 'EDU'

export type SuccessThresholds = {
  readonly regular: number
  readonly hard: number
  readonly extreme: number
}

export type MovementInput = {
  readonly strength: number
  readonly dexterity: number
  readonly size: number
  readonly age: number
}

export type DamageBonus =
  | { readonly kind: 'FIXED'; readonly value: -2 | -1 | 0 }
  | { readonly kind: 'DICE'; readonly count: number; readonly sides: 4 | 6 }

export type DamageBonusAndBuild = {
  readonly damageBonus: DamageBonus
  readonly build: number
}

export type AgeAdjustment = {
  readonly educationImprovementChecks: number
  readonly educationReduction: number
  readonly physicalReduction: {
    readonly total: number
    readonly eligible: readonly CharacteristicKey[]
  }
  readonly appearanceReduction: number
  readonly luckRolls: number
  readonly movementPenalty: number
}
