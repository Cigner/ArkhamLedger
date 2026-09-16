'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
import { BookOpen, UserMinus, UserRound } from 'lucide-react'
import { IconButton } from '@/components/patterns/icon-button'
import { ConfirmDialog } from '@/components/patterns/confirm-dialog'
import { changeMemberRole, removeMember } from '../actions/members'
import type { CampaignMemberListItem, Membership } from '../domain/types'

/**
 * Owner-only controls on a member row.
 *
 * Rendered only for the owner, and only for other people - the owner cannot
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
  const t = useTranslations('campaigns.memberActions')
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
      <IconButton
        variant="ghost"
        label={member.role === 'KEEPER' ? t('makeInvestigator') : t('makeKeeper')}
        icon={
          member.role === 'KEEPER' ? (
            <UserRound className="size-4" aria-hidden="true" />
          ) : (
            <BookOpen className="size-4" aria-hidden="true" />
          )
        }
        disabled={busy}
        onClick={() => changeRole.execute({ campaignId, userId: member.userId, role: nextRole })}
      />

      <IconButton
        variant="ghost"
        label={t('removeLabel')}
        icon={<UserMinus className="size-4" aria-hidden="true" />}
        disabled={busy}
        onClick={() => setConfirmingRemoval(true)}
      />

      <ConfirmDialog
        open={confirmingRemoval}
        onOpenChange={setConfirmingRemoval}
        title={t('removeTitle', { name: member.name })}
        description={t('removeDescription')}
        confirmLabel={t('removeConfirm')}
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.execute({ campaignId, userId: member.userId })}
      />
    </div>
  )
}
