# ADR-0009: Weighted scoring, not a solver

**Status:** Accepted · 2026-09-13

## Context

Choosing a session date from constrained availability is a scheduling problem,
and scheduling problems have solvers.

## Decision

Enumerate every candidate window, reject those that break a hard constraint,
score the rest with priority weights, and order by a deterministic tie-breaker
chain.

## Alternatives

**A CSP or ILP solver (OR-Tools).** Three problems, in order of importance:

1. It returns _a_ solution. A Keeper needs a ranked list to choose from.
2. Its answer cannot be explained in a sentence. "Thursday, because Anna is
   required and only free from six, and Kasia can manage it at a push" is the
   product; "the solver said so" is not.
3. The search space is around 630 candidates at the widest window allowed.
   Brute force takes under 50 ms.

**Learning from historical preferences.** Non-deterministic, unexplainable, and
needs data that does not exist.

## Consequences

- Every window can be explained, and the explanation is built from the same
  numbers that produced the ranking.
- Testing is a table of cases rather than a fixture of solver output. 54 unit
  tests cover the constraints, the weights, both clock-change nights,
  determinism over a hundred runs and a reversed participant order, and the
  worked example to the exact decimal.
- Tuning is editing two constants and bumping `ALGORITHM_VERSION`.
- Performance is bounded by the widest window a Keeper may ask for, which is
  capped at 90 days for exactly this reason.
