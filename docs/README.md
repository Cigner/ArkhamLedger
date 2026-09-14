# Documentation

Reference material for somebody joining this code, including whoever wrote it
six months from now. It explains _why_ and _how it fits together_; signatures
and types are read from the code, which does not go stale.

## Start here

| If you want to                      | Read                                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Understand the system               | [architecture/overview.md](architecture/overview.md)                                                                                    |
| Run it locally                      | [development/getting-started.md](development/getting-started.md)                                                                        |
| Add something                       | [development/adding-a-module.md](development/adding-a-module.md) · [architecture/extension-points.md](architecture/extension-points.md) |
| Deploy or fix a deployment          | [operations/deployment.md](operations/deployment.md) · [operations/troubleshooting.md](operations/troubleshooting.md)                   |
| Know why something is the way it is | [adr/](adr/)                                                                                                                            |
| Speak the domain's language         | [product/glossary.md](product/glossary.md)                                                                                              |

## Architecture

| Document                                             | Covers                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| [overview](architecture/overview.md)                 | The problem, the shape, the technology and what is deliberately absent         |
| [modules](architecture/modules.md)                   | Boundaries, the dependency rule, how it is enforced, the session state machine |
| [data-model](architecture/data-model.md)             | Every table, its indexes and the reasoning                                     |
| [authentication](architecture/authentication.md)     | Activation, passwords, sessions, rate limiting                                 |
| [authorization](architecture/authorization.md)       | Roles, the matrix, the data-layer boundary, availability privacy               |
| [availability](architecture/availability.md)         | Time, zones, daylight saving, the answering interface                          |
| [scheduling](architecture/scheduling.md)             | The algorithm, with the worked example                                         |
| [notifications](architecture/notifications.md)       | The outbox, channels, retries, scheduled jobs                                  |
| [frontend](architecture/frontend.md)                 | Routing, state, mutations, and things learned the hard way                     |
| [design-system](architecture/design-system.md)       | Colour, type, motion, texture, contrast                                        |
| [extension-points](architecture/extension-points.md) | The four seams, and what is deliberately not abstracted                        |

## Decisions

[adr/](adr/) — twelve records, immutable. The reasoning matters as much as the
choice, especially where it later turned out to be wrong.

## Reference

- [api/server-actions.md](api/server-actions.md) — every action, its input, its
  authorization
- [operations/environment-variables.md](operations/environment-variables.md)
- [operations/backup-restore.md](operations/backup-restore.md)
- [development/conventions.md](development/conventions.md) — how code here is
  written, and why
- [development/testing.md](development/testing.md) — what each kind of test
  proves, and what is not covered

## Rules for this directory

1. **Documentation changes in the same commit as the code it describes.**
   Documentation kept elsewhere is stale within a month.
2. **An ADR is never edited.** Changing a decision means a new record naming the
   one it supersedes.
3. **No duplication of the code.** If a signature would answer the question, the
   answer is in the code.
4. **Every example is real** — copied from working code or a passing test, never
   invented.
