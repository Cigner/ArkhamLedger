'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { readString } from '@/lib/form-data'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { requestPasswordReset } from '@/lib/auth/client'

/**
 * Password reset request.
 *
 * Always reports the same outcome, whether or not the address has an account.
 * Anything else turns this form into a way to enumerate who is a member, and the
 * user experience cost is one sentence of extra wording.
 */
export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)

    const email = readString(new FormData(event.currentTarget), 'email')
    await requestPasswordReset({ email, redirectTo: '/reset-password' })

    setPending(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <p role="status" className="font-ui text-sm leading-[--leading-ui] text-text-secondary">
        If an account exists for that address, a reset link is on its way. It expires in an hour and
        can be used once.
      </p>
    )
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4" noValidate>
      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          disabled={pending}
        />
      </Field>

      <Button type="submit" variant="accent" size="lg" disabled={pending}>
        {pending ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  )
}
