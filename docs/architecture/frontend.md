# Frontend

## Routing

```
app/
├── (auth)/        sign-in · activate/[token] · forgot-password · reset-password/[token]
├── (app)/         campaigns · campaigns/[id]/{sessions,members,settings}
│                  sessions/[id]/{availability,participants,scheduling}
│                  invite/[token] · notifications · settings
├── (admin)/       admin · admin/users
├── (dev)/         dev/design-system            (development only)
└── api/           auth/[...all] · health · health/worker · sessions/[id]/ics
```

Pages are thin: await the params, call one query through `guardPage`, render a
component. Anything longer than that belongs in a module.

## Server and client

Server Components by default. `'use client'` appears only on leaves that need
interaction — forms, dialogs, the availability calendar, the navigation bar.

Everything dynamic is marked `export const dynamic = 'force-dynamic'`. The
application is per-user and almost entirely dynamic; `cacheComponents` is
deliberately not enabled, because inverting the default would buy nothing here.

### Errors reaching the browser

`lib/page-guards.ts` translates domain errors into the HTTP answers Next can
render:

```ts
export async function guardPage<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (error) {
    if (error instanceof UnauthorizedError) unauthorized()
    if (error instanceof ForbiddenError) forbidden()
    if (error instanceof NotFoundError) notFound()
    throw error
  }
}
```

`forbidden()` and `unauthorized()` need the `authInterrupts` flag, which is on.
Without them every refused permission rendered as a 500 — a denial that looks
like a crash teaches people the application is broken.

## State

| Kind            | Where                                             | Examples                                  |
| --------------- | ------------------------------------------------- | ----------------------------------------- |
| Server state    | Server Components, `revalidatePath` after actions | campaigns, sessions, proposals, the inbox |
| Form state      | `react-hook-form` or plain `FormData`             | every form                                |
| Session         | Better Auth, read server-side                     | who is signed in                          |
| Interface state | Zustand, small separate stores                    | open panels, view density                 |
| Working answer  | a hook local to the availability panel            | the unsaved calendar                      |

Rules for Zustand: never duplicate server data, many small stores rather than
one, select fields rather than whole stores, and `persist` only for interface
preferences.

The availability editor deliberately holds its working state in a hook rather
than a store. It belongs to one panel, it must reset when the session changes,
and a global singleton would leak one session's unsaved answer into another.

## Mutations

Every mutation is a Server Action through `next-safe-action`:

```
actionClient           logging, error mapping, correlation id
  └─ authActionClient  requires a session, injects the user
  └─ adminActionClient requires the global admin role
  └─ publicActionClient explicitly unauthenticated (activation only)
```

`handleServerError` maps an `AppError` to a stable code plus an i18n key, and
anything else to a generic failure logged with its stack and a correlation id
the user can quote.

Client-side validation is user experience only. The server validates again with
the same Zod schema, always.

## Components

```
components/ui/         primitives — know nothing about campaigns
components/patterns/   compositions — PageHeader, EmptyState, ConfirmDialog, nav
modules/*/ui/          domain components — know their own types and nothing else
```

A component in `components/ui/` does not know what a campaign is. A component in
`modules/campaigns/ui/` does not know what a session is.

## Things learned the hard way

- **Base UI marks active state with `data-active`, not `data-selected`.** Every
  tab in the application had an invisible active state until that was found by
  looking at a rendered page.
- **`disabled` drops fields from `FormData`.** Read-only fields use `readOnly`,
  which also reads better to a screen reader.
- **`transition-colors` does not cover `outline-color` or `box-shadow`**, so
  focus rings jumped instead of fading. `transition-interactive` covers all
  three, and the ring is pre-declared transparent so its colour can animate.
- **A popover's z-index belongs on the positioner, not the popup.**
- **A time formatted without an explicit zone renders differently on the server
  and in the browser**, and React throws the page away. Every formatted time
  states its zone.
- **`sr-only` on a grid header removes it from grid flow** and shifts every
  column. Use a plain element with `aria-label`.

## Accessibility

- Visible focus on every interactive element, with an outline that has an offset
  and a colour that survives being drawn over a heatmap cell.
- Pointer targets at least 24px; touch targets at least 44px.
- Colour never carries meaning alone — every state has a glyph or a word beside
  it.
- Heading levels do not skip: the page is `h1`, card titles are `h2`.
- `aria-live` announces finished operations, not individual changes.
- `prefers-reduced-motion`, `prefers-contrast` and `prefers-reduced-transparency`
  are honoured.
