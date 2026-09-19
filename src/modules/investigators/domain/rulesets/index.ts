import manifest1920s from './coc7-classic-1920s/manifest.json'
import { occupationCatalog as occupations1920s } from './coc7-classic-1920s/catalog'
import { skillCatalog as skills1920s } from './coc7-classic-1920s/skill-catalog'
import { type InvestigatorRulesetManifest, investigatorRulesetManifestSchema } from '../ruleset'
import type { OccupationCatalog } from '../occupations'
import type { SkillCatalog } from '../skills'

/**
 * The rulesets this build ships.
 *
 * An Investigator stores the identifier and version it was created from, and
 * every later read resolves through here. That is what makes a rules update
 * safe: publishing a new package adds an entry, it never changes the one an
 * existing character is pinned to.
 *
 * Packages are validated on load rather than on use. A malformed package is a
 * deployment fault, and failing at startup is a great deal easier to diagnose
 * than a character sheet that renders with one skill missing.
 */
export type InvestigatorRuleset = {
  readonly manifest: InvestigatorRulesetManifest
  readonly skills: SkillCatalog
  readonly occupations: OccupationCatalog
}

const REGISTRY: readonly InvestigatorRuleset[] = [
  {
    manifest: investigatorRulesetManifestSchema.parse(manifest1920s),
    skills: skills1920s,
    occupations: occupations1920s,
  },
]

export const DEFAULT_RULESET_ID = 'coc7-classic-1920s'
export const DEFAULT_RULESET_VERSION = '1.0.0'

export function findRuleset(id: string, version: string): InvestigatorRuleset | null {
  return (
    REGISTRY.find(
      (ruleset) => ruleset.manifest.id === id && ruleset.manifest.version === version,
    ) ?? null
  )
}

/**
 * The same, for callers that cannot sensibly continue without one.
 *
 * A character pinned to a package this build does not carry is a deployment
 * that has gone backwards, not a user error, so it throws rather than returning
 * an empty sheet that looks like data loss.
 */
export function requireRuleset(id: string, version: string): InvestigatorRuleset {
  const ruleset = findRuleset(id, version)
  if (!ruleset) throw new Error(`Unknown Investigator ruleset: ${id}@${version}`)
  return ruleset
}

/** Every ruleset a new Investigator may be created from. */
export function availableRulesets(): readonly InvestigatorRuleset[] {
  return REGISTRY
}
