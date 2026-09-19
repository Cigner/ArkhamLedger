import occupationsAC from './occupations-a-c.json'
import occupationsDH from './occupations-d-h.json'
import occupationsJP from './occupations-j-p.json'
import occupationsRZ from './occupations-r-z.json'
import { normalizeOccupationCatalog } from '../../occupation-data'
import { occupationCatalogSchema } from '../../occupations'

const sources = [occupationsAC, occupationsDH, occupationsJP, occupationsRZ]
const parts = sources.map(normalizeOccupationCatalog)
const [firstPart] = parts

if (!firstPart) {
  throw new Error('The occupation catalog must contain at least one source part.')
}

const expectedGroups = JSON.stringify(firstPart.choiceGroups)
if (parts.some((part) => JSON.stringify(part.choiceGroups) !== expectedGroups)) {
  throw new Error('Every occupation catalog part must define identical choice groups.')
}

export const occupationCatalog = occupationCatalogSchema.parse({
  version: firstPart.version,
  choiceGroups: firstPart.choiceGroups,
  occupations: parts.flatMap((part) => part.occupations),
})
