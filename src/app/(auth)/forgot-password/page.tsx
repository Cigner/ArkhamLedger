import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthCard } from '@/modules/identity/ui/auth-card'
import { ForgotPasswordForm } from '@/modules/identity/ui/forgot-password-form'

export const metadata: Metadata = { title: 'Reset your password' }

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter the address your account uses and we will send a link to set a new password."
      footer={
        <Link href="/sign-in" className="text-accent-text underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  )
}
