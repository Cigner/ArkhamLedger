'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { readString } from '@/lib/form-data'
import { activateAccount } from '../actions/activation'
import { resolveActionError } from './action-errors'
import { FormError } from './form-error'
import { PasswordFields } from './password-fields'

/**
 * Sets the initial password for a newly created account.
 *
 * On success the user is already signed in by the action, so this navigates
 * straight into the application rather than sending them back to sign in with
 * credentials they chose seconds ago.
 */
const MESSAGES: Record<string, string> = {
  'identity.errors.passwordTooShort': 'That password is too short.',
  'identity.errors.passwordTooCommon': 'That password is too easy to guess. Try a longer phrase.',
  'identity.errors.passwordsDoNotMatch': 'The two passwords do not match.',
  'identity.errors.tokenInvalid': 'This link is no longer valid. Ask an administrator for a new one.',
  'identity.errors.accountAlreadyActive': 'This account has already been activated.',
}

export function ActivateForm({ token }: { token: string }) {
  const router = useRouter()
  const [navigating, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)

  const { execute, isPending } = useAction(activateAccount, {
    onSuccess: () => {
      startTransition(() => {
        router.push('/campaigns')
        router.refresh()
      })
    },
    onError: ({ error }) => {
      setFormError(
        resolveActionError(
          MESSAGES,
          'Could not set your password. Check the requirements and try again.',
          error.serverError?.messageKey,
          error.validationErrors,
        ),
      )
    },
  })

  const busy = isPending || navigating

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const form = new FormData(event.currentTarget)
    execute({
      token,
      password: readString(form, 'password'),
      confirmPassword: readString(form, 'confirmPassword'),
    })
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4" noValidate>
      <PasswordFields disabled={busy} />
      <FormError>{formError}</FormError>
      <Button type="submit" variant="accent" size="lg" disabled={busy}>
        {busy ? 'Setting password…' : 'Set password'}
      </Button>
    </form>
  )
}
