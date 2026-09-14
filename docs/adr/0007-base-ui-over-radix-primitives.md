# ADR-0007: Base UI primitives, Radix colour scales

**Status:** Accepted · 2026-09-13

## Context

The original proposal said "Radix UI", which names two unrelated things: the
headless primitives and Radix Themes. Separately, shadcn/ui changed its default
headless layer from Radix Primitives to Base UI (the MUI team's) in July 2026.
Radix Primitives are not deprecated and shadcn dual-ships both.

## Decision

- **Base UI** for headless behaviour, generated once through shadcn/ui and then
  rewritten visually.
- **`@radix-ui/colors`** — a package of CSS files, 12-step scales with dark and
  alpha ramps — as the basis for our own three scales.
- **Not** Radix Themes.

## Alternatives

**Radix Primitives.** Equally fine. Base UI is shadcn's default for a greenfield
project, so it is the path with the least friction when regenerating a
primitive.

**Radix Themes.** Brings a complete visual identity with its own token system.
Overriding it to reach a 1925 archive costs more than starting from unstyled
primitives.

**No primitive library.** Dialogs, selects and popovers have focus trapping,
scroll locking, typeahead and ARIA wiring that take weeks to get right and are
invisible when correct.

## Consequences

- Keyboard behaviour and ARIA come from the primitive; every visual decision is
  ours.
- Base UI's conventions have to be learned, and one cost real time: it marks
  active state with `data-active`, not `data-selected`, so every tab in the
  application had an invisible active state until a rendered page was looked at.
- A primitive can be regenerated from shadcn and re-skinned rather than
  hand-written.
