'use client'

import { Copy, Download, Printer } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
import { ButtonLink } from '@/components/ui/button-link'
import { ConfirmDialog } from '@/components/patterns/confirm-dialog'
import { IconButton } from '@/components/patterns/icon-button'
import { duplicateInvestigator } from '../actions/investigators'
import { RequestInvestigatorDialog } from './request-investigator-dialog'
import type { ProjectedSheet } from '../domain/sheet'

/**
 * Taking a character somewhere else.
 *
 * Print, export and duplicate sit together because they are one intention with
 * three destinations: paper, a file, or a second version of the character. All
 * three carry only what the reader may see.
 */
export function SheetToolbar({
  sheet,
  canDuplicate,
  requestable,
}: {
  sheet: ProjectedSheet
  canDuplicate: boolean
  /** Campaigns the reader keeps and could ask for this character in. */
  requestable: readonly { campaignId: string; name: string }[]
}) {
  const t = useTranslations('investigators.toolbar')
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)

  const duplicate = useAction(duplicateInvestigator, {
    onSuccess: ({ data }) => {
      setConfirming(false)
      if (data?.investigatorId) router.push(`/investigators/${data.investigatorId}`)
    },
    onError: () => setConfirming(false),
  })

  return (
    <div className="flex flex-wrap items-center gap-1">
      <ButtonLink href={`/investigators/${sheet.id}/print`} variant="ghost">
        <Printer className="size-4" aria-hidden="true" />
        {t('print')}
      </ButtonLink>

      <ButtonLink href={`/api/investigators/${sheet.id}/export`} variant="ghost">
        <Download className="size-4" aria-hidden="true" />
        {t('export')}
      </ButtonLink>

      {canDuplicate ? (
        <IconButton
          label={t('duplicate')}
          variant="ghost"
          icon={<Copy className="size-4" aria-hidden="true" />}
          onClick={() => setConfirming(true)}
        />
      ) : null}

      {requestable.length > 0 ? (
        <RequestInvestigatorDialog investigatorId={sheet.id} campaigns={requestable} />
      ) : null}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('duplicateDialog.title')}
        description={t('duplicateDialog.description')}
        confirmLabel={t('duplicate')}
        pending={duplicate.isPending}
        onConfirm={() => duplicate.execute({ investigatorId: sheet.id })}
      />
    </div>
  )
}
