# Testing

521 tests: 418 unit, 103 integration. The split is not about coverage, it is
about what each kind can prove.

| Kind        | Tool                          | Proves                         | Cost                                           |
| ----------- | ----------------------------- | ------------------------------ | ---------------------------------------------- |
| Unit        | Vitest, jsdom                 | Logic, in isolation            | ~1s for all of them                            |
| Integration | Vitest + Testcontainers MySQL | What only a real database does | ~40s including container start                 |
| Manual      | A browser and the seed        | What only rendering shows      | Minutes, and it finds things the others cannot |

```bash
npm test                  # unit
npm run test:integration  # real MySQL
npm run test:all          # both
```

## What unit tests cover

The domain layer, which is pure and therefore trivially testable:

- **Scheduling** (54 tests). Hard constraints, the weakest-hour rule, weights,
  tie-breakers, both clock-change nights, determinism over a hundred runs and a
  reversed participant order, a ninety-day search under 50 ms, and the worked
  example asserted to the exact decimal.
- **Availability.** Range and cell conversion, aggregation, the answering
  behaviour as a hook with no DOM.
- **Sessions.** The transition table over all 36 status pairs, publication
  rules, quorum, ICS generation including octet-counted folding.
- **Notifications.** Wording for all ten types, the retry schedule, channel
  selection.
- **Design system.** Contrast computed from the real token values.

Time is always a parameter. `domain/` cannot read a clock — ESLint forbids it —
so deadline behaviour is pinned at exact boundaries rather than approximately
near them.

## What integration tests cover

Things a unit test cannot observe:

- **Authorization**, asserted on the payload rather than on the render. A
  screenshot of a page that happens not to show names proves nothing about the
  data behind it.
- **Race conditions.** Two people claiming the last invitation seat produce
  exactly one member.
- **The queue.** A claim cannot hand one row to two workers; a row abandoned by
  a killed process comes back; the unique constraint makes a duplicate
  impossible rather than unlikely.
- **The join between Temporal and MySQL.** An availability row comes back with
  milliseconds and the grid generator produces instants without them; a mismatch
  reports a group that simply cannot meet, and nothing throws.
- **Whole worker jobs.** Closing a deadline ranks the answers, tells the Keeper,
  and does nothing at all on a second pass.

The container is configured with the production flags —
`--character-set-server`, `--collation-server`, `--default-time-zone`. Testing
against `utf8mb4_general_ci` while production runs `utf8mb4_0900_ai_ci` gives
tests that lie about sorting and uniqueness.

## Regression tests

Where a test exists because something broke, its comment says so. Those are the
ones to read first:

```ts
/*
 * Aggregated through a join rather than correlated subqueries. Not a
 * performance preference: Drizzle renders a correlated column reference without
 * its table prefix, and session_participant also has an `id`, so the count was
 * silently zero.
 */
```

## Manual verification

Every phase of this project produced at least one defect that typecheck and
tests did not catch and looking at the page did. A grid column offset by a
hidden header. Counts that were all zero. An invisible active tab state. A
permission denial rendered as a 500. A page thrown away on every load by a
hydration mismatch.

The checks worth doing by hand, with the seed loaded:

1. **The availability calendar at 375px.** One press answers, a second changes
   firmness, the clock opens the hours, the page still scrolls.
2. **Two browsers, two roles.** An Investigator sees counts; a Keeper sees
   names. Check the network payload, not the page.
3. **The diagnostic screen.** Make somebody required, remove their availability,
   search. It should name them.
4. **A whole loop.** Publish, answer, search, confirm — then look at the
   notification, the email in the log, and the `.ics` the calendar link returns.
5. **Keyboard only.** Tab through the availability calendar and the settings
   forms. Focus must always be visible.

## Not covered

- **End-to-end.** Playwright is configured; no scenarios are written. The
  integration tests cover the data paths and manual checks cover the rendering,
  which leaves the wiring between them — the thing E2E is actually for — untested.
- **The real SMTP relay.** Development uses the logging transport. The mail port
  is exercised; the home server's relay is not.
- **A real Discord webhook.** The dispatcher and its failure classification are
  written and the test action exists, but no message has been posted to a real
  channel.
- **Load.** A dozen users. There is nothing to measure.
