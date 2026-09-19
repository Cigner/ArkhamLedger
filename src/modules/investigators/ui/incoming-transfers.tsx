'use client'

import { ArrowLeftRight } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useFormatter, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import { decideInvestigatorTransfer } from '../actions/transfers'
import type { TransferRecord } from '../data/transfers'

/**
 * Requests waiting on the owner's answer.
 *
 * At the top of the Vault, because it is the one thing there that somebody else
 * is waiting on. The reason the Keeper gave is shown: "hand your character to
 * Marcus" without it is a request nobody can evaluate.
 */
export function IncomingTransfers({ transfers }: { transfers: readonly TransferRecord[] }) {
  const t = useTranslations('investigators.transfer')
  const format = useFormatter()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  const decide = useAction(decideInvestigatorTransfer, {
    onSuccess: () => {
      setError(null)
      router.refresh()
    },
    onError: ({ error: actionError }) => {
      setError(
        resolveActionError(
          {
            'investigators.errors.transferExpired': t('errors.expired'),
            'investigators.errors.transferAlreadyDecided': t('errors.alreadyDecided'),
          },
          t('errors.failed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  if (transfers.length === 0) return null

  return (
    <Card className="border-candle-9/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowLeftRight className="size-4 text-text-muted" aria-hidden="true" />
          {t('incomingTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {transfers.map((transfer) => (
          <div key={transfer.id} className="flex flex-col gap-2">
            <p className="font-ui text-sm text-text-primary">
              {t('incoming', {
                investigator: transfer.investigatorName ?? t('unnamed'),
                to: transfer.toOwnerName,
              })}
            </p>

            {transfer.reason ? (
              <p className="font-body text-sm text-text-secondary">{transfer.reason}</p>
            ) : null}

            <p className="font-ui text-xs text-text-muted">
              {t('expires', {
                date: format.dateTime(transfer.expiresAt, {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                }),
              })}
            </p>

            <div className="flex gap-2">
              <Button
                variant="accent"
                disabled={decide.isPending}
                onClick={() => decide.execute({ transferId: transfer.id, accept: true })}
              >
                {t('accept')}
              </Button>
              <Button
                variant="ghost"
                disabled={decide.isPending}
                onClick={() => decide.execute({ transferId: transfer.id, accept: false })}
              >
                {t('reject')}
              </Button>
            </div>
          </div>
        ))}

        <FormError>{error}</FormError>
      </CardContent>
    </Card>
  )
}
