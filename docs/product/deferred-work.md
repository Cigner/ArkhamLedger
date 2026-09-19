# Deferred work

Everything this application has decided **not** to build yet, in one place, with
the reason. A plan records what a feature will be; this records what was left
out of it, which is the half nobody writes down and everybody later rediscovers
by arguing about it.

Two rules for this file:

1. **A line leaves here when it is built, not when it is started.**
2. **Every entry says what would have to be true to begin.** "Later" without a
   trigger is how a list becomes wallpaper.

The release-gate items — the manual E2E checklist and the owners' rollback
rehearsal — are not here. They live in section 2 of the
[investigator plan](investigator-management-plan.md) because they are conditions
on a release rather than work that was deferred.

## Promised and not delivered

These were in the agreed scope of the Investigator module and are not built. They
are listed first because they are the only entries here that represent a gap
between what the plan says and what the code does.

| Item                                       | Where it was promised                   | What it needs first                                                                                                                                                        |
| ------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom occupations and skills              | Plan section 3, should-have             | A decision: a narrow version now (a character carries a one-off occupation), or waiting for the ruleset editor, which is the same problem solved properly.                 |
| A notification when a Keeper shares a note | Plan sections 16 and 21, by implication | An event type of its own. Section 21 lists none, and borrowing a neighbour would put "a character was linked to a campaign" in an inbox because somebody wrote a sentence. |
| A pass over UI readability                 | Agreed with the owners during the build | The MVP being finished, which it now is. Deliberately deferred so the work happened once, against real screens, rather than twice.                                         |

## Deferred deliberately, and recorded as decisions

Neither of these is missing. Both were considered, decided against for the first
release, and the reasoning is in section 27 of the plan.

- **Per-skill privacy.** Skills are one visibility key rather than forty-four.
  Opening with four dozen switches would bury the question people actually have,
  which is whether the party can read their sheet. Additive later: the registry
  takes new keys without moving stored data.
- **Campaign-specific visibility.** Visibility is global per Investigator.
  Per-campaign overrides mean a character who is one thing at one table and
  something else at another, which is a real request and a much larger model.

## Planned for a later stage

From section 3 of the plan, under Future. Four of them already have a visible
home in the application — the "Planned investigator tools" panel on a played
sheet names dice, combat, chases and magic, so they read as planned rather than
as missing.

- **In-session dice automation.** The creator and the development phase already
  accept entered rolls and record where each came from, which is the shape this
  has to fit: results drop into many places, so the roller belongs to the
  application rather than to the character sheet.
- **Full combat automation.** The sheet holds weapons, damage, range, attacks,
  ammunition and malfunction today. What is absent is resolution.
- **Chase management.**
- **Detailed insanity episode management.** The thresholds and the flags exist;
  what is absent is the episode itself — what it is, how long it lasts, what
  ends it.
- **Magic, spells, tomes, and artifacts.** Cthulhu Mythos already caps maximum
  Sanity, which is the one place the rules make magic touch a sheet.
- **Portrait and material management.**
- **Campaign-specific house rules.**
- **Import from third-party character tools.** JSON import exists for this
  application's own export; a foreign format is a separate translation problem.
- **Modern and additional eras.** Every Investigator is pinned to an immutable
  ruleset identifier and version precisely so that this can happen without
  touching existing characters.
- **Point-buy, Quick Fire, and other creation methods.** The creation method is
  stored per character, so a new one does not reinterpret old sheets.

## The administrative ruleset editor

Section 26 of the plan, and the largest single item here. It is last on purpose:
it is implemented only once the ruleset model is stable, because an editor is a
promise that the shape it edits will not change.

It would provide draft package creation, editing of skills, occupations and
constraints, JSON Schema validation, comparison against the previous version,
detection of removed or changed identifiers, test Investigator creation,
publication of a new immutable version, activation for new Investigators only,
selection of an older version as the default, and a full audit trail.

It never accepts code or arbitrary formulas. Administrators select only
operations and formula identifiers the domain engine already implements and
tests — which is the same constraint the ruleset packages themselves are under.

## Not part of the Investigator module

Recorded here because they were noticed during the build and have nowhere else
to live.

- **There is no CI.** Section 2 of the plan requires CI to verify both a clean
  database migration and an upgrade from the production schema. Both are now
  covered by tests; nothing runs them automatically.
- **The interface exists only in English** while the group it was built for
  plays in Polish. A product decision rather than a technical one, but one worth
  taking deliberately instead of by omission.
