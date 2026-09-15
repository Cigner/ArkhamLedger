import type { Metadata } from 'next'
import { ButtonLink } from '@/components/ui/button-link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/lib/auth'
import { previewInvitation } from '@/modules/campaigns/data/invitations'
import type { InvitationRejection } from '@/modules/campaigns/domain/types'
import { AcceptInvitation } from '@/modules/campaigns/ui/accept-invitation'

/**
 * Invitation landing page.
 *
 * Requires a session: there is no public sign-up, so a link handed to somebody
 * without an account cannot create one. The proxy sends an anonymous visitor to
 * sign in and back here afterwards.
 *
 * The preview is read-only - arriving, looking, and reloading never consume a
 * use of a shared link.
 */
export const metadata: Metadata = { title: 'Invitation' }
export const dynamic = 'force-dynamic'

const REJECTION_COPY: Record<InvitationRejection, { title: string; description: string }> = {
  EXPIRED: {
    title: 'This invitation has expired',
    description: 'Invitations last two weeks. Ask the Keeper to send a fresh link.',
  },
  REVOKED: {
    title: 'This invitation was withdrawn',
    description: 'The Keeper revoked this link. Ask them for a new one if that was a mistake.',
  },
  EXHAUSTED: {
    title: 'This invitation has been used up',
    description: 'The link reached the number of people it was issued for.',
  },
  NOT_FOR_YOU: {
    title: 'This invitation is for somebody else',
    description:
      'It was issued for one specific person and cannot be used by anyone else, even if it was forwarded to you.',
  },
  INVALID: {
    title: 'This invitation is not valid',
    description: 'Check that you copied the whole address, then ask the Keeper for a new link.',
  },
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const user = await requireUser()
  const preview = await previewInvitation(token, user.id, new Date())

  if (!preview.ok) {
    const copy = REJECTION_COPY[preview.reason]
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 font-ui text-sm text-text-secondary">
          <p>{copy.description}</p>
          <ButtonLink variant="outline" href="/campaigns">
            Back to campaigns
          </ButtonLink>
        </CardContent>
      </Card>
    )
  }

  if (preview.alreadyMember) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>You are already in {preview.campaignName}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 font-ui text-sm text-text-secondary">
          <p>Nothing to accept - the campaign is already on your list.</p>
          <ButtonLink variant="accent" href={`/campaigns/${preview.campaignId}`}>
            Open campaign
          </ButtonLink>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card ornamented className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>{preview.campaignName}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <dl className="flex flex-col gap-2 font-ui text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Kept by</dt>
            <dd className="text-text-primary">{preview.keeperNames.join(', ') || '-'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Members</dt>
            <dd className="text-text-primary">{preview.memberCount}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">You would join as</dt>
            <dd className="text-text-primary">
              {preview.roleOnJoin === 'KEEPER' ? 'Keeper' : 'Investigator'}
            </dd>
          </div>
        </dl>

        <AcceptInvitation token={token} />
      </CardContent>
    </Card>
  )
}
