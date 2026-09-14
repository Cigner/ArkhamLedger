# Adding a module

A worked recipe. Assume a `characters` module — investigator sheets attached to
a campaign.

## 1. Decide whether it is a module

A module owns a noun that has its own rules, its own tables and its own
permissions. If it is a new screen over existing nouns, it belongs in an
existing module.

## 2. Schema

`src/db/schema/character.ts`:

```ts
export const character = mysqlTable(
  'character',
  {
    id: idColumn().primaryKey(),
    campaignId: idColumn('campaign_id')
      .notNull()
      .references(() => campaign.id, { onDelete: 'cascade' }),
    userId: idColumn('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index('ix_character_campaign').on(t.campaignId)],
)
```

Re-export from `src/db/schema/index.ts` — the relational query builder needs
every table in one object. Then `npm run db:generate` and rename the generated
file to something a human can read.

## 3. Domain

```
modules/characters/domain/
├── types.ts       DTOs, one per use case
├── rules.ts       pure functions returning Result<T>
├── constants.ts   limits and policy, each with a reason
└── schemas.ts     Zod, shared by client and server
```

Nothing here imports anything with I/O in it. Write the tests alongside — this
is the layer where they are cheap.

## 4. Data

```ts
import 'server-only'

export async function listCharacters(campaignId: string): Promise<CharacterDto[]> {
  await requireCampaignMember(campaignId)

  const rows = await db
    .select({/* only what the DTO needs */})
    .from(character)
    .where(and(eq(character.campaignId, campaignId), isNull(character.deletedAt)))

  return rows.map(toDto)
}
```

Three rules: authorize first, select columns rather than rows, and return DTOs.

**If the worker will ever call one of these functions**, put the guarded reads
and the plain writes in separate files — see
[ADR-0012](../adr/0012-bundled-worker-and-split-data-layer.md).

## 5. Actions

```ts
'use server'

export const createCharacter = authActionClient
  .metadata({ name: 'character.create' })
  .inputSchema(createCharacterSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireCampaignMember(parsedInput.campaignId)

    const allowed = canAddCharacter(/* … */)
    if (!allowed.ok) throw new DomainRuleError(allowed.error.key)

    const now = new Date()
    const result = await db.transaction(async (tx) => {
      const created = await insertCharacter({ /* … */, now, executor: tx })
      await recordAudit({ actorId: ctx.user.id, action: 'character.created', /* … */ }, tx)
      return created
    })

    revalidatePath(`/campaigns/${parsedInput.campaignId}/characters`)
    return result
  })
```

Validate, authorize, apply the rule, write in one transaction with its audit
entry and any notification, then revalidate.

## 6. UI

`modules/characters/ui/` for anything that knows what a character is;
`components/ui/` for anything that does not. The page is thin:

```tsx
export default async function CharactersPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params
  const characters = await guardPage(() => listCharacters(campaignId))

  return <CharacterList characters={characters} />
}
```

## 7. Navigation

Add the tab to `campaign-tabs.tsx`, gated on role if it needs to be. Hiding a
tab is presentation; the route still enforces the rule itself.

## 8. Tests

| Layer   | What to assert                                  |
| ------- | ----------------------------------------------- |
| domain  | Every rule, including the failure paths         |
| data    | That a non-member is refused, on every function |
| actions | Integration, including one race if there is one |
| ui      | Only where behaviour is non-obvious             |

## 9. Checklist

- [ ] `domain/` imports nothing with I/O
- [ ] every `data/` function authorizes before it queries
- [ ] every action re-verifies rather than trusting its caller
- [ ] DTOs carry no field the viewer must not see
- [ ] mutations that touch two tables are in one transaction
- [ ] `npm run lint` passes — that is where the boundaries are checked
- [ ] the seed includes the new module, so it can be looked at
