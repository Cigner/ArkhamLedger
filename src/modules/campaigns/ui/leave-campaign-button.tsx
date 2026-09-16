'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/patterns/confirm-dialog'
import { leaveCampaign } from '../actions/members'
import type { Membership } from '../domain/types'

/**
 * Leaving a campaign.
 *
 * Hidden for the owner, who must hand the campaign over first - offering the
 * control and then refusing it would read as a bug rather than as a rule.
 */
export function LeaveCampaignButton({
  campaignId,
  viewer,
}: {
  campaignId: string
  viewer: Membership
}) {
  const t = useTranslations('campaigns.leave')
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)

  const leave = useAction(leaveCampaign, {
    onSuccess: () => {
      setConfirming(false)
      router.push('/campaigns')
      router.refresh()
    },
    onError: () => setConfirming(false),
  })

  if (viewer.isOwner) return null

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        {t('trigger')}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('title')}
        description={t('description')}
        confirmLabel={t('confirm')}
        destructive
        pending={leave.isPending}
        onConfirm={() => leave.execute({ campaignId })}
      />
    </>
  )
}
