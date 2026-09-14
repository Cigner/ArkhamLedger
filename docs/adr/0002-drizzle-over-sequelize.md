# ADR-0002: Drizzle rather than Sequelize

**Status:** Accepted · 2026-09-13

## Context

The original stack proposal named Sequelize. Before committing, its state was
checked.

- v6.37.8 (March 2026) was the only v6 release of the year, and it was a
  security fix.
- v7 has been in alpha since 2022, has never reached beta, and `sequelize-cli`
  does not support it — a future migration would have no tooling.
- TypeScript support is bolted on (`InferAttributes`, `declare`), with `any` at
  the edges.
- There is no Better Auth adapter, which would mean two migration tools against
  one database.

## Decision

Drizzle ORM with `drizzle-kit` for migrations.

## Alternatives

**Sequelize.** The momentum and typing problems above.

**Prisma.** Good DX, but a separate schema language and a generated client, and
its query builder hides SQL at exactly the point where this application needs to
read it — the availability aggregates.

**Plain SQL.** Tempting for the aggregates and miserable for everything else.

## Consequences

- Schema is TypeScript; types are inferred rather than declared twice.
- SQL stays visible, which matters for the queries that aggregate availability.
- One data-access stack: Better Auth's own tables are declared in our schema and
  migrated by our tool.
- Drizzle's rough edges are ours to know. One cost real money already: a
  correlated subquery renders without its outer table prefix, and because
  `session_participant` also has an `id`, every count silently came back zero.
  Fixed by rewriting as a join, with a regression test that runs the real query.
