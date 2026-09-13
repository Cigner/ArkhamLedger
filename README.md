# Arkham Ledger

Session scheduling for tabletop Call of Cthulhu campaigns. Self-hosted, private,
single deployment.

The problem it solves is not running a campaign — it is agreeing on a date.
Players mark their availability on a grid, the Keeper sees an aggregate, and a
deterministic ranking proposes the windows that actually work given required
players and a quorum.

## Requirements

- Node.js 22+
- Docker with Compose v2

## Getting started

```bash
cp .env.example .env   # then fill in the generated secrets it describes
npm install
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
npm run db:migrate
npm run dev
```

The application is then on <http://localhost:3000>, the database on port 3306.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (standalone output) |
| `npm run lint` | ESLint, including the architectural boundary rules |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Unit tests |
| `npm run test:integration` | Integration tests against a MySQL testcontainer |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run db:generate` | Generate a migration from the schema |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Create the first administrator (idempotent, safe on every deploy) |
| `npm run db:seed:dev` | **Wipe** and rebuild the development fixture |

## Development data

`npm run db:seed:dev` rebuilds a fixture that covers every status a record can
hold, so each screen, badge and rejection page is reachable without constructing
the state by hand: ten accounts including one awaiting activation and one
disabled, five campaigns across every status, a member who left, six invitations
covering each way one can be refused, and seven sessions across the lifecycle.

It prints the shared password, the activation link and every invitation link —
those exist nowhere else once generated, since only their digests are stored.

It truncates every table, including the administrator created by `db:seed`, and
refuses to run unless `NODE_ENV` is not production and the database host is local.

## Architecture in one paragraph

A modular monolith on Next.js with the App Router. Each domain under
`src/modules/` is split into `domain/` (pure rules, no I/O), `data/` (queries and
authorization), `actions/` (orchestration) and `ui/`. The boundaries between
those layers are enforced by ESLint as errors, not conventions. Authorization
lives in `data/` and is re-verified in every Server Action; `src/proxy.ts` only
redirects anonymous visitors and is explicitly not a security boundary.

Full documentation is in [`docs/`](./docs); start with
[`docs/architecture/overview.md`](./docs/architecture/overview.md).
