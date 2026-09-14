# Availability and time

## Two representations, on purpose

Every answer is stored twice over: as the **instant the hour begins**
(`slot_start_utc`) and as the **local date and hour** it appeared as
(`local_date`, `local_hour`).

The instant is the canonical key. It is unambiguous, it sorts chronologically,
and it survives daylight saving without interpretation. The local pair exists so
the grid can be rendered and a row can be read by a human without converting
anything.

`src/lib/datetime/slots.ts` is the only module in the application that converts
between the two. That is what keeps daylight saving out of the algorithm, the
queries and the interface.

## The two days a year

```
Europe/Warsaw, 29 March 2026 — clocks go forward
  local hours 0,1,3,4,5   → 5 slots for a 0–6 grid; 02:00 never happens

Europe/Warsaw, 25 October 2026 — clocks go back
  local hours 0,1,2,2,3,4 → 7 slots for a 0–6 grid; 02:00 happens twice,
                            distinguished by instant and by repeatIndex
```

The generator walks instants from the true start of the local day rather than
assuming 24 hours, so a transition day yields the number of hours that actually
exist. Both nights are covered by tests that use the real generator, not a
fixture — a fixture that invents 24 hours would pass while production failed.

## How people answer

Answers are **one range per day**: a state (`YES` / `IF_NEED_BE` / `NO`) and,
when the state is positive, a start and end hour.

That constraint is deliberate. A session runs from its start to the end of the
evening with a minimum length, so "free 16–17 and 20–22" is expressible but
useless — no session fits in it. `availability/domain/ranges.ts` converts
between ranges and hourly cells in one place, so relaxing the rule later is a
change to one file and no migration.

Reading the cells back is tolerant of data the current interface cannot produce
— a fragmented answer written directly, say — by taking the outer bounds of the
strongest state present. Losing the gap is acceptable; silently dropping the
whole answer would not be.

## The answering interface

A calendar of evenings, not a grid of hours.

- **Wide screens**: a month-first calendar, Monday aligned, so thirty dates read
  as five rows instead of thirty near-identical lines.
- **Below 768px**: the same dates as a list, because seven columns would put
  every target under the minimum touch size.
- **One press answers an evening**; pressing again cycles free → at a push → not
  free → blank.
- **A second, always-visible button** on each date opens that evening's hours.

There is no drag-to-paint and no long-press. Drag on a phone competes with the
scroll, and on iOS Safari it deselects blocks that were already chosen — the
documented reason people abandon When2Meet halfway through. A long-press is
invisible until you already know about it, and a control that only appears on
hover cannot be reached by touch at all.

Nothing autosaves. Availability is a considered answer rather than a stream of
edits, and a save somebody pressed is a save they know happened.

## Aggregation

`availability/domain/aggregate.ts` produces counts and nothing else. No
identifier appears in its output types, which is what makes the result safe to
hand to a player.

The weakest-hour rule appears here as well as in scheduling: a participant
counts towards a window only if they are free for the whole of it. Somebody free
for five hours of a six-hour session cannot attend it.

## Reading a clock elsewhere

Any time rendered in a component that runs on both the server and the client
must state its zone explicitly. Without it the server formats in the server's
zone and the browser in the reader's, React finds two different strings for one
element, and the page is thrown away and re-rendered. That is not theoretical —
it happened on the notifications list and is why `lib/datetime/format.ts` exists
with one `formatWindow` used everywhere.

The same module prints an evening that runs to midnight as ending at `24:00`.
`00:00` is the same instant and reads as ending twelve hours before it began.
