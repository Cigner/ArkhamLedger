# Arkham Ledger

A self-hosted scheduling tool for tabletop roleplaying campaigns. Built for one
private group of about a dozen people playing Call of Cthulhu in several
independent parties.

It exists because campaigns rarely end in an argument. They end because the
evening after the last one was never arranged, and by the time anybody notices,
too much time has passed to restart. Everything here serves that one problem:

```
account → campaign → members → session → availability → ranked dates → confirmation → notification
```

## What it does

- **Asks everybody when they are free**, one evening at a time, on a phone,
  without a drag gesture that fights the scroll.
- **Works out which evenings would actually work**, ranked and explained, with
  the Keeper and anybody required treated as hard constraints and a quorum below
  which a session is not worth running.
- **Says why when none of them do** — naming who to talk to and what to change,
  which is the part every generic poll leaves to you.
- **Closes its own deadlines**, ranks what came in, and tells the Keeper.
- **Tells everybody the date**, in the application, by email with a calendar
  attachment, and in Discord if the campaign has a channel.
- **Notices when a campaign has nothing planned**, which is the failure it was
  built to prevent.

## Running it

You need Docker and Node 22.

```bash
cp .env.example .env   # then fill it in; see docs/operations/environment-variables.md
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
npm install
npm run db:migrate
npm run db:seed:dev    # ten accounts, five campaigns, seven sessions
npm run dev
```

The seed prints the accounts it created, the password they share, and the
one-time activation and invitation links that exist nowhere else.

```bash
npm run worker:dev     # in a second terminal: deadlines, reminders, delivery
```

## Documentation

| Where                                                                          | What                                                           |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| [docs/architecture/overview.md](docs/architecture/overview.md)                 | The shape of the system and why it is that shape               |
| [docs/architecture/extension-points.md](docs/architecture/extension-points.md) | How to add a channel, a scoring strategy, a module             |
| [docs/development/getting-started.md](docs/development/getting-started.md)     | From a clean checkout to a working application                 |
| [docs/development/conventions.md](docs/development/conventions.md)             | How code in this repository is written, and why                |
| [docs/operations/deployment.md](docs/operations/deployment.md)                 | Deploying, migrating, rolling back                             |
| [docs/adr/](docs/adr/)                                                         | The decisions, with the reasoning intact                       |
| [docs/product/glossary.md](docs/product/glossary.md)                           | Keeper, Investigator, session, and what each is called in code |

## Commands

| Command                                      | What it does                                                 |
| -------------------------------------------- | ------------------------------------------------------------ |
| `npm run dev`                                | Development server on :3000                                  |
| `npm run worker:dev`                         | Background worker, watching for changes                      |
| `npm test`                                   | Unit tests                                                   |
| `npm run test:integration`                   | Integration tests against a real MySQL container             |
| `npm run typecheck` / `npm run lint`         | Types and boundaries                                         |
| `npm run db:migrate` / `npm run db:generate` | Apply / author migrations                                    |
| `npm run build` + `npm run build:worker`     | Production bundles                                           |
| `scripts/deploy.sh`                          | Back up, build, migrate, start, verify, roll back on failure |
| `scripts/verify-restore.sh`                  | Prove the latest backup actually restores                    |

## Licence

Private. Not published, not packaged, not for distribution.
