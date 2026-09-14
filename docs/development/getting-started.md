# Getting started

## What you need

Node 22 and Docker. Nothing else — MySQL runs in a container and no client is
required on the host.

## From a clean checkout

```bash
cp .env.example .env
```

Fill in the four required values. Two of them are generated:

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY — must decode to exactly 32 bytes
```

Then:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
npm install
npm run db:migrate
npm run db:seed:dev
npm run dev
```

The application is on http://localhost:3000. In a second terminal:

```bash
npm run worker:dev
```

## The development seed

Destructive by design: it wipes and rebuilds the whole fixture so the database
always matches the file, rather than accumulating whatever previous runs left
behind. It refuses to run unless `NODE_ENV` is not production **and** the
database host is local.

It prints what it made, including the things that exist nowhere else once
generated:

- **10 accounts**, one password between them, covering every status — active,
  awaiting activation, disabled — and every role, including somebody who runs
  one campaign and plays in another, and somebody who left a campaign.
- **5 campaigns**, one per status.
- **7 sessions**, one per lifecycle state.
- **6 invitations**, one per rejection reason: live, exhausted, expired,
  revoked, personal, and one that joins as a Keeper.
- **A hand-built availability fixture** whose answer was worked out on paper
  before the algorithm existed. Thursday 8 October wins; Sunday 11 October comes
  second with two caveats; Monday the 5th is blocked by a Keeper; Thursday the
  15th has everybody free for only four hours.

Sign in as `eleanor@arkham.test` for the richest view — she owns two campaigns
and keeps a third. `admin@arkham.test` reaches the operations screen.

## Rhythm

```bash
npm test                  # unit, fast enough to run on save
npm run typecheck
npm run lint              # includes the module boundaries
npm run test:integration  # starts a MySQL container; slower
npm run build             # before claiming anything is finished
```

The last one matters more than it looks: `next build` type-checks routes in ways
`tsc` alone does not.

## Before you claim it works

Run it and look at it. Every phase of this project produced at least one defect
that typecheck and tests did not catch and a rendered page did: a grid column
offset by a hidden header, counts that were silently zero, an invisible active
tab state, a permission denial rendered as a 500, and a page thrown away on
every load by a hydration mismatch.

The seed exists so that looking at it takes ten seconds.

## Where things are

| You want to                                  | Look in                                      |
| -------------------------------------------- | -------------------------------------------- |
| Change a business rule                       | `modules/*/domain/`                          |
| Change a query or an authorization check     | `modules/*/data/`                            |
| Change what happens when a button is pressed | `modules/*/actions/`                         |
| Change how something looks                   | `modules/*/ui/` or `components/`             |
| Change the schema                            | `src/db/schema/`, then `npm run db:generate` |
| Change what the worker does                  | `src/worker/jobs/`                           |
| Understand why something is the way it is    | `docs/adr/`                                  |
