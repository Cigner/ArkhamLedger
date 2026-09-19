# Investigator ruleset implementation notes

## Source scope

The `coc7-classic-1920s` package contains operational facts required by the
creator. It does not copy occupation descriptions, suggested contacts, examples,
or other handbook prose.

The first catalog revision was verified against:

- _Call of Cthulhu Investigator Handbook_, chapter 3 for creation and finances;
- _Call of Cthulhu Investigator Handbook_, chapter 4 for occupations;
- _Call of Cthulhu Keeper Rulebook_, chapter 3 and the Investigator sheet for
  characteristic, age, skill, and derived-value rules.

## Where to check a rule

Page numbers in the Polish 7th edition Keeper Rulebook, where the printed page
number and the PDF page number coincide.

| Subject                                         | Page |
| ----------------------------------------------- | ---: |
| Chapter 3, creating Investigators               |   34 |
| Table I: Damage Bonus and Build                 |   37 |
| What the numbers mean (characteristic meanings) |   41 |
| Standards of living                             |   49 |
| Other ways of creating Investigators            |   52 |
| Chapter 4, skills                               |   58 |
| Chapter 5, the game system                      |   92 |
| Difficulty levels                               |  105 |
| Wealth and spending                             |  107 |
| Investigator development phase                  |  108 |
| The 1920s Investigator sheet                    |  480 |

## Catalog coverage

- 114 occupation variants from the Investigator Handbook occupation chapter;
- 44 concrete sheet skills used by the supported catalogs;
- seven open specialization families;
- Classic 1920s, Modern-only, and Lovecraftian metadata retained separately;
- no executable formula or expression stored in JSON.

Modern-only facts are retained so the source catalog is complete, but they are
not selectable when creating a Classic 1920s Investigator.

## Source inconsistency

The printed Butler/Valet/Maid entry lists nine resolved skill slots while the
same chapter defines occupations as eight-skill selections. The package keeps
the universal eight-skill rule and normalizes the final open choice from two
skills to one. This decision is explicit and must be revisited if an official
erratum provides a different correction.

## Content format

Occupation JSON uses a compact, administrator-readable source format. A pure
adapter validates and normalizes it into the strict domain model:

- `skill-id` references a concrete skill;
- `@family` requests a specialization from an open family;
- `@family:specialization` requires a named specialization;
- `group` selects from a reusable choice group;
- `oneOf` describes a local alternative;
- `any` creates unrestricted occupation-specialty slots.

Every normalized occupation must resolve to exactly eight skills and every
reference must exist in the versioned skill catalog.
