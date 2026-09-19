# ADR-0013: Investigator rules are versioned declarative packages

**Status:** Accepted · 2026-09-18

## Context

An Investigator sheet needs stable Call of Cthulhu 7e facts: characteristic
rolls, skill base values, occupation choices, point formulas, era availability,
and derived-value formulas. Those facts will grow to cover more eras and may
eventually be managed through an administrator interface.

Existing characters must remain reproducible after a rules update. At the same
time, a content package must not be able to execute arbitrary code.

## Decision

Built-in rules are immutable, semantically versioned JSON packages inside the
Investigator domain. Every Investigator is pinned to a package id and version.

Packages contain identifiers, i18n keys, limits, choice constraints, and formula
identifiers. Zod validates every package in tests and before it is exposed to the
application. Formula identifiers resolve to pure TypeScript functions owned by
the domain engine; packages never contain JavaScript or expression strings.

Publishing a changed package creates a new version. It never mutates the
interpretation of an existing Investigator.

## Alternatives

**Hard-code every skill and occupation in TypeScript.** This gives strong static
typing but mixes content with behaviour, makes translation harder, and leaves no
safe path to a future content editor.

**Store the active rules directly in editable database tables.** This makes
editing easy but allows an administrator to change the meaning of historical
characters and complicates deployment before the editor exists.

**Store executable formulas in JSON.** This is flexible but turns content
publishing into arbitrary code execution and makes formulas difficult to audit
and test.

**Store the complete active character sheet as JSON.** This avoids relational
tables but weakens constraints, authorization queries, indexing, and precise
updates. JSON remains appropriate for immutable snapshots, not current state.

## Consequences

- Ruleset history is reproducible and explicit.
- Formula behaviour is type-checked and unit-tested.
- Built-in content changes require a version bump.
- The initial package is maintained in the repository.
- A future administrator editor must publish immutable package versions rather
  than modify an active version.
- Adding a new formula requires a code change even when its parameters are
  content, which is the intended security boundary.
