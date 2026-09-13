import type { Metadata } from 'next'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getCampaignDetail } from '@/modules/campaigns/data/campaigns'
import { listInvitableUsers, listMembers } from '@/modules/campaigns/data/members'
import { listActiveInvitations } from '@/modules/campaigns/data/invitations'
import { CampaignRoleBadge } from '@/modules/campaigns/ui/campaign-status-badge'
import { InviteDialog } from '@/modules/campaigns/ui/invite-dialog'
import { InvitationList } from '@/modules/campaigns/ui/invitation-list'
import { MemberRowActions } from '@/modules/campaigns/ui/member-row-actions'
import { LeaveCampaignButton } from '@/modules/campaigns/ui/leave-campaign-button'

/**
 * Campaign roster.
 *
 * Everyone sees the roster; only Keepers see and issue invitations, and only the
 * owner sees the per-member controls. Each of those is enforced by the query or
 * the action behind it, not by the absence of a button.
 */
export const metadata: Metadata = { title: 'Members' }
export const dynamic = 'force-dynamic'

export default async function CampaignMembersPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params
  const campaign = await getCampaignDetail(campaignId)
  const isKeeper = campaign.viewer.role === 'KEEPER'

  const [members, invitations, invitableUsers] = await Promise.all([
    listMembers(campaignId),
    isKeeper ? listActiveInvitations(campaignId) : Promise.resolve([]),
    isKeeper ? listInvitableUsers(campaignId) : Promise.resolve([]),
  ])

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg tracking-[--tracking-display] text-text-primary">
            Members
          </h2>
          <div className="flex items-center gap-2">
            <LeaveCampaignButton campaignId={campaignId} viewer={campaign.viewer} />
            {isKeeper ? (
              <InviteDialog campaignId={campaignId} invitableUsers={invitableUsers} />
            ) : null}
          </div>
        </div>

        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.userId}>
                  <TableCell>
                    {member.name}
                    {member.isOwner ? (
                      <span className="ml-2 font-ui text-2xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
                        Owner
                      </span>
                    ) : null}
                    {member.userId === campaign.viewer.userId ? (
                      <span className="ml-2 font-ui text-xs text-text-muted">(you)</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-text-secondary">{member.email}</TableCell>
                  <TableCell>
                    <CampaignRoleBadge role={member.role} />
                  </TableCell>
                  <TableCell>
                    <MemberRowActions
                      campaignId={campaignId}
                      member={member}
                      viewer={campaign.viewer}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </section>

      {isKeeper ? (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-lg tracking-[--tracking-display] text-text-primary">
            Outstanding invitations
          </h2>
          <InvitationList campaignId={campaignId} invitations={invitations} />
        </section>
      ) : null}
    </div>
  )
}
