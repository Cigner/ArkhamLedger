'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { FormError } from '@/modules/identity/ui/form-error'
import { acceptInvitation } from '../actions/invitations'

/**
 * Accepts an invitation.
 *
 * The link is only claimed when the visitor presses the button, so opening the
 * page — or reloading it — never consumes a use of a shared link.
 */
const MESSAGES: Record<string, string> = {
  'campaigns.errors.invitationEXPIRED': 'This invitation has expired. Ask the Keeper for a new one.',
  'campaigns.errors.invitationREVOKED': 'This invitation has been withdrawn.',
  'campaigns.errors.invitationEXHAUSTED': 'This invitation has already been used up.',
  'campaigns.errors.invitationNOT_FOR_YOU': 'This invitation was issued for somebody else.',
  'campaigns.errors.invitationINVALID': 'This invitation link is not valid.',
}

export function AcceptInvitation({ token }: { token: string }) {
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
      setError((key ? MESSAGES[key] : undefined) ?? 'Could not accept this invitation.')
    },
  })

  const busy = isPending || navigating

  return (
    <div className="flex flex-col gap-4">
      <FormError>{error}</FormError>
      <div className="flex items-center gap-2">
        <Button variant="accent" size="lg" disabled={busy} onClick={() => execute({ token })}>
          {busy ? 'Joining…' : 'Accept invitation'}
        </Button>
        <Button variant="ghost" onClick={() => router.push('/campaigns')} disabled={busy}>
          Not now
        </Button>
      </div>
    </div>
  )
}
