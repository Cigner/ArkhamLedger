import type { Metadata } from 'next'
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
export const metadata: Metadata = { title: 'Set a new password' }

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  return (
    <AuthCard
      title="Set a new password"
      description="Choose a new password. Every other signed-in session will be ended."
      footer={
        <Link href="/sign-in" className="text-accent-text underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ResetPasswordForm token={token} />
    </AuthCard>
  )
}
