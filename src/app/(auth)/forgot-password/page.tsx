import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { AuthCard } from '@/modules/identity/ui/auth-card'
import { ForgotPasswordForm } from '@/modules/identity/ui/forgot-password-form'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.forgotPassword')
  return { title: t('title') }
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth.forgotPassword')

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
      <ForgotPasswordForm />
    </AuthCard>
  )
}
