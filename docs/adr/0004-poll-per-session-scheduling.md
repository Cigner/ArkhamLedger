# ADR-0004: Availability is asked per session

**Status:** Accepted · 2026-09-13

## Context

Availability can be modelled as a standing profile ("I am free on Thursdays") or
as a question asked for one session ("when are you free between the 5th and the
19th").

## Decision

Per session. Each session carries its own search window, grid hours, minimum
length, quorum and deadline, and collects answers against those.

## Alternatives

**A standing profile.** Answer once, never again. It decays silently: somebody
takes a new job, their profile still says Thursdays, and a date is chosen that
nobody can make. Recovering from that requires noticing it, which nobody does.

**Both, with the profile pre-filling the session.** The right end state, and it
is on the roadmap. It needs the session-scoped model underneath it anyway,
because the interface has to distinguish "inherited" from "confirmed".

## Consequences

- Answers are always about a real, current question.
- Repeated asking is the cost. It is mitigated: presets, a "same as last time"
  button that maps a previous answer onto this window's weekdays, and one
  reminder per person per session — never two.
- `availability_slot` grows per session rather than per person. On the order of a thousand rows for a
  month's window and six people, which is nothing.
