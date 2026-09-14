# ADR-0010: Instants are canonical, local time is denormalised beside them

**Status:** Accepted · 2026-09-13

## Context

An availability answer is about a wall-clock hour in a place — "Thursday at six"
— but comparing, sorting and measuring answers requires an unambiguous point in
time. Twice a year those disagree: one local day has 23 hours, another has 25,
and one local hour happens twice.

## Decision

Store both. `slot_start_utc` is the canonical key; `local_date` and `local_hour`
sit beside it, denormalised. `src/lib/datetime/slots.ts` is the only module that
converts between them.

A session copies its campaign's time zone when it is created, so changing the
campaign's zone later cannot reinterpret answers already given.

## Alternatives

**UTC only.** Every render and every debugging session becomes a conversion, and
the duplicate hour on a transition day cannot be labelled.

**Local time only.** The repeated hour is ambiguous and the missing one is
representable, which is exactly backwards.

**A library that models local time as a string.** That is what `local_hour` is,
next to the instant that disambiguates it.

## Consequences

- The grid generator walks instants from the true start of a local day rather
  than assuming 24 hours, so transition days produce the hours that exist.
- Daylight saving is confined to one module. The scheduling algorithm counts
  slots and never converts anything.
- Both nights are covered by tests that use the real generator — a fixture
  inventing 24 hours would pass while production failed.
- The two representations can drift if anything else writes slots. Nothing else
  does, and `UNIQUE(session, user, slot_start_utc)` catches a duplicate.
- A matching join hazard: MySQL returns a `DATETIME` that stringifies with
  milliseconds while Temporal produces instants without them. Comparing the two
  raw silently matches nothing, so both sides are canonicalised through Temporal
  and there is an integration test for it.
