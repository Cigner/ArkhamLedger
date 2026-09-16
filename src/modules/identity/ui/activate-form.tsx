'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
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
export function ActivateForm({ token }: { token: string }) {
  const t = useTranslations()
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
          {
            'identity.errors.passwordTooShort': t('identity.errors.passwordTooShort'),
            'identity.errors.passwordTooCommon': t('identity.errors.passwordTooCommon'),
            'identity.errors.passwordsDoNotMatch': t('identity.errors.passwordsDoNotMatch'),
            'identity.errors.tokenInvalid': t('identity.errors.tokenInvalid'),
            'identity.errors.accountAlreadyActive': t('identity.errors.accountAlreadyActive'),
          },
          t('auth.activate.errors.failed'),
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
        {busy ? t('auth.activate.pending') : t('auth.activate.submit')}
      </Button>
    </form>
  )
}
