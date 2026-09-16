'use client'

import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { PASSWORD_MIN_LENGTH } from '../domain/constants'

/**
 * The new-password pair used by activation, reset and change.
 *
 * States the rule before the user types rather than rejecting them afterwards,
 * and uses autocomplete="new-password" so a password manager offers to generate
 * one instead of filling in the old value.
 */
export function PasswordFields({ disabled = false }: { disabled?: boolean }) {
  const t = useTranslations('auth.passwordFields')

  return (
    <>
      <Field>
        <FieldLabel htmlFor="password">{t('password')}</FieldLabel>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          disabled={disabled}
        />
        <FieldDescription>{t('minimum', { count: PASSWORD_MIN_LENGTH })}</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="confirmPassword">{t('confirm')}</FieldLabel>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          disabled={disabled}
        />
      </Field>
    </>
  )
}
