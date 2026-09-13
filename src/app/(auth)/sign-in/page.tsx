import type { Metadata } from 'next'
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
export const metadata: Metadata = { title: 'Sign in' }

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
  const { next } = await searchParams
  const target = safeRedirectTarget(next)

  if (user) redirect(target)

  return (
    <AuthCard
      title="Sign in"
      description="Accounts are created by an administrator. If you do not have one, ask them for an activation link."
      footer={
        <Link href="/forgot-password" className="text-accent-text underline-offset-4 hover:underline">
          Forgot your password?
        </Link>
      }
    >
      <SignInForm next={target} />
    </AuthCard>
  )
}
