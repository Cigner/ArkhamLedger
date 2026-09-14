# Glossary

Call of Cthulhu terminology, what it means here, and what it is called in code.
Getting this wrong is a naming mistake that spreads for weeks before anybody
notices.

| At the table          | Here                                  | In code                                       |
| --------------------- | ------------------------------------- | --------------------------------------------- |
| Keeper of Arcane Lore | Runs the game, chooses the date       | `KEEPER` (`campaign_member.role`), `isKeeper` |
| Investigator          | Plays. Answers when they are free     | `INVESTIGATOR`                                |
| Campaign              | A continuing story with a fixed group | `campaign`                                    |
| Session               | One evening of play                   | **`game_session`**                            |
| Scenario              | The published adventure being played  | `scenario`                                    |

**`game_session`, never `session`.** Better Auth's own table is called
`session`, and it means a browser's. Every auth table carries an `auth_` prefix
for the same reason. If you find yourself writing `session` in a schema file,
you are about to cause a confusing bug.

## Terms this application invented

| Term                   | Meaning                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| **Quorum**             | The smallest number of **players** for whom the session is worth running. Excludes Keepers       |
| **Search window**      | The range of dates a session is looking at                                                       |
| **Grid hours**         | The hours each day the session could occupy, e.g. 12:00–24:00                                    |
| **Core**               | The first `minSessionHours` of a candidate window. What the hard constraints are checked against |
| **Extended end**       | How far past the core the evening runs, while everybody required stays free                      |
| **Candidate / window** | One start hour on one day                                                                        |
| **Proposal**           | A candidate that survived, scored and ranked, stored for the Keeper to choose from               |
| **Run**                | One execution of the algorithm, with its inputs and its version                                  |
| **Slot**               | One hour of one person's answer                                                                  |
| **Quality**            | What a person's answer is worth over a window: 1, 0.6 or 0. Their weakest hour                   |
| **Broadcast**          | A notification that belongs to the campaign and goes to its channel once                         |
| **Carrier**            | The recipient whose copy of an event carries the channel post                                    |

## Availability states

| State        | Says                                                      |
| ------------ | --------------------------------------------------------- |
| `YES`        | I am free                                                 |
| `IF_NEED_BE` | Only if the date depends on it                            |
| `NO`         | I cannot                                                  |
| _(no row)_   | Has not answered — scored like `NO`, reported differently |

The last distinction matters: a refusal is a decision, and silence is somebody
who has not been reached. The Keeper's next move differs, so the interface never
reports a non-responder as unable to come.

## Priorities

Set per session by the Keeper, and **never shown to the person they are about**.

| Priority    | Meaning                           | Weight |
| ----------- | --------------------------------- | ------ |
| `REQUIRED`  | Without them there is no session  | 5      |
| `PREFERRED` | The session is worse without them | 3      |
| `OPTIONAL`  | Welcome, not needed               | 1      |

Keepers are forced to `REQUIRED` and the field is locked.

## Statuses

**Campaign:** `PLANNING` · `ACTIVE` · `ON_HIATUS` · `COMPLETED` · `ARCHIVED`

**Session:** `DRAFT` · `COLLECTING` · `PROPOSED` · `SCHEDULED` · `COMPLETED` ·
`CANCELLED`

**Account:** `PENDING_ACTIVATION` · `ACTIVE` · `DISABLED`

**Membership:** `ACTIVE` · `LEFT` · `REMOVED`

**Delivery:** `PENDING` · `SENDING` · `SENT` · `FAILED`
