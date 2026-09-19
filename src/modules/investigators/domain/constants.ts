/**
 * Call of Cthulhu 7e Investigator rule constants.
 */
export const MAXIMUM_SANITY_BASE = 99
export const MAXIMUM_LUCK = 99
export const MINIMUM_INVESTIGATOR_AGE = 15
export const MAXIMUM_INVESTIGATOR_AGE = 90

export const MOVEMENT_PENALTY_BY_MINIMUM_AGE = [
  { minimumAge: 80, penalty: 5 },
  { minimumAge: 70, penalty: 4 },
  { minimumAge: 60, penalty: 3 },
  { minimumAge: 50, penalty: 2 },
  { minimumAge: 40, penalty: 1 },
] as const

/**
 * The backstory sections of the 7e Investigator sheet, in sheet order.
 *
 * Structural rather than content: the paper sheet fixes these boxes, and a
 * different era changes what people write in them rather than which boxes exist.
 * They live here for the same reason the characteristic keys do - the engine
 * refers to them by name, so a package cannot invent one the code cannot render.
 */
export const BACKSTORY_CATEGORIES = [
  'PERSONAL_DESCRIPTION',
  'IDEOLOGY_AND_BELIEFS',
  'SIGNIFICANT_PEOPLE',
  'MEANINGFUL_LOCATIONS',
  'TREASURED_POSSESSIONS',
  'TRAITS',
  'INJURIES_AND_SCARS',
  'PHOBIAS_AND_MANIAS',
  'ARCANE_TOMES_AND_ARTIFACTS',
  'ENCOUNTERS_WITH_STRANGE_ENTITIES',
] as const

export type BackstoryCategory = (typeof BACKSTORY_CATEGORIES)[number]
