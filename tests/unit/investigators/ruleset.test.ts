import { describe, expect, it } from 'vitest'
import ruleset from '@/modules/investigators/domain/rulesets/coc7-classic-1920s/manifest.json'
import { investigatorRulesetManifestSchema } from '@/modules/investigators/domain/ruleset'

/**
 * Built-in ruleset package.
 *
 * The JSON is application data rather than executable configuration. Validation
 * makes malformed content fail in development and CI instead of halfway through
 * a user's character creation.
 */
describe('Call of Cthulhu 7e Classic 1920s ruleset', () => {
  it('matches the versioned manifest contract', () => {
    expect(investigatorRulesetManifestSchema.safeParse(ruleset).success).toBe(true)
  })

  it('pins the supported era and creation methods', () => {
    expect(ruleset).toMatchObject({
      id: 'coc7-classic-1920s',
      version: '1.0.0',
      era: 'CLASSIC_1920S',
      creationMethods: ['STANDARD_ROLLS', 'ASSIGNED_ROLLS', 'MANUAL_ENTRY'],
    })
  })

  it('defines every characteristic exactly once with the official standard formula', () => {
    expect(ruleset.characteristics).toEqual([
      { key: 'STR', rollFormula: 'THREE_D6_TIMES_FIVE' },
      { key: 'CON', rollFormula: 'THREE_D6_TIMES_FIVE' },
      { key: 'SIZ', rollFormula: 'TWO_D6_PLUS_SIX_TIMES_FIVE' },
      { key: 'DEX', rollFormula: 'THREE_D6_TIMES_FIVE' },
      { key: 'APP', rollFormula: 'THREE_D6_TIMES_FIVE' },
      { key: 'INT', rollFormula: 'TWO_D6_PLUS_SIX_TIMES_FIVE' },
      { key: 'POW', rollFormula: 'THREE_D6_TIMES_FIVE' },
      { key: 'EDU', rollFormula: 'TWO_D6_PLUS_SIX_TIMES_FIVE' },
    ])
    expect(ruleset.luckRollFormula).toBe('THREE_D6_TIMES_FIVE')
  })
})
