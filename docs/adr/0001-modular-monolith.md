# ADR-0001: A modular monolith

**Status:** Accepted · 2026-09-13

## Context

A dozen users in one private group, one server in somebody's house, one person
maintaining it. The domain has clear seams — identity, campaigns, sessions,
availability, scheduling, notifications — and those seams are real regardless of
how the thing is deployed.

## Decision

One deployable application with strictly separated modules, plus one background
worker sharing its image. Boundaries are enforced by ESLint as errors, not by
convention.

## Alternatives

**Services per domain.** Would turn every cross-domain read into a network call
with its own failure mode, and would require a broker, service discovery and
distributed tracing to debug what is currently a stack trace. For twelve users
the operational cost is the entire cost.

**A single layer with no internal boundaries.** Faster for a week. The
scheduling algorithm would end up importing the database, and the thing that
makes it testable — purity — would be gone before anybody noticed.

## Consequences

- One artifact to build, one to deploy, one to roll back.
- A cross-module call is a function call: it either compiles or it does not.
- The boundaries have to be enforced mechanically, because a rule that only
  warns stops being followed within weeks. They are.
- If a module ever has to become a service, the seam it would be cut along
  already exists. This is not expected to happen.
