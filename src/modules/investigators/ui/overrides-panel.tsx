'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormError } from '@/modules/identity/ui/form-error'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { setInvestigatorOverride } from '../actions/sheet'
import { OVERRIDABLE_DERIVED_KEYS, type OverridableDerivedKey } from '../domain/derived-values'
import type { ProjectedSheet } from '../domain/sheet'

/**
 * A number the rules got wrong for this character.
 *
 * Section 8 allows a calculated value to be replaced by hand, with a reason,
 * clearly marked. Scenarios do this - a blessing, a wound that never healed,
 * an agreement at the table - and a sheet that cannot record it forces somebody
 * to keep the real number on paper beside it.
 *
 * Withdrawing one also asks for a reason. Putting a value back where the rules
 * had it is a decision as much as taking it away was.
 */
export function OverridesPanel({
  sheet,
  readOnly,
  onVersionChange,
}: {
  sheet: ProjectedSheet
  readOnly: boolean
  onVersionChange: (version: number) => void
}) {
  const t = useTranslations('investigators.overrides')
  const labels = useTranslations('investigators.fields')
  const errors = useTranslations('investigators.sheet.errors')
  const router = useRouter()

  const [fieldKey, setFieldKey] = useState<OverridableDerivedKey>(OVERRIDABLE_DERIVED_KEYS[0])
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const save = useAction(setInvestigatorOverride, {
    onSuccess: ({ data }) => {
      if (data?.version !== undefined) onVersionChange(data.version)
      setValue('')
      setReason('')
      router.refresh()
    },
    onError: ({ error: actionError }) => {
      setError(
        resolveActionError(
          {
            'investigators.errors.sheetMovedOn': errors('sheetMovedOn'),
            'investigators.errors.reasonRequired': t('reasonRequired'),
          },
          errors('saveFailed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  const label = (key: string): string => labels(key.replace(/\./g, '_'))

  const apply = (key: OverridableDerivedKey, next: number | null, why: string) => {
    setError(null)
    save.execute({
      investigatorId: sheet.id,
      expectedVersion: sheet.lockVersion,
      fieldKey: key,
      value: next,
      reason: why,
    })
  }

  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border-subtle p-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-ui text-sm text-text-primary">{t('title')}</h3>
        <p className="font-ui text-xs text-text-muted">{t('description')}</p>
      </div>

      {sheet.overrides.length === 0 ? (
        <p className="font-ui text-sm text-text-muted">{t('none')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sheet.overrides.map((override) => (
            <li
              key={override.fieldKey}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-ui text-sm"
            >
              <span className="text-text-primary">
                {label(override.fieldKey)}: {override.value}
              </span>
              <span className="text-xs text-text-secondary">{override.reason}</span>
              {readOnly ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-auto"
                  disabled={save.isPending}
                  onClick={() =>
                    apply(override.fieldKey as OverridableDerivedKey, null, t('withdrawnReason'))
                  }
                >
                  {t('withdraw')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {readOnly ? null : (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const parsed = Number.parseInt(value, 10)
            if (!Number.isFinite(parsed)) {
              setError(t('valueRequired'))
              return
            }
            apply(fieldKey, parsed, reason)
          }}
        >
          <Field className="w-44">
            <FieldLabel htmlFor="override-field">{t('field')}</FieldLabel>
            <Select
              value={fieldKey}
              onValueChange={(next) => setFieldKey(next as OverridableDerivedKey)}
            >
              <SelectTrigger id="override-field">
                <SelectValue placeholder={t('field')}>
                  {(current: string) => label(current)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {OVERRIDABLE_DERIVED_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {label(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field className="w-24">
            <FieldLabel htmlFor="override-value">{t('value')}</FieldLabel>
            <Input
              id="override-value"
              inputMode="numeric"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </Field>

          <Field className="min-w-48 flex-1">
            <FieldLabel htmlFor="override-reason">{t('reason')}</FieldLabel>
            <Input
              id="override-reason"
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>

          <Button type="submit" variant="outline" disabled={save.isPending}>
            {t('apply')}
          </Button>
        </form>
      )}

      <FormError>{error}</FormError>
    </section>
  )
}
