import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { AuthCard } from '@/modules/identity/ui/auth-card'
import { ResetPasswordForm } from '@/modules/identity/ui/reset-password-form'

/**
 * Reset screen.
 *
 * Unlike activation, the token is not validated before rendering: the auth
 * library owns these tokens and exposes no read-only check, and probing one by
 * attempting a reset would consume it. An invalid token therefore surfaces on
 * submit instead.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.resetPassword')
  return { title: t('title') }
}

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const t = await getTranslations('auth.resetPassword')

  return (
    <AuthCard
      title={t('title')}
      description={t('description')}
      footer={
        <Link href="/sign-in" className="text-accent-text underline-offset-4 hover:underline">
          {t('back')}
        </Link>
      }
    >
      <ResetPasswordForm token={token} />
    </AuthCard>
  )
}
