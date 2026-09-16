import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getOptionalUser } from '@/lib/auth'
import { AuthCard } from '@/modules/identity/ui/auth-card'
import { SignInForm } from '@/modules/identity/ui/sign-in-form'

/**
 * Sign-in screen.
 *
 * The `next` parameter is restricted to same-site paths: accepting an arbitrary
 * URL here would turn the sign-in page into an open redirect, which is a
 * convincing phishing primitive precisely because the domain is genuine.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signIn')
  return { title: t('title') }
}

function safeRedirectTarget(next: string | undefined): string {
  if (!next) return '/campaigns'
  if (!next.startsWith('/') || next.startsWith('//')) return '/campaigns'
  return next
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const user = await getOptionalUser()
  const t = await getTranslations('auth.signIn')
  const { next } = await searchParams
  const target = safeRedirectTarget(next)

  if (user) redirect(target)

  return (
    <AuthCard
      title={t('title')}
      description={t('description')}
      footer={
        <Link
          href="/forgot-password"
          className="text-accent-text underline-offset-4 hover:underline"
        >
          {t('forgotPassword')}
        </Link>
      }
    >
      <SignInForm next={target} />
    </AuthCard>
  )
}
