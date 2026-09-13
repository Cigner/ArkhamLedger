'use client'

import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
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
  return (
    <>
      <Field>
        <FieldLabel htmlFor="password">New password</FieldLabel>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          disabled={disabled}
        />
        <FieldDescription>
          At least {PASSWORD_MIN_LENGTH} characters. Length matters more than symbols — a phrase
          you can remember beats a short tangle you cannot.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
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
