# ADR-0011: Quorum counts players, not participants

**Status:** Accepted · 2026-09-14

## Context

Quorum is the smallest number of people for whom a session is worth running.
The default is `floor(investigators / 2) + 1`, derived from the number of
players.

The code did not agree with itself. The default was computed from players, but
`validateQuorum` compared against _all_ participants and `canPublish` did the
same. That let a Keeper set a quorum of five on a campaign with four players and
one Keeper — a threshold no set of answers could ever satisfy. The session would
collect availability for a week and then report that no date works, with nothing
on screen explaining why.

## Decision

Quorum is counted against non-Keeper participants everywhere: in the default, in
validation, in `canPublish`, and in the scheduling algorithm's third hard
constraint.

## Alternatives

**Count everybody, including Keepers.** Consistent, and it means a threshold of
three is met by the Keeper plus two players. That is not what "three people at
the table" means to the person who chose the number.

**Leave it ambiguous and document it.** The bug above is what ambiguity produced.

## Consequences

- A Keeper is a hard constraint, never a contribution to quorum. They have to be
  there for the session to exist at all.
- `countPlayers()` is a named function in `sessions/domain/rules.ts` rather than
  an inline filter, so the definition has one home.
- The development seed had to change: two of its campaigns asked for a quorum
  only reachable by counting Keepers.
- The seed also revealed a second bug of the same family — it flagged a
  participant as a Keeper from a hardcoded list of names rather than from
  campaign membership, so somebody who runs one campaign was a hard constraint
  on sessions of another he merely played in.
