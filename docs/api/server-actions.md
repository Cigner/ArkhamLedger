# Server Actions

Every mutation in the application is a Server Action. There is no REST API:
there is one consumer, and end-to-end types without a generated client are worth
more than a surface nobody calls.

Route handlers exist only where an action cannot work — the authentication
library's own endpoints, a file response, and health checks.

## Shape

```ts
{ data: T } | { serverError: { code, messageKey, messageParams? } } | { validationErrors: … }
```

`messageKey` is stable and machine-readable; the interface maps it to a
sentence. Nothing here returns a pre-rendered message.

## Common failures

| Code           | Meaning                                                    |
| -------------- | ---------------------------------------------------------- |
| `UNAUTHORIZED` | No session                                                 |
| `FORBIDDEN`    | Signed in, wrong role                                      |
| `NOT_FOUND`    | Missing **or** not a member — deliberately the same answer |
| `VALIDATION`   | Input rejected by its schema                               |
| `CONFLICT`     | Somebody else changed it first                             |
| `RATE_LIMITED` | Throttled; carries `retryAfterSeconds`                     |
| `DOMAIN_RULE`  | A business rule refused                                    |

## Identity

| Action                           | Input                                        | Returns                 | Requires   |
| -------------------------------- | -------------------------------------------- | ----------------------- | ---------- |
| `admin.createUser`               | `email, name, role`                          | `userId, activationUrl` | Admin      |
| `admin.regenerateActivationLink` | `userId`                                     | `activationUrl`         | Admin      |
| `admin.setUserStatus`            | `userId, status`                             | `ok`                    | Admin      |
| `auth.activateAccount`           | `token, password, confirmPassword`           | `ok`                    | — (public) |
| `profile.update`                 | `name, timezone, locale`                     | `ok`                    | Signed in  |
| `profile.changePassword`         | `currentPassword, password, confirmPassword` | `ok`                    | Signed in  |

The activation URL is returned **once** and is not recoverable: only its digest
is stored. Password reset is handled by Better Auth's own endpoints, not by an
action.

`admin.deleteUser` is two operations behind one name. Without `hard` it closes
the account: signed out, cannot sign in, every membership ended, and everything
the person did — availability, attendance, sessions played — kept. With `hard`
it erases the row and everything addressed to them, and is refused whenever they
authored something somebody else depends on: a campaign they own, a session or
invitation or scenario they created, an activation link they issued. The counts
are recomputed on the server at the moment of deletion, never trusted from the
form, and the foreign keys behind them restrict rather than cascade — so an
erase the rule wrongly permitted would fail loudly rather than take somebody
else's history with it.

## Campaigns

| Action                       | Input                                            | Returns                     | Requires              |
| ---------------------------- | ------------------------------------------------ | --------------------------- | --------------------- |
| `campaign.create`            | `name, description?, scenarioName?`              | `campaignId`                | Signed in             |
| `campaign.update`            | `campaignId, …`                                  | `ok`                        | Keeper                |
| `campaign.archive`           | `campaignId`                                     | `ok`                        | Owner                 |
| `campaign.transferOwnership` | `campaignId, newOwnerId`                         | `ok`                        | Owner                 |
| `campaign.saveScenario`      | `campaignId, name, description?`                 | `ok`                        | Keeper                |
| `campaign.createInvitation`  | `campaignId, targetUserId?, roleOnJoin, maxUses` | `invitationUrl, expiresAt`  | Keeper                |
| `campaign.revokeInvitation`  | `campaignId, invitationId`                       | `ok`                        | Keeper                |
| `campaign.acceptInvitation`  | `token`                                          | `campaignId, alreadyMember` | Signed in             |
| `campaign.leave`             | `campaignId`                                     | `ok`                        | Member, not the owner |
| `campaign.removeMember`      | `campaignId, userId`                             | `ok`                        | Owner                 |
| `campaign.changeMemberRole`  | `campaignId, userId, role`                       | `ok`                        | Owner                 |

`campaign.acceptInvitation` claims the invitation with a conditional update, so
two people racing for the last seat produce exactly one member and one clear
refusal. Being already a member is reported as information, not an error.

## Sessions

| Action                     | Input                                                                             | Returns     | Requires                     |
| -------------------------- | --------------------------------------------------------------------------------- | ----------- | ---------------------------- |
| `session.create`           | `campaignId, title, description?, window, grid hours, minSessionHours, deadline?` | `sessionId` | Keeper                       |
| `session.update`           | `sessionId, …, quorum`                                                            | `ok`        | Keeper, `DRAFT` only         |
| `session.setParticipants`  | `sessionId, quorum, participants[]`                                               | `ok`        | Keeper, `DRAFT`/`COLLECTING` |
| `session.publish`          | `sessionId`                                                                       | `ok`        | Keeper, `DRAFT`              |
| `session.closeCollection`  | `sessionId`                                                                       | `ok`        | Keeper, `COLLECTING`         |
| `session.reopenCollection` | `sessionId, availabilityDeadline?`                                                | `ok`        | Keeper                       |
| `session.setDate`          | `sessionId, date, startHour, endHour, acknowledgeWarnings`                        | `ok`        | Keeper                       |
| `session.cancel`           | `sessionId, reason`                                                               | `ok`        | Keeper                       |
| `session.start`            | `sessionId`                                                                       | `ok`        | Keeper, `SCHEDULED`          |
| `session.complete`         | `sessionId, attendance[]`                                                         | `ok`        | Keeper, `IN_PROGRESS`        |

A new session invites the whole campaign by default; the Keeper narrows it
afterwards. Keepers are normalised to `REQUIRED` regardless of what was
submitted.

`session.start` is one transaction. It refuses while a participant marked as
playing a character has not been given one and names who, checks every chosen
character is owned by the player and still linked to the campaign, archives each
sheet as a `SESSION_START` snapshot, records first use, closes the creating
Keeper's edit grant on any character being played for the first time, and stamps
`startedAt`. Completing the session stamps `endedAt`.

`session.reopenCollection` clears every answer. Answers given for a window that
has changed look like participation while meaning nothing, which is worse than
no answers.

Every transition names the status it moves _from_ in its `WHERE` clause, so two
Keepers acting at once cannot both apply the same change — the second is told
the session moved on.

## Investigators

| Action                           | Input                                                          | Returns                          | Requires                          |
| -------------------------------- | -------------------------------------------------------------- | -------------------------------- | --------------------------------- |
| `investigator.create`            | `name, creationMethod, rulesetId, rulesetVersion, campaignId?` | `investigatorId`                 | Signed in                         |
| `investigator.createForPlayer`   | `campaignId, playerId, name, creationMethod, ruleset…`         | `investigatorId`                 | Keeper of that campaign           |
| `investigator.link`              | `investigatorId, campaignId`                                   | `ok`                             | The character's owner, a member   |
| `investigator.unlink`            | `investigatorId, campaignId, reason?`                          | `ok, disclosures`                | The owner or a Keeper             |
| `investigator.duplicate`         | `investigatorId, name?`                                        | `ok, investigatorId`             | The owner, or the creating Keeper |
| `investigator.request`           | `investigatorId, campaignId`                                   | `ok`                             | A Keeper who can see the sheet    |
| `investigator.import`            | `document`                                                     | `ok, investigatorId, warnings[]` | Signed in                         |
| `investigator.emergencyTransfer` | `investigatorId, campaignId, toOwnerId, reason`                | `ok, investigatorId`             | Administrator                     |

`investigator.createForPlayer` makes the player the owner immediately and gives
the Keeper an edit grant that closes at the character's first use. The player is
notified; the Keeper never gains access to their other characters.

| Action                             | Input                                                                       | Returns                         | Requires                          |
| ---------------------------------- | --------------------------------------------------------------------------- | ------------------------------- | --------------------------------- |
| `investigator.saveIdentity`        | `investigatorId, expectedVersion, name, age, …`                             | `ok, version`                   | Owner or creator-Keeper           |
| `investigator.saveCharacteristics` | `investigatorId, expectedVersion, STR…EDU, luck`                            | `ok, version`                   | Owner or creator-Keeper           |
| `investigator.activate`            | `investigatorId, expectedVersion`                                           | `ok`                            | Owner or creator-Keeper           |
| `investigator.saveOccupation`      | `investigatorId, expectedVersion, occupationId, characteristic?, choices[]` | `ok, version, budgets`          | Owner or creator-Keeper           |
| `investigator.saveSkills`          | `investigatorId, expectedVersion, allocations[]`                            | `ok, version, summary`          | Owner or creator-Keeper           |
| `investigator.removeSkill`         | `investigatorId, skillKey`                                                  | `ok`                            | Owner or creator-Keeper           |
| `investigator.saveBackstory`       | `investigatorId, expectedVersion, entries[]`                                | `ok, version`                   | Owner or creator-Keeper           |
| `investigator.saveFinances`        | `investigatorId, expectedVersion, cash, assets, notes?`                     | `ok, version`                   | Owner or creator-Keeper           |
| `investigator.savePrivacy`         | `investigatorId, hidden[]`                                                  | `ok, hidden`                    | Owner or creator-Keeper           |
| `investigator.addSkill`            | `investigatorId, expectedVersion, definitionId, specialization?`            | `ok, version, skillKey`         | Owner or creator-Keeper           |
| `investigator.savePossessions`     | `investigatorId, expectedVersion, entries[]`                                | `ok, version`                   | Owner or creator-Keeper           |
| `investigator.saveWeapons`         | `investigatorId, expectedVersion, entries[]`                                | `ok, version`                   | Owner or creator-Keeper           |
| `investigator.adjustResource`      | `investigatorId, resource, amount, reason?, gameSessionId?`                 | `ok, value, rolls required`     | Owner or creator-Keeper, `ACTIVE` |
| `investigator.reverseResource`     | `investigatorId`                                                            | `ok, resource, value`           | Owner or creator-Keeper           |
| `investigator.setConditions`       | `investigatorId, five flags`                                                | `ok`                            | Owner or creator-Keeper           |
| `session.assignInvestigator`       | `sessionId, participantId, investigatorId`                                  | `ok, assigned`                  | Keeper                            |
| `session.useSameInvestigators`     | `sessionId`                                                                 | `ok, from, copied[], skipped[]` | Keeper                            |
| `investigator.requestTransfer`     | `campaignId, investigatorId, toOwnerId, reason?`                            | `ok, transferId`                | Keeper                            |
| `investigator.decideTransfer`      | `transferId, accept`                                                        | `ok, accepted, investigatorId?` | The current owner                 |
| `investigator.cancelTransfer`      | `transferId`                                                                | `ok`                            | Keeper                            |
| `investigator.markSkill`           | `investigatorId, skillKey, marked, gameSessionId?`                          | `ok, marked`                    | Owner or creator-Keeper           |
| `investigator.resolveDevelopment`  | `investigatorId, skillKey, percentileRoll, improvementRoll?`                | `ok, improved, increase, basis` | Owner or creator-Keeper           |
| `investigator.writeNote`           | `investigatorId, campaignId?, kind, content, visibility`                    | `ok, noteId`                    | Depends on the kind               |
| `investigator.reviseNote`          | `noteId, content, visibility`                                               | `ok, disclosures`               | The note's author                 |
| `investigator.setOverride`         | `investigatorId, expectedVersion, fieldKey, value, reason`                  | `ok, version`                   | Owner or creator-Keeper           |
| `investigator.changeStatus`        | `investigatorId, expectedVersion, status, reason?`                          | `ok, status`                    | Owner or creator-Keeper           |
| `investigator.archive`             | `investigatorId, archived`                                                  | `ok, archived`                  | Owner or creator-Keeper           |
| `investigator.delete`              | `investigatorId`                                                            | `ok`                            | Owner, draft nobody has seen      |

`investigator.saveOccupation` resolves the occupation's eight skills from the
catalog and the choices made against it, then reconciles the character's skill
rows. Occupation points on a skill the new occupation does not grant are lost;
personal interest is not.

`investigator.decideTransfer` with `accept` performs section 13's transaction:
snapshot, branch, move the binding, redirect the sessions that have not
happened. The previous owner keeps the branch they played — nothing is taken
from anybody.

`session.useSameInvestigators` copies from the campaign's most recently
**started** session and returns what it could not place, so a Keeper is told
about the two people who still have no sheet rather than discovering it on the
night.

`investigator.reviseNote` adds a revision rather than replacing one. When the
visibility narrows it first captures the outgoing revision for everybody losing
access, and reports how many — narrowing a note never takes back what was
already read.

`investigator.adjustResource` takes an amount, not a new total: eight points at
once is a major wound and eight in four blows is not, and the rules cannot tell
them apart from a total. It answers with the rolls the rules call for rather
than making them.

The play actions carry no version either. They are events in time — two people
recording damage during a fight are recording two blows, not competing to
describe one.

`investigator.savePrivacy` is the exception: it carries no version, because
privacy is not sheet content and only one person may set it. Keys outside the
registry are dropped rather than stored, so a field somebody believes they hid
is one the resolver actually knows about. A save that hides something new first
captures a disclosure for every player who could read it, and reports how many:
section 15 lists hiding a field among the moments that reduce access, and it is
the only one where nobody's access ends.

`investigator.setOverride` replaces a calculated value with one somebody
insisted on, or withdraws the replacement when `value` is null. The reason is
required either way. Overrides are a history rather than a setting: setting one
twice closes the first decision and records the second.

`investigator.request` asks an owner to bring a character into a campaign the
caller keeps. It changes nothing — the owner links it themselves or does not —
and the campaign it names is re-derived from the same query that offered it, so
a hand-made request cannot reach a campaign the caller does not run or one the
owner cannot join.

`session.assignInvestigator` and `session.useSameInvestigators` refuse once the
session has started. An assignment carries the snapshots taken for that evening,
so rewriting one afterwards would delete the record of who played what.

Every sheet write carries the version it was read at and refuses with `CONFLICT`
if the character moved underneath it. Two people editing one character is the
ordinary case — the owner at the table and the Keeper who started the sheet — so
last-write-wins would silently discard whichever of them was slower.

`investigator.unlink` captures a disclosure for everybody who could see the sheet
before closing the binding, and reports how many it wrote. Session history is
untouched — unlinking decides what happens next, not what already happened.

## Availability

| Action                         | Input                 | Returns                            | Requires                  |
| ------------------------------ | --------------------- | ---------------------------------- | ------------------------- |
| `availability.save`            | `sessionId, ranges[]` | `savedAt`                          | Participant, `COLLECTING` |
| `availability.suggestPrevious` | `sessionId`           | `found, sessionTitle, byWeekday[]` | Participant               |

**`userId` is never in the input.** It comes from the session. Accepting it
would let any participant overwrite another's answer.

The suggestion is returned, never applied. "The same as last time" is an
assumption, and the button is where somebody agrees to it.

## Scheduling

| Action                      | Input                   | Returns                | Requires                                          |
| --------------------------- | ----------------------- | ---------------------- | ------------------------------------------------- |
| `scheduling.run`            | `sessionId`             | `runId, proposalCount` | Keeper, `COLLECTING`/`PROPOSED`, 10/h per session |
| `scheduling.acceptProposal` | `sessionId, proposalId` | `ok`                   | Keeper                                            |

Running the search changes nothing about the session. Accepting a proposal
requires it to belong to the most recent run.

## Notifications and integrations

| Action                             | Input              | Returns | Requires                  |
| ---------------------------------- | ------------------ | ------- | ------------------------- |
| `notification.markRead`            | `ids[]`            | `ok`    | Signed in (own rows only) |
| `notification.markAllRead`         | —                  | `ok`    | Signed in                 |
| `notification.setChannel`          | `channel, enabled` | `ok`    | Signed in                 |
| `integration.setDiscordWebhook`    | `campaignId, url`  | `ok`    | Owner                     |
| `integration.removeDiscordWebhook` | `campaignId`       | `ok`    | Owner                     |
| `integration.testDiscordWebhook`   | `campaignId`       | `ok`    | Owner, throttled          |

The webhook URL is validated against the two hosts Discord actually issues.
Accepting an arbitrary URL would turn a settings form into a request forwarder
aimed at wherever an administrator could be persuaded to point it.

## Route handlers

| Endpoint                 | Method | Authorization   | Notes                                                    |
| ------------------------ | ------ | --------------- | -------------------------------------------------------- |
| `/api/auth/[...all]`     | *      | Better Auth     | `trustedOrigins` enforced                                |
| `/api/sessions/[id]/ics` | GET    | Campaign member | `text/calendar`, only once a date exists                 |
| `/api/health`            | GET    | public          | `{status, database, uptimeSeconds}` and nothing internal |
| `/api/health/worker`     | GET    | public          | 503 when the heartbeat is older than five minutes        |

Server Actions carry CSRF protection through Next's `Origin` check, which
requires `serverActions.allowedOrigins` to be set correctly and the reverse
proxy to forward `X-Forwarded-Host`. **Route handlers do not.** The four above
are safe — two are reads, one is the library's own with its own origin check —
but any new handler that changes state must handle it explicitly.
