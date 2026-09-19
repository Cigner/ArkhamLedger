# Architecture decision records

One file per decision, written when it was made and **never edited afterwards**.
Changing a decision means a new record that says which one it supersedes: the
reasoning behind a choice is worth as much as the choice, especially the
reasoning that later turned out to be wrong.

| #                                                           | Decision                                              |
| ----------------------------------------------------------- | ----------------------------------------------------- |
| [0001](0001-modular-monolith.md)                            | A modular monolith                                    |
| [0002](0002-drizzle-over-sequelize.md)                      | Drizzle rather than Sequelize                         |
| [0003](0003-better-auth-and-dal-boundary.md)                | Better Auth, with authorization in the data layer     |
| [0004](0004-poll-per-session-scheduling.md)                 | Availability is asked per session                     |
| [0005](0005-aggregate-visible-identity-hidden.md)           | Aggregate visible, identity hidden                    |
| [0006](0006-custom-availability-grid.md)                    | The availability interface is built, not borrowed     |
| [0007](0007-base-ui-over-radix-primitives.md)               | Base UI primitives, Radix colour scales               |
| [0008](0008-mysql-queue-instead-of-redis.md)                | The queue is a table                                  |
| [0009](0009-weighted-scoring-over-csp-solver.md)            | Weighted scoring, not a solver                        |
| [0010](0010-utc-instants-with-local-denormalization.md)     | Instants are canonical, local time sits beside them   |
| [0011](0011-quorum-counts-players.md)                       | Quorum counts players, not participants               |
| [0012](0012-bundled-worker-and-split-data-layer.md)         | The worker is bundled, and its data layer is split    |
| [0013](0013-versioned-declarative-investigator-rulesets.md) | Investigator rules are versioned declarative packages |

## Format

```markdown
# ADR-000N: One line naming the decision

**Status:** Proposed | Accepted | Superseded by ADR-000M · date

## Context

What was true when this was decided.

## Decision

What was decided.

## Alternatives

What else was considered, and what specifically was wrong with it.

## Consequences

What this bought and what it costs, including the costs discovered later.
```
