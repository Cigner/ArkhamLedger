'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { readString } from '@/lib/form-data'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { signIn } from '@/lib/auth/client'
import { FormError } from './form-error'

/**
 * Credential sign-in.
 *
 * Every failure renders the same message regardless of cause — unknown address,
 * wrong password, disabled account — so the form cannot be used to discover
 * which addresses have accounts. The one exception is throttling, which has to
 * say what it is or the user will simply keep retrying.
 */
export function SignInForm({ next }: { next: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const form = new FormData(event.currentTarget)
    const email = readString(form, 'email')
    const password = readString(form, 'password')

    const result = await signIn.email({ email, password })

    if (result.error) {
      setError(
        result.error.status === 429
          ? 'Too many attempts. Wait a few minutes and try again.'
          : 'Invalid credentials.',
      )
      return
    }

    startTransition(() => {
      router.push(next)
      router.refresh()
    })
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

      <Field>
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
        />
      </Field>

      <FormError>{error}</FormError>

      <Button type="submit" variant="accent" size="lg" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}
