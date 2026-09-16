import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { checkActivationToken } from '@/modules/identity/data/activation'
import { AuthCard } from '@/modules/identity/ui/auth-card'
import { ActivateForm } from '@/modules/identity/ui/activate-form'
import type { TokenRejection } from '@/modules/identity/domain/types'

/**
 * Activation screen.
 *
 * The token is checked before rendering so a dead link gets a specific
 * explanation instead of a form that fails on submit. Distinguishing expired
 * from already-used is safe here: possession of the token is already required to
 * see either message, so neither reveals anything to someone who does not have it.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.activate')
  return { title: t('title') }
}
export const dynamic = 'force-dynamic'

const REJECTION_KEYS: Record<TokenRejection, 'expired' | 'used' | 'invalid'> = {
  EXPIRED: 'expired',
  ALREADY_USED: 'used',
  INVALID: 'invalid',
}

export default async function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const t = await getTranslations('auth.activate')
  const check = await checkActivationToken(token, new Date())

  if (!check.ok) {
    const key = REJECTION_KEYS[check.reason]
    return (
      <AuthCard
        title={t(`rejections.${key}.title`)}
        description={t(`rejections.${key}.description`)}
        footer={
          <Link href="/sign-in" className="text-accent-text underline-offset-4 hover:underline">
            {t('back')}
          </Link>
        }
      >
        <div />
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={t('title')}
      description={t('welcome', { name: check.name, email: check.email })}
    >
      <ActivateForm token={token} />
    </AuthCard>
  )
}
