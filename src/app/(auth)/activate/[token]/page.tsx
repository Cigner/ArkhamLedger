import type { Metadata } from 'next'
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
export const metadata: Metadata = { title: 'Set your password' }
export const dynamic = 'force-dynamic'

const REJECTION_COPY: Record<TokenRejection, { title: string; description: string }> = {
  EXPIRED: {
    title: 'This link has expired',
    description:
      'Activation links are valid for a limited time. Ask your administrator to issue a new one.',
  },
  ALREADY_USED: {
    title: 'This link has already been used',
    description: 'The account is set up. Sign in with the password you chose.',
  },
  INVALID: {
    title: 'This link is not valid',
    description:
      'Check that you copied the whole address. If it still fails, ask your administrator for a new link.',
  },
}

export default async function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const check = await checkActivationToken(token, new Date())

  if (!check.ok) {
    const copy = REJECTION_COPY[check.reason]
    return (
      <AuthCard
        title={copy.title}
        description={copy.description}
        footer={
          <Link href="/sign-in" className="text-accent-text underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div />
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Set your password"
      description={`Welcome, ${check.name}. Choose a password for ${check.email}.`}
    >
      <ActivateForm token={token} />
    </AuthCard>
  )
}
