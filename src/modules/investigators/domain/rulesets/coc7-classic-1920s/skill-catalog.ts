import baseSkills from './skills.json'
import supplementalSkills from './skills-supplement.json'
import { skillCatalogSchema } from '../../skills'

const base = skillCatalogSchema.parse(baseSkills)
const supplement = skillCatalogSchema.parse(supplementalSkills)

export const skillCatalog = skillCatalogSchema.parse({
  version: base.version,
  families: [...base.families, ...supplement.families],
  skills: [...base.skills, ...supplement.skills],
})
