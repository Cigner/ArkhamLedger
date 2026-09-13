'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { readString } from '@/lib/form-data'
import { resetPassword } from '@/lib/auth/client'
import { FormError } from './form-error'
import { PasswordFields } from './password-fields'

/**
 * Sets a new password from a reset link.
 *
 * Password confirmation is checked here because the auth library's endpoint only
 * takes one password; the server still enforces length and the weak-password
 * rejection list, so this check is convenience rather than the control.
 *
 * Completing a reset ends every other session, so the user is sent back to sign
 * in rather than being dropped into the application with a stale one.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter()
  const [navigating, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const form = new FormData(event.currentTarget)
    const password = readString(form, 'password')
    const confirmPassword = readString(form, 'confirmPassword')

    if (password !== confirmPassword) {
      setError('The two passwords do not match.')
      return
    }

    setPending(true)
    const result = await resetPassword({ newPassword: password, token })
    setPending(false)

    if (result.error) {
      setError(
        result.error.status === 400
          ? 'This link is no longer valid. Request a new one.'
          : 'Could not set your password. Try a longer passphrase.',
      )
      return
    }

    startTransition(() => {
      router.push('/sign-in?reset=1')
      router.refresh()
    })
  }

  const busy = pending || navigating

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4" noValidate>
      <PasswordFields disabled={busy} />
      <FormError>{error}</FormError>
      <Button type="submit" variant="accent" size="lg" disabled={busy}>
        {busy ? 'Setting password…' : 'Set password'}
      </Button>
    </form>
  )
}
