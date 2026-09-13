'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/patterns/confirm-dialog'
import { changeMemberRole, removeMember } from '../actions/members'
import type { CampaignMemberListItem, Membership } from '../domain/types'

/**
 * Owner-only controls on a member row.
 *
 * Rendered only for the owner, and only for other people — the owner cannot
 * remove or demote themselves, and offering a control the server will refuse is
 * worse than not offering it. The rules are still enforced server-side.
 */
export function MemberRowActions({
  campaignId,
  member,
  viewer,
}: {
  campaignId: string
  member: CampaignMemberListItem
  viewer: Membership
}) {
  const [confirmingRemoval, setConfirmingRemoval] = useState(false)

  const changeRole = useAction(changeMemberRole)
  const remove = useAction(removeMember, {
    onSettled: () => setConfirmingRemoval(false),
  })

  if (!viewer.isOwner || member.userId === viewer.userId) return null

  const busy = changeRole.isPending || remove.isPending
  const nextRole = member.role === 'KEEPER' ? 'INVESTIGATOR' : 'KEEPER'

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => changeRole.execute({ campaignId, userId: member.userId, role: nextRole })}
      >
        {member.role === 'KEEPER' ? 'Make Investigator' : 'Make Keeper'}
      </Button>

      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmingRemoval(true)}>
        Remove
      </Button>

      <ConfirmDialog
        open={confirmingRemoval}
        onOpenChange={setConfirmingRemoval}
        title={`Remove ${member.name}?`}
        description="They lose access to this campaign. Their past availability and attendance are kept, and they can be invited back."
        confirmLabel="Remove from campaign"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.execute({ campaignId, userId: member.userId })}
      />
    </div>
  )
}
