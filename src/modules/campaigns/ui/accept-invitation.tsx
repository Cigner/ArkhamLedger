'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { FormError } from '@/modules/identity/ui/form-error'
import { acceptInvitation } from '../actions/invitations'

/**
 * Accepts an invitation.
 *
 * The link is only claimed when the visitor presses the button, so opening the
 * page - or reloading it - never consumes a use of a shared link.
 */
export function AcceptInvitation({ token }: { token: string }) {
  const t = useTranslations('campaigns.invitation')
  const messages: Record<string, string> = {
    'campaigns.errors.invitationEXPIRED': t('errors.expired'),
    'campaigns.errors.invitationREVOKED': t('errors.revoked'),
    'campaigns.errors.invitationEXHAUSTED': t('errors.exhausted'),
    'campaigns.errors.invitationNOT_FOR_YOU': t('errors.notForYou'),
    'campaigns.errors.invitationINVALID': t('errors.invalid'),
  }
  const router = useRouter()
  const [navigating, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const { execute, isPending } = useAction(acceptInvitation, {
    onSuccess: ({ data }) => {
      if (!data) return
      startTransition(() => {
        router.push(`/campaigns/${data.campaignId}`)
        router.refresh()
      })
    },
    onError: ({ error: actionError }) => {
      const key = actionError.serverError?.messageKey
      setError((key ? messages[key] : undefined) ?? t('errors.failed'))
    },
  })

  const busy = isPending || navigating

  return (
    <div className="flex flex-col gap-4">
      <FormError>{error}</FormError>
      <div className="flex items-center gap-2">
        <Button variant="accent" size="lg" disabled={busy} onClick={() => execute({ token })}>
          {busy ? t('joining') : t('accept')}
        </Button>
        <Button variant="ghost" onClick={() => router.push('/campaigns')} disabled={busy}>
          {t('notNow')}
        </Button>
      </div>
    </div>
  )
}
