# Authorization

## Where the boundary is

**In the data access layer. Not in the proxy, not in the layout, not in the
component.**

CVE-2025-29927 (CVSS 9.1) let a forged `x-middleware-subrequest` header skip
Next.js middleware entirely, and with it every authorization check that lived
there. The lesson outlives the patch, so this application is built as though
middleware can always be bypassed:

1. **`proxy.ts` is user experience.** It checks that a session cookie is
   _present_ and redirects anonymous visitors to sign in. It makes no
   authorization decision and reads no role.
2. **Every function in `modules/*/data/` that returns or changes something
   protected calls a guard itself**, immediately before the query.
3. **Every Server Action re-verifies.** Server Actions are public POST
   endpoints; none may assume it was reached through a particular page.
4. **DTOs, never rows.** Narrowing happens in the query, so there is no payload
   in which a privileged field is present and merely unrendered.

Verified by probe rather than by assertion: a request carrying
`x-middleware-subrequest` in several shapes still redirects to sign-in.

## Roles

Two global roles on `auth_user.role`:

| Role    | Can                                                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN` | Everything a `USER` can, plus create, disable and remove accounts, regenerate activation links, and read the operations screen. **No automatic access to campaign content.** |
| `USER`  | Create campaigns, accept invitations, play                                                                                                                                   |

Two campaign roles on `campaign_member.role`:

| Role           | Can                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------- |
| `KEEPER`       | Manage sessions and priorities, run the search, confirm a date, invite, **see who said what** |
| `INVESTIGATOR` | Read the campaign, answer for themselves, see aggregate availability only                     |

`campaign.owner_id` is an attribute rather than a role. The owner is always a
Keeper with three extra powers: delete or archive the campaign, transfer
ownership, and remove or re-role members.

## Matrix

| Action                         | Admin (non-member) | Owner | Keeper | Investigator | Non-member |
| ------------------------------ | ------------------ | ----- | ------ | ------------ | ---------- |
| Read campaign                  | ✗                  | ✓     | ✓      | ✓            | ✗          |
| Edit campaign                  | ✗                  | ✓     | ✓      | ✗            | ✗          |
| Archive / transfer ownership   | ✗                  | ✓     | ✗      | ✗            | ✗          |
| Invite / revoke invitation     | ✗                  | ✓     | ✓      | ✗            | ✗          |
| Remove member, change role     | ✗                  | ✓     | ✗      | ✗            | ✗          |
| Create or edit a session       | ✗                  | ✓     | ✓      | ✗            | ✗          |
| Set priorities                 | ✗                  | ✓     | ✓      | ✗            | ✗          |
| Save **own** availability      | ✗                  | ✓     | ✓      | ✓            | ✗          |
| Save **anybody else's**        | ✗                  | ✗     | ✗      | ✗            | ✗          |
| Read **named** availability    | ✗                  | ✓     | ✓      | ✗            | ✗          |
| Read aggregate availability    | ✗                  | ✓     | ✓      | ✓            | ✗          |
| Run the search, confirm a date | ✗                  | ✓     | ✓      | ✗            | ✗          |
| Configure Discord              | ✗                  | ✓     | ✗      | ✗            | ✗          |
| Leave campaign                 | —                  | ✗¹    | ✓      | ✓            | —          |

¹ An owner must transfer ownership first.

## 404, not 403, for non-members

A resource the caller is not a member of answers **not found**. Answering
"forbidden" would confirm that a campaign with that id exists, which turns id
enumeration into a directory. Within a campaign the answer is 403, because the
person can already see that the thing exists.

## Guards

```ts
requireUser() // a session, or UnauthorizedError
requireAdmin() // global role
requireCampaignMember(campaignId, minimumRole) // membership, NotFound if absent
requireKeeper(campaignId)
requireOwner(campaignId)
requireSessionMember(sessionId) // resolves the campaign in one query
requireSessionKeeper(sessionId)
```

Small and separate rather than one `can(action, resource)`. Each answers a
single question, which is what makes the authorization test a matrix rather than
a narrative.

`requireSessionMember` resolves a session's campaign and its membership in one
query so that a non-member never learns that a session id exists at all.

## Availability privacy

The rule is: **aggregate visible, identity hidden.** It has the weight of a
security rule, so it is enforced by the shape of the data rather than by the
view:

- `getAvailabilityView` narrows per viewer. A Keeper's copy carries
  `participants` with names; an Investigator's carries `[]`.
- Per-hour counts are withheld below three respondents. With two, one count plus
  your own answer identifies the other person exactly.
- Priorities are stripped for Investigators in the query — being told you are
  "optional" is a social injury the feature does not need to inflict.
- The scheduling screen is Keeper-only in its entirety, because a proposal
  explains itself by naming who is only free at a push.

Integration tests assert the refusal on every path that leads to named data, and
assert the _shape_ of the aggregate DTO rather than its values.
