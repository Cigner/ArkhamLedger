import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
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
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('campaigns.invitePage')
  return { title: t('metadata') }
}
export const dynamic = 'force-dynamic'

const REJECTION_KEYS: Record<InvitationRejection, string> = {
  EXPIRED: 'expired',
  REVOKED: 'revoked',
  EXHAUSTED: 'exhausted',
  NOT_FOR_YOU: 'notForYou',
  INVALID: 'invalid',
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const t = await getTranslations('campaigns.invitePage')
  const user = await requireUser()
  const preview = await previewInvitation(token, user.id, new Date())

  if (!preview.ok) {
    const key = REJECTION_KEYS[preview.reason]
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>{t(`rejections.${key}.title`)}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 font-ui text-sm text-text-secondary">
          <p>{t(`rejections.${key}.description`)}</p>
          <ButtonLink variant="outline" href="/campaigns">
            {t('back')}
          </ButtonLink>
        </CardContent>
      </Card>
    )
  }

  if (preview.alreadyMember) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>{t('alreadyMemberTitle', { campaign: preview.campaignName })}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 font-ui text-sm text-text-secondary">
          <p>{t('alreadyMemberDescription')}</p>
          <ButtonLink variant="accent" href={`/campaigns/${preview.campaignId}`}>
            {t('openCampaign')}
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
            <dt className="text-text-muted">{t('keptBy')}</dt>
            <dd className="text-text-primary">{preview.keeperNames.join(', ') || '-'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">{t('members')}</dt>
            <dd className="text-text-primary">{preview.memberCount}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">{t('joinAs')}</dt>
            <dd className="text-text-primary">
              {preview.roleOnJoin === 'KEEPER' ? t('keeper') : t('investigator')}
            </dd>
          </div>
        </dl>

        <AcceptInvitation token={token} />
      </CardContent>
    </Card>
  )
}
