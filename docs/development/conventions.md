# Conventions

## Language

English everywhere in the repository: code, comments, commits, error keys,
interface strings. The team speaks Polish; the code does not.

## Comments

**Module headers and exported functions. Never individual lines inside a
function.**

A file opens with a block saying why it exists:

```ts
/**
 * Session scheduling.
 *
 * Ranks every window the session could actually run in, and explains both the
 * ones that survived and the ones that did not. Pure and deterministic: no
 * clock, no database, no randomness, no dependence on the order participants
 * happen to arrive in.
 */
```

An exported function gets its contract, not its implementation:

```ts
/**
 * What one participant is worth over a whole window: their weakest hour.
 *
 * The minimum rather than the mean, because a session is not divisible.
 * Somebody free for five hours of a six-hour session cannot attend it;
 * averaging would admit them at 0.83 and quietly build a date around a person
 * who has to leave before the end.
 */
```

A comment inside a function body is allowed only when it carries knowledge that
is not in the code — a reason, an external constraint, a library's misbehaviour:

```ts
// Correlated subqueries render without the outer table's prefix, and
// session_participant also has an `id`, so the join is not an optimisation —
// the subquery silently matched nothing.
```

What never appears: `// increment the counter`, a comment restating a type, a
comment on a schema table saying its own name, or commented-out code. Git
remembers.

A comment inside a function body is usually a sign the function is too long or
badly named. `isKeeperAvailableForCore()` needs no comment; `check(k, c)` needs
one, and that is the evidence its name is wrong.

## SOLID, applied

**Single responsibility** is enforced by directory, not by discipline: domain,
data, actions, ui, each with one job and an ESLint rule stopping it doing
another. The practical test is the word "and" — "validates _and_ sends an
email" is two functions.

**Open/closed** applies at four seams where a second implementation is genuinely
likely; see [extension-points](../architecture/extension-points.md). Everywhere
else, concrete. Abstraction without a second implementation is a cost with no
buyer.

**Liskov** shows up in one rule with teeth: a dispatcher must never throw and
never claim a channel it cannot serve. Failure is a return value, because a
dispatcher that throws takes the worker's whole flush loop down.

**Interface segregation** shows up as DTOs per use case rather than per entity.
`CampaignListItem` is not `CampaignDetail` is not `CampaignSettings`. That is
not duplication — it is the mechanism that makes it impossible for a `userId` to
reach an aggregate that must not carry one.

**Dependency inversion** runs the opposite way to instinct: `domain/` imports
nothing, and everything else imports it. Time and randomness are injected. That
is what makes the scheduling algorithm testable without a database and the
deadline logic testable at exact boundaries.

## Types

- `readonly` on domain inputs. The algorithm cannot mutate what it is given.
- Discriminated unions rather than boolean flags. A new session status breaks
  the build in every place that does not handle it, which is the point.
- `Result<T, E>` for domain rules, exceptions for genuinely exceptional things.
  A rule that returns lets the interface show every problem at once instead of
  the first.
- No magic numbers. Weights, limits, TTLs and grid bounds live in
  `domain/constants.ts` with a comment saying why that number.

## Errors

`AppError` subclasses carry a stable code and an i18n key. Anything else that
reaches the action layer is logged with its stack and reported as a generic
failure with a correlation id the user can quote.

`NotFoundError` is returned for resources the caller is not a member of. Not an
accident — see [authorization](../architecture/authorization.md).

## Tests

A test name is a sentence about behaviour, not about a function:

```ts
it('counts a participant free for all but the last hour as unavailable')
it('never reminds the same person about the same session twice')
it('does not hand the same row out twice')
```

Where a test exists because something broke, the comment says what broke. Those
comments are the most valuable lines in the suite.

## Commits

Subject in the imperative, describing the change from the reader's side. The
body says what was learned, especially where the change was not what was
planned. A commit that fixes something found by running the application says so.

## Definition of done

```bash
npm run typecheck && npm run lint && npm test && npm run test:integration && npm run build
```

and then open the thing and use it.
