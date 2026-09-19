'use client'

import { Unlink } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
import { ConfirmDialog } from '@/components/patterns/confirm-dialog'
import { IconButton } from '@/components/patterns/icon-button'
import { unlinkInvestigatorFromCampaign } from '../actions/investigators'

/**
 * Taking a character out of a campaign.
 *
 * Confirmed rather than immediate, and the confirmation says what survives:
 * people expect "remove" to mean "erase", and here it means the opposite - the
 * campaign stops seeing new changes while everything already shown stays where
 * it is.
 */
export function InvestigatorRowActions({
  campaignId,
  investigatorId,
  canUnlink,
}: {
  campaignId: string
  investigatorId: string
  canUnlink: boolean
}) {
  const t = useTranslations('investigators.rowActions')
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const unlink = useAction(unlinkInvestigatorFromCampaign, {
    onSuccess: () => {
      setOpen(false)
      router.refresh()
    },
    onError: () => setOpen(false),
  })

  if (!canUnlink) return null

  return (
    <>
      <IconButton
        label={t('unlink')}
        variant="ghost"
        onClick={() => setOpen(true)}
        icon={<Unlink className="size-4" aria-hidden="true" />}
      />

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('unlinkDialog.title')}
        description={t('unlinkDialog.description')}
        confirmLabel={t('unlink')}
        pending={unlink.isPending}
        onConfirm={() => unlink.execute({ investigatorId, campaignId })}
      />
    </>
  )
}
