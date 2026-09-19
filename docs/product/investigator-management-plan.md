# Investigator management

Status: approved planning baseline  
Ruleset scope: Call of Cthulhu 7th Edition, Classic 1920s  
Implementation status: stages 1, 2 and 5 done, stage 3 in progress — see section 27  
Production availability: only after the complete feature passes its release gate

## 1. Goal

The module provides:

- creation of Investigators according to Call of Cthulhu 7e rules;
- a Character Vault independent of campaigns;
- use of an Investigator in multiple campaigns;
- live management of the character sheet during play;
- exactly one Investigator assignment for every session participant who plays a
  character;
- durable character and session history;
- per-field privacy;
- consent-based transfer to another player;
- permanent access to information that was previously disclosed.

The first supported ruleset is Classic 1920s. Every Investigator is pinned to an
immutable ruleset identifier and version so that other eras can be introduced
without changing existing characters.

## 2. Delivery and migration policy

This feature is developed and released as one complete unit. No partial database
schema, incomplete UI, or unfinished workflow is deployed to production.

All database changes made while this feature is under development belong to one
feature migration:

- the migration is created when implementation of the persistence layer starts;
- if the schema changes later during development, the existing feature migration
  is edited;
- no corrective or follow-up migration is added before the first production
  release of the feature;
- Drizzle schema definitions, migration SQL, migration metadata, and test
  fixtures must remain synchronized;
- development databases may be reset and the edited migration reapplied;
- CI must verify both a clean database migration and an upgrade from the current
  production schema;
- the feature migration must not be executed in production before the whole
  module is finished and approved.

After the migration has been applied to production for the first time, it becomes
immutable. Any schema changes conceived after that production release require a
new migration. Editing a migration already applied in production is forbidden.

The production release gate requires:

1. the complete creation flow;
2. active character management;
3. authorization and privacy filtering;
4. campaign and session integration;
5. transfer and permanent-access flows;
6. all planned automated tests;
7. the manual E2E checklist completed by the project owners;
8. a tested backup and rollback procedure;
9. documentation updated to match the implementation.

## 3. Scope

### Must have

- Character Vault.
- Draft creation with automatic persistence.
- Standard rolls, manual entry, and assignment of generated rolls.
- Characteristics, occupation, skills, backstory, finances, possessions, and
  weapons.
- Derived values calculated from the rules.
- Validation of occupation and personal-interest point budgets.
- Skill specializations.
- Live HP, SAN, MP, and Luck management.
- Health and insanity states represented by the official sheet.
- Skill development marks.
- Per-field privacy.
- Full campaign-context access for Keepers.
- Player and Keeper notes.
- Linking one Investigator to multiple campaigns.
- Keeper-created Investigators assigned immediately to a player.
- Automatic expiry of a creating Keeper's edit grant at first use.
- Session assignment and the Use the same Investigators operation.
- The IN_PROGRESS session state.
- Session-start and session-end snapshots.
- Consent-based transfer.
- Permanent access to previously disclosed information.
- Audit records for ownership, permission, visibility, and override changes.

### Should have

- Printable sheet and PDF export.
- JSON import and export.
- Resource history with reversal of the most recent erroneous change.
- Comparison of pre-session and post-session state.
- Post-session skill development resolution.
- Duplication as a separate lineage branch.
- Custom occupations and skills.
- Warning about concurrent use across campaigns.

### Future

- Modern and additional eras.
- Point-buy, Quick Fire, and other creation methods.
- Full combat automation.
- Chase management.
- Detailed insanity episode management.
- Magic, spells, tomes, and artifacts.
- Portrait and material management.
- In-session dice automation.
- Campaign-specific house rules.
- Import from third-party character tools.
- Administrative ruleset editor.

Future play modules are shown in a small Planned investigator tools section in
character settings. They must not appear as dead primary-navigation tabs.

## 4. Domain concepts

### Investigator

The current editable character owned by one user.

### Investigator lineage

A stable identifier connecting versions and branches of the same fictional
character. It connects pre-transfer copies, transferred continuations,
alternate-campaign branches, and historical snapshots.

### Campaign binding

A relationship between an Investigator and a campaign. It does not transfer
ownership and does not by itself grant permanent edit permission to a Keeper.

### Session assignment

The relationship between a session participant and the Investigator selected for
that session.

### Snapshot

An immutable full state captured at a meaningful domain boundary.

### Disclosure snapshot

An immutable viewer-specific projection containing only the information that was
available to that viewer at capture time.

## 5. Investigator lifecycle

Statuses:

- DRAFT — incomplete and unavailable for session assignment;
- ACTIVE — complete and available for play;
- RETIRED — intentionally withdrawn but restorable;
- DECEASED — historical and unavailable for new sessions;
- ARCHIVED — hidden from the primary Vault while retained in history.

Supported transitions:

- DRAFT to ACTIVE;
- ACTIVE to or from RETIRED;
- ACTIVE to DECEASED;
- ACTIVE, RETIRED, or DECEASED to ARCHIVED;
- ARCHIVED to ACTIVE or RETIRED, unless the Investigator is deceased.

A draft that has never been shared or used may be permanently deleted. Once an
Investigator has been shared, linked, or used, only archival is allowed.

## 6. Creation flows

### User-owned creation

1. The user opens Character Vault.
2. The user selects Create Investigator.
3. The user selects standard rolls, manual entry, or assign generated rolls.
4. The system creates an autosaved draft.
5. The user completes the wizard.
6. The system presents blocking errors and non-blocking warnings.
7. The user configures privacy.
8. The Investigator becomes ACTIVE.
9. The owner may link it to a campaign.

### Keeper-created Investigator

1. A Keeper selects a campaign player.
2. The selected player becomes the owner immediately.
3. The Keeper is recorded as creator and receives a temporary edit grant.
4. The owner receives a notification and may edit immediately.
5. Concurrent updates use optimistic locking.
6. At the beginning of the first session in which the Investigator is used, the
   system creates a snapshot, records firstUsedAt, and permanently closes the
   Keeper's edit grant.

The grant is effective only while the creator remains a Keeper in the relevant
campaign.

## 7. Creation wizard

### Identity

- name;
- age;
- sex;
- residence;
- birthplace;
- species, defaulting to Human;
- ruleset and era.

### Characteristics

- STR, CON, SIZ, DEX, APP, INT, POW, and EDU;
- starting Luck;
- roll results and their source;
- age adjustments.

### Derived values

- regular, hard, and extreme values;
- HP, MP, and SAN;
- Damage Bonus;
- Build;
- MOV.

### Occupation

- occupation definition;
- occupation point formula;
- Credit Rating range;
- occupation skill choices;
- optional short contact information.

### Skills

- occupation points;
- personal-interest points;
- specialization choices;
- forbidden-choice validation;
- remaining-point counters.

### Backstory

- personal description;
- ideology and beliefs;
- significant people;
- meaningful locations;
- treasured possessions;
- traits;
- injuries and scars;
- phobias and manias;
- tomes, spells, and artifacts;
- encounters with strange entities;
- key backstory connection.

### Finances and possessions

- Credit Rating;
- cash;
- assets;
- spending level;
- possessions;
- weapons.

### Privacy

- visibility presets;
- per-field configuration.

### Review

- blocking errors;
- warnings;
- unspent points;
- manual overrides;
- activation.

Manual entry represents an existing, possibly experienced character. It does not
require reconstruction of historical point allocation, but still validates
ranges and internal consistency.

## 8. Rules automation

The rules engine is a pure domain module independent of UI and persistence.

It calculates:

- regular, hard, and extreme thresholds;
- maximum HP from CON and SIZ;
- maximum MP from POW;
- starting SAN from POW;
- maximum SAN from Cthulhu Mythos;
- MOV with age adjustments;
- Damage Bonus and Build;
- characteristic-dependent skill base values;
- occupation and personal-interest point budgets;
- Credit Rating constraints;
- occupation choices and specializations.

Every calculated value offers a Why this value? explanation. A manual override
requires a reason, is clearly marked, and appears in history.

Ruleset files never contain executable JavaScript. They reference only formula
identifiers implemented and tested by the domain engine.

## 9. Active sheet

### Overview

- identity;
- characteristics and success thresholds;
- HP, SAN, MP, and Luck;
- Damage Bonus, Build, and MOV;
- active conditions;
- most recent session;
- linked campaigns.

### Skills

- search and filtering;
- grouping;
- success thresholds;
- specialization labels;
- development marks;
- development history.

### Combat

- weapons;
- damage;
- range;
- attacks;
- ammunition;
- malfunction;
- Dodge;
- basic combat values.

Full combat automation is outside the first release.

### Backstory

The paper-sheet categories are presented as readable sections rather than one
dense form.

### Possessions

- wealth;
- cash;
- spending level;
- equipment;
- narratively important possessions.

### Notes

- private owner notes;
- Keeper notes;
- private observations written by other players.

### History

- campaigns;
- sessions;
- transfers;
- snapshots;
- ownership changes;
- resource events;
- version comparison.

On mobile, HP, SAN, MP, and Luck are available in a pinned quick-action panel.

## 10. Live resources and development

Every HP, SAN, MP, or Luck change records:

- value before;
- value after;
- delta;
- actor;
- timestamp;
- optional reason;
- optional session.

This supports audit, reversal of an accidental change, session summaries, and
pre-session versus post-session comparison.

The owner may edit during a session. After first use, a Keeper retains full view
access but cannot mutate the sheet.

Skill values are rows rather than columns. Each row records:

- skill definition;
- optional specialization;
- base value;
- occupation allocation;
- personal-interest allocation;
- play-derived improvement;
- other adjustment;
- current value.

A development mark may reference the session in which it was earned. Repeated
marks before resolution do not create multiple improvement checks, but all
source sessions may remain in history.

## 11. Campaign integration

An owner may directly link an Investigator to a campaign in which they are a
member.

A Keeper may:

- use an Investigator already shared with the campaign;
- create a new Investigator for a player;
- request that an existing Investigator be linked.

A Keeper never receives access to the player's entire Character Vault.

Removing an Investigator from a campaign:

- prevents future assignments;
- closes active access grants;
- creates final disclosure snapshots;
- preserves all campaign and session history.

An Investigator may be linked to multiple campaigns, but it cannot participate
in overlapping active sessions. Separate fictional timelines should use a new
branch within the same lineage.

## 12. Session integration

SessionParticipant receives independent isKeeper and playsInvestigator
properties. A Keeper may therefore run the session and play their own
Investigator.

Every participant with playsInvestigator enabled must have exactly one assignment
before the session can enter IN_PROGRESS. Missing assignments do not block
scheduling.

Starting a session performs one transaction:

1. validate participants;
2. validate ownership and campaign bindings;
3. validate Investigator states and concurrency;
4. create full and disclosure start snapshots;
5. close any creator-Keeper edit grants expiring on first use;
6. record startedAt;
7. move the session to IN_PROGRESS.

Use the same Investigators selects the most recent started session in the same
campaign and copies only valid assignments. Its result reports copied
assignments, skipped participants, and a reason for every skip.

Completion creates an end snapshot used by history and the post-session
development flow.

## 13. Transfers

A campaign Keeper initiates a transfer request. The current owner may accept or
reject it; the request may also expire or be cancelled.

Acceptance performs one transaction:

1. capture the complete pre-transfer state;
2. create a continuation branch in the same lineage;
3. assign the new branch to the new owner;
4. switch the relevant campaign binding;
5. leave the previous branch and full pre-transfer state with the former owner;
6. update eligible future session assignments;
7. create notifications and audit records.

Branching prevents a transfer in one campaign from changing ownership in another
campaign. In the UI, it remains one transfer operation.

An administrator may perform an emergency transfer without consent only through
a separate audited action requiring a reason.

## 14. Privacy

Default visibility is public to other campaign players.

Access levels:

- owner — complete current data;
- campaign Keeper — complete campaign-context data;
- other campaign players — redacted public projection;
- users outside the campaign — no access.

Visibility is global per Investigator in the first release. Campaign-specific
overrides are deferred.

The UI supports Public, Hidden, and grouped visibility presets. A hidden field
returns an empty or defined default value and a redacted marker so that the UI
does not present fallback data as confirmed information.

If a visible derived value would reveal a hidden source field, the derived field
is hidden by default. The owner may explicitly disclose it separately.

Redaction happens in the data layer. Full values are never sent to the browser
and hidden later with client-side rendering or CSS.

## 15. Permanent access

Permanent access means that a user retains the exact information previously
disclosed to them, but does not receive future updates after their active access
ends.

Before access is reduced, the system atomically captures the viewer's current
projection. This applies to:

- hiding a field;
- removing an Investigator from a campaign;
- leaving a campaign;
- ending a campaign;
- transferring the Investigator;
- reducing note visibility.

After a campaign ends, a Keeper retains session snapshots and the final full
campaign-context projection, but not future changes made elsewhere.

Snapshots, disclosure snapshots, and grants are append-only. Account deletion
pseudonymizes the actor where required but does not destroy information already
granted to other users.

## 16. Notes

Keeper notes are campaign-scoped and support:

- KEEPERS;
- KEEPERS_AND_OWNER;
- CAMPAIGN.

Reducing visibility creates a new revision. Previously disclosed revisions remain
available to their recipients.

A player's note about another Investigator:

- is visible only to its author;
- cannot be shared;
- remains available after leaving the campaign;
- references the latest disclosure snapshot available to the author.

Notes use plain text or a restricted, server-sanitized Markdown subset.

## 17. Permission summary

| Operation           |    Owner | Creator-Keeper before first use | Other Keeper | Other player |
| ------------------- | -------: | ------------------------------: | -----------: | -----------: |
| Full current view   |      Yes |                             Yes |  In campaign |           No |
| Edit current sheet  |      Yes |                             Yes |           No |           No |
| Assign to session   |       No |                             Yes |          Yes |           No |
| Configure privacy   |      Yes |                             Yes |           No |           No |
| Transfer            | Approves |                        Requests |     Requests |           No |
| Keeper note         |       No |                             Yes |          Yes |           No |
| Private observation |      Yes |                             Yes |          Yes |          Yes |
| Historical view     | By grant |                        By grant |     By grant |     By grant |

ADMIN does not automatically receive ordinary character-editing access in the
application. Recovery actions are separate and audited.

## 18. Data model

Core tables:

- investigator — owner, creator, lineage, status, creation method, ruleset,
  ruleset version, era, optimistic-lock version, and firstUsedAt;
- investigator_profile — identity and occupation;
- investigator_characteristics — the eight characteristics, starting Luck, and
  age adjustments;
- investigator_state — current resources and conditions;
- investigator_skill — definition, specialization, allocation sources, and
  current value;
- investigator_skill_development — marks and resolved improvements;
- investigator_backstory_entry — category, content, order, and key-connection
  marker;
- investigator_weapon;
- investigator_possession;
- investigator_resource_event.

Campaign, access, and history tables:

- campaign_investigator;
- investigator_edit_grant;
- investigator_field_visibility;
- investigator_access_grant;
- investigator_snapshot;
- investigator_disclosure_snapshot.

Session and ownership tables:

- session_investigator_assignment;
- investigator_transfer.

Note tables:

- investigator_note;
- investigator_note_revision;
- investigator_note_disclosure.

Important constraints:

- one assignment per SessionParticipant;
- one active binding for an Investigator and campaign pair;
- unique skill definition and specialization per Investigator;
- immutable snapshots;
- expected-version checks for mutable aggregate updates;
- no physical deletion of used Investigators, access grants, or disclosures.

## 19. Ruleset packages

The coc7-classic-1920s package contains:

- immutable manifest and version;
- i18n keys;
- skill definitions;
- specialization families;
- occupations;
- occupation-point formula identifiers;
- Credit Rating ranges;
- characteristic and resource definitions;
- derived-formula identifiers;
- backstory categories;
- era constraints;
- creator validation rules.

An Investigator remains pinned to the package version used at creation.
Publishing a new package does not alter existing characters.

Packages contain operational facts, identifiers, formulas, limits, and labels,
not copied handbook descriptions. The module must remain consistent with the
Chaosium Fan Material Policy while the application is private and
non-commercial. Any later publication or monetization requires a new licensing
review.

Research references:

- [Chaosium Fan Use and Licensing Q&A](https://www.chaosium.com/fan-use-and-licensing-q-a/)
- [Dhole's House](https://www.chaosium.com/blog/welcome-to-the-dholes-house-free-online-toolkit-for-call-of-cthulhu/)
- [Quest Portal character sheets](https://www.questportal.com/features/character-sheets)
- [Demiplane character tools](https://resources.demiplane.com/nexus/vampire/tools/character-tools-overview)
- [Roll20 Call of Cthulhu 7e sheet](https://github.com/Roll20/roll20-character-sheets/blob/master/Call_of_Cthulhu_7th_Ed/sheet.json)

## 20. Screens

- Character Vault;
- creation wizard;
- active sheet;
- privacy settings;
- history and snapshots;
- Campaign Investigators;
- session assignments;
- transfer request and confirmation;
- Investigator development;
- notes;
- print and PDF preview;
- Planned investigator tools;
- read-only admin ruleset list.

## 21. Notifications

Internal and email notifications cover:

- a Keeper created an Investigator for the user;
- an Investigator was linked to a campaign;
- a Keeper requested an existing Investigator;
- a transfer was requested, accepted, rejected, or expired;
- a session assignment was created or changed;
- an assignment is missing before session start;
- the creating Keeper's edit grant expired at first use.

Discord messages contain only a generic event and application link. They never
contain character fields or notes.

## 22. Security and integrity

- Authorization is enforced in the data-access layer.
- Owner, Keeper, player, and historical-access DTOs are distinct.
- Privacy field keys come from a fixed registry.
- Ruleset formulas cannot execute arbitrary code.
- Concurrent edits use optimistic locking.
- Transfer, session start, access reduction, and snapshot publication are
  transactional.
- Ownership, permission, visibility, and override changes are audited.
- Full snapshots are not exposed through disclosure endpoints.
- User-authored formatted text is sanitized on the server.

## 23. Testing

Unit tests cover:

- all formulas and thresholds;
- age effects;
- skill base values;
- point budgets;
- specializations;
- lifecycle transitions;
- privacy dependencies;
- DTO redaction.

Integration tests cover:

- user and Keeper creation;
- Keeper edit-lock at first use;
- atomic session start;
- copying previous assignments;
- transfer and branching;
- snapshot capture before access reduction;
- permanent access after leaving a campaign;
- optimistic-lock conflicts;
- applying the one feature migration to a clean database;
- upgrading a copy of the current production schema with that migration.

Security tests prove:

- hidden values are absent from responses;
- derived values do not leak hidden sources;
- full snapshots cannot be retrieved through disclosure access;
- campaign and Investigator identifiers cannot bypass authorization;
- a former Keeper cannot retain active privileges;
- private notes remain author-only after campaign exit.

The project owners execute the E2E checklist on desktop and mobile before the
production release gate is approved.

## 24. Additional product proposals

| Feature                       | Value                                             |   Cost | Target      |
| ----------------------------- | ------------------------------------------------- | -----: | ----------- |
| Why this value?               | Explains calculated values                        |    Low | Must have   |
| Session readiness report      | Identifies missing assignments and conflicts      |    Low | Must have   |
| Resource event journal        | Provides history and correction of mistakes       | Medium | Must have   |
| Compare with previous session | Makes progression easy to understand              | Medium | Should have |
| Character branching           | Supports transfers and alternate timelines safely | Medium | Foundation  |
| Completeness indicator        | Shows unfinished creator decisions                |    Low | Must have   |
| Duplicate Investigator        | Creates variants quickly                          |    Low | Should have |
| Printable sheet               | Preserves paper-first play                        | Medium | Should have |
| Character provenance          | Shows source, ruleset, and ownership history      |    Low | Must have   |

## 25. Implementation stages

1. Domain decisions, ruleset package, formula engine, and unit tests.
2. The single feature migration, persistence model, snapshots, grants, privacy,
   and audit.
3. Character Vault, drafts, creator, validation, and activation.
4. Active sheet, resources, skills, possessions, backstory, and history.
5. Campaign bindings, Keeper creation, and edit grants.
6. IN_PROGRESS sessions, assignments, reuse of previous Investigators, and
   snapshots.
7. Transfer, lineage branching, disclosure history, and edge cases.
8. Notes, revisions, and skill development.
9. PDF, JSON, comparison views, duplication, final security review, complete
   regression suite, and manual E2E.
10. Production release of the complete module and its single migration.

## 26. Final later stage: administrative ruleset editor

The editor is implemented only after the ruleset model is stable. It provides:

- draft package creation;
- skill, occupation, and constraint editing;
- JSON Schema validation;
- comparison against the previous version;
- detection of removed or changed identifiers;
- test Investigator creation;
- publication of a new immutable version;
- activation for new Investigators only;
- selection of an older version as the default for future characters;
- full audit.

The editor never accepts code or arbitrary formulas. Administrators select only
operations and formula identifiers supported by the domain engine.

## 27. Implementation progress

Recorded here rather than in commit messages, because the release gate in
section 2 is a checklist somebody has to be able to read against the code.

### Done

- **Stage 1 — domain, ruleset, formulas.** `src/modules/investigators/domain/`
  holds the rules engine: characteristic rolls, age effects, derived values,
  education improvement, occupation and personal-interest budgets, skill
  allocation, finances, and the Investigator lifecycle. The
  `coc7-classic-1920s` package carries 114 occupation variants, 44 skills, and
  seven specialization families as declarative JSON validated by Zod.
- **Stage 2 — migration and persistence model.** One feature migration,
  `0005_investigator_management`, creates all 25 tables and applies cleanly to
  an empty database in the integration suite. `src/db/schema/investigator.ts`
  mirrors it.
- **Stage 2 — authorization and privacy rules.** `domain/access.ts` encodes the
  permission table from section 17 as data, and `domain/visibility.ts` holds the
  field registry, the derived-value cascade, and the defaults a hidden field
  falls back to. `domain/sheet.ts` projects one sheet per reader, which is where
  section 14's "redaction happens in the data layer" is actually enforced.
  `data/guards.ts` resolves a viewer's role from ownership, an open creator
  grant, and campaign membership.
- **Session integration (section 12).** The `IN_PROGRESS` state, `startedAt`,
  `endedAt`, and `playsInvestigator` exist end to end. Starting a session is one
  transaction that refuses while somebody playing a character has not been given
  one, checks each character is owned by the player and still linked to the
  campaign, archives every sheet, records first use, closes the creating
  Keeper's edit grant, and moves the session. Attendance is recorded when the
  session is completed from `IN_PROGRESS`.
- **Snapshots and permanent access (sections 4 and 15).** `data/sheet.ts`
  assembles the whole sheet from nine tables and the rules engine;
  `data/snapshots.ts` writes archival snapshots, captures a viewer's projection
  before their access ends, and unlinks a character from a campaign while
  leaving everyone what they had been shown.
- **Notification types (section 21).** All ten events exist in the enum, in the
  renderer, and in the inbox. None of them broadcasts, and a test proves no
  character name can reach a Discord channel.
- **Concurrency and text handling (section 22).** `claimVersion` makes every
  sheet mutation conditional on the version it was read at.
  `lib/text/sanitize.ts` strips the characters that survive HTML escaping and
  still change what a reader sees.

- **Campaign bindings and Keeper creation (sections 6 and 11).** A player brings
  one of their own characters to a campaign or starts a new one there; a Keeper
  starts a character for a player, who owns it immediately and is notified,
  while the Keeper holds an edit grant until its first use. Removing a character
  captures what everybody had been shown first. A campaign's Characters tab
  lists who is at the table; the picker offers only the caller's own characters,
  so a Keeper never reaches into somebody's Vault.
- **Concurrent play (section 11).** Starting a session refuses a character that
  is already being played in another session that has started, and names it.

- **Session assignments point at the version played (Q-round conclusion).** An
  assignment carries `start_snapshot_id` and `end_snapshot_id`, so editing a
  sheet afterwards cannot change what the history of that session shows.
- **Manual overrides are applied and marked (section 8).** A calculated value
  somebody replaced by hand comes back with the value they insisted on and the
  reason they gave. The override is withheld along with the field it replaced,
  so a reason cannot disclose a hidden number by describing it.

- **Ruleset names (section 19).** All 191 keys the `coc7-classic-1920s` package
  refers to exist in English: 44 skills, 7 specialization families, 26 named
  specializations and 114 occupations. A test fails the build if a package ever
  names a key nobody translated.
- **The Character Vault and the sheet (sections 7 and 20, partial).**
  `/investigators` lists what a person owns, drafts included;
  `/investigators/[id]` is the sheet itself - one long page whose sections save
  independently and carry the version they were read at. Identity,
  characteristics, occupation, skills, weapons, backstory, finances,
  possessions and privacy are all written; the derived values and the point
  counters recalculate as you type, and the review panel lists what is still
  missing and finishes the draft. Skills outside the occupation can be added and
  removed; skills the occupation grants cannot.
- **Occupations resolve to eight skills (section 7).** The catalog says what an
  occupation offers; `domain/occupation-choices.ts` is the join between that and
  what a particular character took, and a test resolves all 114 of them.
  Choosing an occupation reconciles the skill rows: its skills are added at
  their base value, skills it no longer grants keep their row and their personal
  interest but lose the occupation points, which belonged to the job.

- **Privacy is configurable (section 14).** The owner and a creating Keeper set
  which fields the rest of the party may read, grouped as the sheet groups them.
  The cascade is shown while the switches are flipped rather than explained: a
  field that follows a hidden source is marked as following it.
- **Money comes from Credit Rating (section 7).** Credit Rating is a skill, so
  it is read from the skill rather than stored twice; the living standard,
  spending level and starting amounts are a table lookup on it, and only what
  play changes is typed in.

- **The active sheet (sections 9 and 10).** A character that is not a draft
  opens as sections rather than as the creator: Overview, Skills, Combat,
  Backstory, Possessions and History, with the four resources pinned above them
  because they are the only part that moves while a game is running.
- **Resources follow the rules (section 10).** Damage and Sanity loss are
  entered as amounts, not totals, because the size of a single blow is what the
  rules read: half the maximum in one hit is a major wound, more than the
  maximum is fatal, five Sanity at once calls for an Intelligence roll, and a
  fifth of the day's Sanity is indefinite insanity. Every change is an event
  carrying what it was, what it became, who did it and why, and the most recent
  one can be undone - as a new event pointing at it, because the journal is
  append-only.

- **Session assignments and "Use the same Investigators" (section 12).** The
  session page lists everybody bringing a character, chosen or not, because the
  Keeper's question before a session is who is still missing. Characters are
  offered only from what is already in the campaign, so choosing for somebody
  never exposes the rest of their Vault. Copying forward reads the most recently
  _started_ session - a session that was scheduled and never played says nothing
  about who was at the table - and reports what it could not copy rather than
  doing it quietly.
- **Who brings a character (section 12).** `playsInvestigator` is set on the
  roster, defaulting to true for players and false for Keepers. Both are
  defaults rather than rules: a Keeper may run the evening and play in it, which
  is the whole reason the flag is independent of `isKeeper`.

- **Transfers and lineage branching (section 13).** A Keeper asks and the owner
  answers; accepting copies the character into a new branch of the same lineage
  and moves the campaign's binding onto it. The previous owner keeps the branch
  they played, exactly as it was, which is what stops a transfer in one campaign
  touching another. Upcoming sessions follow the branch when the new owner is
  the one sitting there and are cleared when they are not; sessions that already
  happened are never rewritten. Requests lapse after fourteen days, and the
  worker tells both parties when one does.

- **Skill development (section 10).** A skill used successfully is ticked on the
  active sheet; at the end of a chapter each ticked skill gets one development
  roll, however often it was ticked. Keeper Rulebook page 105: beat the skill or
  roll above 95, then add 1D10. Both dice are entered rather than generated, and
  the value the roll has to beat is shown beside it. Resolving ties the ticks to
  the roll that spent them, so the same tick cannot earn a second one.

- **Notes (section 16).** Three kinds with visibly different reach: a Keeper's
  note is campaign business and can be shared with the Keepers, the owner, or
  the whole table; an owner's note is theirs; a player's observation of somebody
  else's character reaches nobody at all and survives them leaving the campaign.
  Every edit adds a revision, and narrowing one captures the revision being
  taken away for the people losing it - so a Keeper can stop sharing something
  without rewriting what the table already read.

- **Security review and regression (sections 22 and 23).** All six properties
  section 23 requires are proven by tests in
  `tests/integration/investigator-security.test.ts`, and each was verified to
  fail when the protection it covers is removed. The review found five gaps in
  section 22's own claims, all now closed - see the decisions below. The one
  feature migration applies to an empty database and to a populated copy of the
  current production schema, including widening the notification enum on a table
  that already has rows.

- **Stage 9 additions.** The printable sheet at `/investigators/[id]/print`
  lays the character out the way the paper one does and prints through the
  browser rather than through a PDF library - a second server-side layout would
  have to be kept in step with the first for no gain a reader would notice. JSON
  export serves the reader's own projection, so a download carries exactly what
  the screen does. Duplication branches the lineage without the campaigns,
  history or disclosures. A completed session shows what the evening did to each
  character, read from its two snapshots. The administrator's ruleset list and
  the "Planned investigator tools" panel are both in place.

- **The administrator's emergency transfer (section 13).** Administrators only,
  behind a written reason of at least a sentence, a security log line, an audit
  entry recording that consent was overridden, a transfer row saying it was
  never asked, and both people told. It withdraws any request already waiting on
  the owner.
- **JSON import.** A file is somebody's claim about a character, not a
  character. Ownership, status, lineage, history, play improvement and
  development marks are not read at all; everything else is bounded by what a
  character can be, and what the rules can compute is recomputed. It arrives as
  a draft owned by whoever imported it.

### Not started

Custom occupations and skills (section 3, should-have). Everything else in
section 31 is now built; see that section for what each one turned into.

Everything this module deliberately left for later - section 3's Future list,
the ruleset editor in section 26, and the two privacy decisions deferred to a
second release - is collected in [deferred-work.md](deferred-work.md), with what
each one is waiting for. A list of what was left out is only useful if there is
one place to find it.

The release gate has one item left that nobody here can close: the manual E2E
checklist on desktop and mobile, which the project owners execute. The backup
and rollback procedure is written and mechanically verified - see
`docs/operations/backup-restore.md` and `scripts/rollback-0005.sql` - and the
owners' part is repeating it against a restored copy of production.

- **The five gaps from section 29 are closed.** A draft autosaves two seconds
  after the typing stops, keeping the explicit save because a confirmation
  somebody saw is worth more than one they did not. The creation method is
  chosen before the draft exists and the characteristics record the matching
  source, so the roll record can finally answer "were these rolled?". Permanent
  access has a page: `/investigators/kept` lists what somebody was shown and can
  no longer reach, and each entry renders from the disclosure rather than from
  the character. Every derived value carries a "Why this value?" explanation
  built from the same inputs the calculation used. Provenance shows the ruleset,
  the method, who made it, what it was branched from and every hand-over.
- **The Investigator lifecycle exists (section 5).** Until now a character could
  only be created. Retiring, dying, archiving, restoring and deleting a draft
  nobody has seen are all actions now, with the one irreversible door the rules
  insist on: the dead stay dead and stay archived. Deletion counts its blockers
  - campaigns, sessions, snapshots, disclosures - and refuses with the numbers,
    because each of those is somebody else's record.

### Decisions taken during implementation

- **ARCHIVED is a timestamp, not a status.** `investigator.archived_at` sits
  beside the DRAFT/ACTIVE/RETIRED/DECEASED enum. Archiving hides a character from
  the Vault without discarding what it was, and restoring it is clearing a
  column rather than reconstructing a previous state. Section 5 describes the
  behaviour; this is how it is stored.
- **Skills are one privacy key, not one per skill.** Per-skill visibility is
  additive later. Opening with four dozen switches would bury the question
  people actually have, which is whether the party can read their sheet.
- **Backstory categories live in the domain.** They are boxes on the printed
  sheet rather than era content, so they sit in `domain/constants.ts` next to the
  characteristic keys. A package-driven list can widen that later without moving
  any stored data.
- **A session is started by hand.** Starting on the confirmed hour would freeze
  sheets while people are still arriving. The Keeper presses start, and that is
  the moment assignments are fixed.
- **A snapshot carries the privacy that was in force, not one copy per viewer.**
  Section 12 asks for full and disclosure snapshots at session start. Storing a
  projection per person per character per session is a large pile of derived data
  that can drift from the sheet it came from; storing the sheet together with its
  visibility map lets any viewer's historical view be recomputed exactly.
  Disclosure snapshots remain per person, for what they are actually for: the
  moment somebody's access ends.
- **Ten notification types, none of them broadcast.** Section 21 already says
  Discord carries only a generic event; making that structural rather than
  editorial means no future wording change can leak a character.
- **User text is cleaned, not parsed.** Section 22 allows plain text or a
  restricted Markdown subset. The sanitizer handles the plain-text case now -
  bidirectional overrides, zero-width characters, control codes - and the
  Markdown subset waits until notes exist to need it.
- **The creator is one long sheet, not a stepped wizard.** It mirrors the paper
  character sheet people already know, and it keeps a correction three sections
  back from being three steps back.
- **Rolls are entered, not generated.** Dice rolling is planned as its own
  feature whose results drop into many places, so the creator accepts values and
  records where they came from rather than owning a generator of its own.
- **The one-long-sheet decision is about the creator only.** The active sheet
  keeps the sections named in section 9 - Overview, Skills, Combat, Backstory,
  Possessions, Notes, History - because a played character is navigated, not
  read top to bottom. The paper sheet remains the printable view.
- **Deferred play tools need a visible home.** Section 20 asks for a small
  "Planned investigator tools" panel in character settings so combat, chases and
  magic are visibly planned rather than missing. It sits in the history tab of
  the active sheet and is deliberately not navigation.
- **The rules engine is checked against the printed book.** The wound and Sanity
  thresholds are from the Keeper Rulebook, pages 131 and 172-173, and the
  worked example on page 131 - Harvey at 15 hit points taking 3 and then 8 - is
  a test. A rules engine that disagrees with the printed example is wrong
  however reasonable it looks.
- **A transfer captures no disclosures.** Section 15 asks for a capture whenever
  access is reduced, and a transfer reduces nobody's: the campaign's binding
  moves from the character to an exact copy of it, so everyone who could read
  the sheet a moment earlier still can, and the previous owner keeps the
  original outright.
- **Nothing is announced when a note is shared.** Section 21 lists no event for
  it, and borrowing another type would put "a character was linked to a
  campaign" in somebody's inbox because a Keeper wrote a sentence. A note shared
  with an owner who never hears about it is a real gap, and closing it needs an
  event of its own rather than a convenient neighbour.

## 28. Security review findings

Five gaps between what section 22 claims and what the code did, found by reading
the code against the claim rather than by running the tests.

1. **The Vault listing took an identifier.** `listOwnInvestigators(userId)` was
   correct at every call site and one careless argument away from serving
   somebody else's characters. It now reads the caller from the session and
   cannot be pointed elsewhere.
2. **Refusing a transfer was not audited.** Requesting, accepting and cancelling
   were. A refusal is a decision about ownership, and "she was asked and said
   no" is exactly the fact somebody needs when it is asked again.
3. **Edit grants were not audited as permission changes.** Opening one was
   implied by the creation entry and closing one was a count inside
   `session.started`; neither said whose right to edit which sheet had begun or
   ended. Both are now recorded per character.
4. **Conditions moved with no record anywhere.** Resources carry their own
   journal; the health and insanity flags did not, so a character could stop
   dying with nothing to show for it. Now audited - not journalled, because a
   resource event with no delta would be a lie in the shape of one.
5. **Answering somebody else's transfer said "forbidden".** A stranger could
   confirm a request existed by being refused. It now reads as not found, like
   every other identifier somebody has no business holding.

### How the tests were checked

A security test that passes against broken code proves nothing, so each
protection was deliberately removed and the suite re-run. Disabling redaction
failed three tests; making the guard resolve every viewer to PLAYER failed four.
Both were restored and the suite is green.

- **Export without import.** Section 3 lists both as should-have and section 17
  suggests JSON may be an administrative function. Export is the reader's own
  projection and risks nothing. Import is a way to write a character nobody
  rolled - a sheet with 90 in every skill and a note saying it came from
  somewhere else - so it needs to decide what it trusts before it exists, not
  afterwards.
- **Printing through the browser.** Every browser prints to PDF. A server-side
  renderer would be a second layout to keep in step with the first, and the
  first is the one people will actually look at.

## 29. Gaps found re-reading the plan

Five must-have items from section 3 that are not built, found by reading the
plan against the code rather than against the progress notes.

1. **Autosave.** Section 3 asks for "draft creation with automatic persistence"
   and section 6 for "an autosaved draft". The creator saves per section on a
   button. Nothing is lost silently, but a half-written character does not
   survive a closed tab.
2. **The creation method is never chosen.** Section 6 step 3 offers standard
   rolls, manual entry, or assigning generated rolls. The dialogs hardcode
   `STANDARD_ROLLS` while the sheet records `MANUAL`, so the stored method is
   both unchosen and inconsistent with itself. The values themselves are
   entered by hand, which is the decision recorded above - but the field should
   say what actually happened.
3. **Permanent access has no screen.** The storage and the reads exist and are
   tested; nothing renders them. A former Keeper keeps what they were shown and
   has nowhere to look at it, and `VIEW_CURRENT` refuses a HISTORICAL role by
   design, so the page they would reach for turns them away.
4. **"Why this value?"** Section 8 asks every calculated value to explain
   itself, and section 24 marks it must-have. Derived values are calculated
   correctly and silently.
5. **Character provenance.** Section 24 marks it must-have: source, ruleset and
   ownership history. The lineage, the branch and the transfer rows are all
   stored; no screen shows where a character came from.

## 30. Bugs found auditing the finished feature

Four, all of which passed every test that existed and would have surfaced as
something inexplicable at a table months later.

1. **The Sanity day was calendar midnight.** A session played from eight in the
   evening crosses UTC midnight partway through, so the one-fifth indefinite
   insanity threshold reset in the middle of the night it exists to measure. It
   is now anchored to the session the character is in, which is also closer to
   what the rules describe, and falls back to a rolling twenty-four hours
   outside one.
2. **A disclosure was chosen arbitrarily.** Unlinking captures for everybody in
   one transaction, so their timestamps are identical; ordering on the timestamp
   alone could hand a viewer a different row on each read. The same fault was
   fixed earlier in the resource journal and had been reintroduced here.
3. **Snapshot payloads were cast, not checked.** The `schema_version` column
   exists to guard exactly this and was never read, so a payload written by a
   future build would have been read as though it had this shape.
4. **A forced move left a consented request open.** The owner could afterwards
   accept a hand-over of a character that had already moved, branching a second
   time from a source nobody holds.

## 31. A second reading of the plan

The five gaps in section 29 are built. Reading sections 1 to 26 again against
the code turned up ten more, none of them recorded before.

1. **The lifecycle had no actions at all (section 5).** Five statuses and a set
   of transitions were defined and tested in the domain, and only DRAFT to
   ACTIVE was reachable. A Call of Cthulhu application in which a character
   cannot die is not describing the game it is for. **Now built.**
2. **A Keeper cannot ask for an existing character (section 11).** The
   notification type `INVESTIGATOR_REQUESTED` exists and nothing raises it. A
   Keeper can create a character for somebody and can use one already linked,
   but has no way to ask for one they have seen in another campaign. **Now
   built:** the sheet offers "ask for this character", listing campaigns the
   reader keeps that the owner already plays in, and the owner links it or does
   not.
3. **Leaving a campaign captures nothing (section 15).** The section lists six
   moments that reduce access; removing a character from a campaign is wired and
   a transfer is deliberately exempt, but a member leaving and a campaign ending
   are not. Somebody who leaves keeps nothing, which is precisely the promise
   section 15 makes. **Now built.**
4. **Grouped visibility presets (section 14).** There is all-public and
   all-private; the section asks for presets per group, which is what somebody
   who wants to hide their backstory and nothing else actually reaches for.
   **Now built.**
5. **The history tab is a third of what section 9 describes.** It has the
   resource journal and now provenance. Campaigns, sessions, snapshots and
   version comparison are not there. **Now built:** every comparison is computed
   from projections taken with the reader's own role, so the archive cannot say
   more than the sheet above it.
6. **No skill search, filtering or grouping (section 9).** Forty-four skills in
   one alphabetical column is the arrangement the paper sheet uses because paper
   cannot filter. **Now built:** a search box and a value-or-name ordering
   switch.
7. **No concurrent-use warning (section 3, should-have).** Playing one character
   in two campaigns is refused at session start, which is correct and late. The
   warning belongs where the character joins the second campaign. **Now built**,
   as a count rather than a list of campaign names: section 11 keeps one
   campaign from learning what else somebody plays.
8. **The occupation has no contact field (section 7).** Marked optional in the
   plan and absent. **Now built**, hidden and shown with the occupation itself
   rather than as a privacy key of its own.
9. **The mobile resource panel is not pinned (section 9).** It sits at the top
   of the active sheet and scrolls away, which is the opposite of what a pinned
   quick-action panel is for. **Now built.**
10. **Player observations do not reference a disclosure snapshot (section 16).**
    The section says an observation references the latest disclosure available
    to its author, so that a note about a character somebody can no longer see
    still has the sheet it was written about. The note survives; the sheet it
    was written against does not travel with it. **Now built:** the pin is
    applied wherever a disclosure is captured, and applied once - a note keeps
    the first disclosure taken after it was written rather than being rewritten
    by every later one. The kept-disclosure page now also shows a reader their
    own observations, since it is the only page they can still reach.

## 32. What the second build turned up

Building section 31 surfaced one defect of its own, in code that had passed
review twice.

1. **Session comparisons were computed from unprojected snapshots.** The session
   overview compared the pair of snapshots an evening took and drew the result
   for whoever opened the page. A snapshot stores the character whole together
   with the privacy in force over it - deliberately, so that any viewer's
   historical view can be recomputed - and comparing the raw pair published what
   the sheet withholds: "lost 13 Sanity" about a character whose owner hides
   their Sanity. The pair is now projected inside the data layer with a role the
   reader's own guard resolves, and a reader with no standing toward a character
   gets no summary of it rather than a summary of somebody else's evening. Two
   tests hold the line, one of them comparing what an owner sees with what a
   player at the same table sees.

## 33. The plan walked point by point

Every sub-point of sections 1 to 26 read against the code. Most were already
built; these are what the walk turned up.

1. **Two notification types existed and nothing raised them (section 21).**
   `INVESTIGATOR_EDIT_GRANT_CLOSED` and `SESSION_ASSIGNMENT_MISSING` were in the
   enum, the renderer and the inbox, with no code path that produced either.
   The first now goes to the owner when a session starts and the creating
   Keeper's grant closes - the sheet becoming theirs alone is the change, and
   the copy written for it was already addressed to them. The second is a worker
   job running hourly: a day before a session starts, any Keeper whose table
   still has somebody without a character is told who. Once per session per
   Keeper. Section 12 already refuses to start such a session, which is correct
   and discovered with everybody in the room.
2. **Hiding a field captured nothing (section 15).** It is the first of the six
   moments the section lists and it was the one deliberately skipped, on the
   grounds that a capture per toggle would write a copy of the sheet every time
   somebody changed their mind. That reasoning was wrong about the promise: a
   player who could read a value yesterday lost it today, and the disclosure
   taken when they eventually left recorded the field as already hidden. It now
   captures, but only when a save newly hides something, and only for players -
   section 14 gives a Keeper the campaign-context sheet in full, so they lose
   nothing and there is nothing to preserve.
3. **The newest disclosure is not the richest one.** Once hiding a field
   captures, a person can hold two disclosures of the same character: one from
   before the field was hidden and a later, poorer one from when they left the
   campaign. Reading only the most recent would quietly take back what the first
   preserved. The kept page now lists every moment somebody was shown a
   character and lets them open any of them; the identifier is filtered by
   viewer in the query rather than checked afterwards, so a capture taken for
   somebody else cannot be read by passing its id.
4. **The upgrade migration had no test (section 2).** The suite's database is
   built by migrating an empty server, which proves the clean path and nothing
   else - and every risky part of `0005` is free on empty tables.
   `tests/integration/migration-upgrade.test.ts` starts a server of its own,
   migrates it to `0004`, fills it with the shapes production has, and then
   applies the feature migration.
5. **The rollback procedure existed only as a sentence (section 2, gate item
   8).** `scripts/rollback-0005.sql` reverses the migration, including the rows
   a narrowing enum would otherwise corrupt, and was verified by diffing
   `mysqldump --no-data` of a rolled-back database against one migrated only to
   `0004`: identical. The owners still repeat it against a restored copy of
   production, because a rollback proven on an empty database has not been
   proven.

## 34. Reading the whole diff for mistakes

The feature read end to end, looking for defects rather than for gaps. Six, in
descending order of how much they would have cost.

1. **Assignments could be rewritten after the session they belonged to.**
   Choosing a character for a participant had no check on the session's state,
   and clearing one deletes the assignment row - which is where
   `start_snapshot_id` and `end_snapshot_id` live. A Keeper tidying up a
   finished session would have deleted the record of who played what that
   evening and left two snapshots behind with nothing pointing at them. Now
   refused by `canAssignInvestigators`, with the picker disabled from the same
   rule, and the domain table tested for all seven statuses.
2. **Manual overrides could be read but never written.** Section 8 allows a
   calculated value to be replaced by hand, with a reason, clearly marked; the
   sheet applied one and the projection withheld it with the field it replaced,
   and nothing in the application could create one. Section 27 claimed the
   feature worked. There is now an action, a panel on the played sheet and the
   history the table was built for: setting a value twice closes the first
   decision and records the second, and withdrawing one returns the sheet to the
   rules. Activation seeds hit points and magic points from the settled maxima,
   so a value set by hand before a character is activated is the value they
   start with.
3. **An undone Sanity loss still counted towards the day.** The one-fifth rule
   added up every negative change since the day began, including one somebody
   had explicitly reversed - so a mistyped loss, corrected a moment later, could
   push a character into indefinite insanity over a number nobody at the table
   ever heard. Reversed events and the reversals themselves are now left out;
   recoveries still are not, because the rule counts Sanity lost rather than the
   day's net movement.
4. **The administrator's recovery list showed names their owners had hidden.**
   The page exists to decide who holds a character rather than to read one, and
   says so in its own comment. It now applies the same name redaction the
   campaign list does; an administrator sees the owner and the campaign, which
   is what a recovery needs.
5. **An emergency transfer recorded no continuation.** The consented path points
   the transfer row at the branch it produced; the administrator's path did not,
   so the one hand-over most likely to be questioned later was the one whose
   lineage could not be followed.
6. **Two smaller things.** An imported file dropped the occupation contact that
   an exported one carried, so a character did not survive a round trip intact.
   And a note could not be edited: the action took content and visibility, the
   screen only ever sent the visibility, so a typo was permanent. Editing is a
   revision like any other, which is what keeps a correction from taking back
   what somebody already read.

Also checked and found sound: every action's guard, the binding queries' unlink
and delete filters, the ordering tiebreakers on every "most recent" read, the
snapshot payloads' version checks, branching's column-by-column copy, the
notification enum against what actually raises each type, and every dynamic
translation key against the messages file.
