# ADR-0006: The availability interface is built, not borrowed

**Status:** Accepted · 2026-09-13 · Revised in practice, see Consequences

## Context

Collecting availability is the one interaction every user performs, most of them
on a phone. Existing components exist (When2Meet-style grids, calendar pickers,
scheduling widgets).

Research on the generic tools is consistent: drag-to-paint on a phone is the
main reason people abandon When2Meet halfway through. The drag is interpreted as
a scroll, iOS Safari deselects blocks that were already chosen, and pinch-zoom
registers as an edit. Groups that include phones routinely get incomplete
answers.

## Decision

Build it. No third-party grid, no calendar library.

## Alternatives

**A scheduling widget.** Brings its own visual identity, its own accessibility
decisions, and its own idea of what a time slot is. Fighting it costs more than
starting from primitives.

**A plain list of checkboxes.** Honest, and unusable at thirty dates.

## Consequences

- Complete control over the touch story, which is the whole point.
- The interface was rebuilt twice during the project, which a library would have
  made impossible rather than merely expensive:
  1. A drag-to-paint hour grid. Correct on a desktop; at the default month-wide
     window it gave 20px cells on a phone, below any usable target.
  2. A calendar of evenings with a global "show hours" mode. Better, but the
     rare case (I leave at eight) still shaped the layout for the common one.
  3. **Current:** a calendar of evenings where one press answers a date, a
     second press changes how firm that is, and an always-visible second button
     on each date opens that evening's hours in a dialog.
- No long-press and no hover-reveal trigger: the first is invisible until you
  already know about it and conflicts with the OS context menu, the second
  cannot be reached by touch at all.
- The state machine is a hook with no DOM dependency, so the answering
  behaviour is unit-tested without rendering anything.
