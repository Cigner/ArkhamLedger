# ADR-0005: Aggregate visible, identity hidden

**Status:** Accepted · 2026-09-13

## Context

Who is allowed to see who said they were busy? Doodle shows everybody
everything, which quietly makes availability a social performance: people answer
what looks reasonable rather than what is true, because the group is watching.

## Decision

- An Investigator sees counts and ranked windows, never names.
- A Keeper sees names against answers, because choosing a date means weighing
  who is only free at a push.
- Per-hour counts are withheld below three respondents.
- Priorities are never shown to the person they are about.

## Alternatives

**Everybody sees everything.** Simpler, and it changes what people answer.

**Nobody sees anything but their own.** Removes the one thing a player actually
wants to know: whether the group can play at all.

## Consequences

- Two separate queries, not one query with a flag. The aggregate DTO has no
  `userId` field at all, so it cannot leak by accident — the type does not allow
  it.
- The three-respondent threshold is arithmetic, not squeamishness: with two
  answers, one count plus your own identifies the other person exactly.
- The scheduling screen is Keeper-only in its entirety, since a proposal
  explains itself by naming people.
- Tests assert the _shape_ of the aggregate rather than its values, and assert
  refusal on every path to named data.
