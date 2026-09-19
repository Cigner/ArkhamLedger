'use client'

import { useTranslations } from 'next-intl'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CreationMethod } from '../domain/ruleset'

/**
 * How this character's numbers came to be.
 *
 * Asked before the draft exists, because it decides what the sheet is claiming
 * rather than how it is filled in: standard rolls means these are the dice that
 * fell, assigned means the same dice placed deliberately, and manual entry means
 * a character who already existed somewhere else.
 *
 * All three are typed in - the application does not roll - so the difference is
 * in the provenance, not in the form. That is exactly why it has to be asked
 * rather than assumed: nothing later can reconstruct it.
 */
const METHODS: readonly CreationMethod[] = ['STANDARD_ROLLS', 'ASSIGNED_ROLLS', 'MANUAL_ENTRY']

export function CreationMethodField({
  value,
  onChange,
  id = 'creation-method',
}: {
  value: CreationMethod
  onChange: (method: CreationMethod) => void
  id?: string
}) {
  const t = useTranslations('investigators.creationMethod')

  const labels: Record<CreationMethod, string> = {
    STANDARD_ROLLS: t('STANDARD_ROLLS'),
    ASSIGNED_ROLLS: t('ASSIGNED_ROLLS'),
    MANUAL_ENTRY: t('MANUAL_ENTRY'),
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>{t('label')}</FieldLabel>
      <Select value={value} onValueChange={(next) => onChange(String(next) as CreationMethod)}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={t('label')}>
            {(current: string) => labels[current as CreationMethod] ?? ''}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {METHODS.map((method) => (
            <SelectItem key={method} value={method}>
              {labels[method]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>{t(`hints.${value}`)}</FieldDescription>
    </Field>
  )
}
