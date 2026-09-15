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
| `session.complete`         | `sessionId, attendance[]`                                                         | `ok`        | Keeper, `SCHEDULED`          |

A new session invites the whole campaign by default; the Keeper narrows it
afterwards. Keepers are normalised to `REQUIRED` regardless of what was
submitted.

`session.reopenCollection` clears every answer. Answers given for a window that
has changed look like participation while meaning nothing, which is worse than
no answers.

Every transition names the status it moves _from_ in its `WHERE` clause, so two
Keepers acting at once cannot both apply the same change — the second is told
the session moved on.

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
