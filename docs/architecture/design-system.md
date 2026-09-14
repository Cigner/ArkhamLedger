# Design system

## Identity

The archive of Miskatonic University, around 1925. Not "horror" — documents
somebody would rather had stayed unread. Restraint carries it further than
dripping blood: the mood comes from spacing, rule lines, small capitals and a
narrow palette, never from a decorative typeface.

Dark only.

## Colour

Three 12-step scales generated with the Radix Colors generator, each with a dark
ramp and alpha variants:

| Scale      | Seed                              | Used for                                  |
| ---------- | --------------------------------- | ----------------------------------------- |
| `ink`      | cool near-black with a green cast | surfaces, borders, text                   |
| `sanguine` | muted oxblood                     | primary actions, errors, "unavailable"    |
| `candle`   | restrained brass                  | highlights, "best date", the heatmap ramp |

Step meanings follow Radix: 1 page, 2 subtle surface, 3–5 element backgrounds,
6–8 borders, 9–10 solid fills, 11 low-contrast text, 12 high-contrast text.

Tokens are declared in `design-system/tokens.css` under `@theme static`. The
`static` matters: Tailwind prunes variables that do not appear literally in the
source, and heatmap steps are chosen at run time.

Three token decisions that only appear once you build the thing:

- **`--color-text-on-accent` and `--color-text-on-candle` are separate tokens.**
  One "on accent" colour cannot serve both a dark oxblood fill and a light brass
  one.
- **The focus ring is a pair** — an inner dark ring and an outer light one —
  because a single ring disappears over a dense heatmap cell or the grain layer.
- **`--color-scrim` is its own dark alpha.** The modal backdrop used a light
  neutral alpha and visibly _lightened_ the page behind the dialog.

## Contrast

Not a claim, a test suite. `tests/unit/design-system/contrast.test.ts` reads the
real token values and asserts:

- body text at least 7:1 against its surface — above the 4.5:1 threshold,
  because dark mode needs the headroom;
- secondary text at least 4.5:1;
- every border, selected state, focus ring and heatmap step at least 3:1 against
  its neighbour.

It found seven failures the first time it ran.

## Typography

| Role      | Face            | Rule                                                                              |
| --------- | --------------- | --------------------------------------------------------------------------------- |
| Display   | Cinzel          | Roman inscriptional capitals; 28px and up only, tracking 0.08em                   |
| Body      | Spectral        | Serif designed for screens, large x-height                                        |
| Interface | Inter           | `font-variant-numeric: tabular-nums` mandatory on anything time-shaped            |
| Ornament  | IM Fell English | Three words at most, 28px and up; never a control label, an error, or a grid cell |

All SIL OFL, all self-hosted with `next/font/local` — no external font requests,
and a simpler CSP for it.

Blackletter and script faces are banned outside a possible logotype. They have
extremely low character differentiation and are named repeatedly as a barrier
for dyslexic and low-vision readers.

Dark-mode correction: light text on a dark ground looks optically heavier, so
weights drop one step and line height is 1.65 rather than 1.5.

## Shape and motion

Radii are deliberately small — 2px for inputs and cells, 3px for buttons, 4px
for cards, full only for avatars. Heavy rounding reads as modern SaaS, which is
the opposite of the intent; the "designed" quality comes from borders and corner
ornaments instead.

| Duration | Used for           |
| -------- | ------------------ |
| 80ms     | immediate feedback |
| 140ms    | hover and focus    |
| 220ms    | popovers           |
| 380ms    | dialogs            |
| 8s       | ambient drift      |

Every ambient motion stops under `prefers-reduced-motion: reduce`. Nothing
flashes more than three times a second, which is a WCAG 2.3.1 requirement and a
real photosensitivity risk.

## Texture

Grain is generated with an SVG `feTurbulence` filter — no network cost, scales
to any viewport, and one CSS variable controls its intensity (0.03–0.06).

Three rules keep it from hurting legibility: it lives on the page layer and
never under text directly; contrast is measured against the _brightest_ pixel of
the texture rather than its average; and it is switched off entirely under
`prefers-reduced-transparency` or `prefers-contrast: more`.

## Icons

**lucide-react**, and only lucide-react. It was already a dependency; a second
icon set is the usual way an icon system rots, because two sets never agree on
weight, optical size or metaphor.

It suits the setting better than it first appears. At `size-4` with
`strokeWidth={1.5}` the geometry reads as fine engraving rather than as a mobile
app — the same reason the radii are 2–4px and the rules are hairlines.

Conventions:

| Where                          | Size                  | Notes                                    |
| ------------------------------ | --------------------- | ---------------------------------------- |
| Inside a button, beside a word | `size-4`              | `aria-hidden`; the word is the name      |
| Page heading                   | `size-6`, stroke 1.5  | Decorative; the heading text is the name |
| Card title, tab, inline meta   | `size-4`              | Muted colour unless it carries a state   |
| Empty state                    | `size-8`, stroke 1.25 |                                          |

**Icon-only controls** use `IconButton`, which requires a `label`. That label
becomes both the accessible name and the tooltip, so the control works for
somebody reading the screen, hovering a mouse, or listening to it. A tooltip is
unreachable by touch, which is why the label must exist as a _name_ and not only
as a hint.

Icon-only is for dense places — a table row, a card corner — where a word per
action turns a scannable list into a wall. Everywhere else a button says what it
does in words: an icon alone is a guess until you have learnt it.

## Primitives

Generated once with shadcn/ui in a throwaway project, then rewritten. What was
kept is the composition shape and the Base UI wiring; what was replaced is every
visual decision. `/dev/design-system` renders all of them on one page in
development, which is where three of the bugs above were found.
