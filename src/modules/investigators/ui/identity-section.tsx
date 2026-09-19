'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useAutosave } from '@/lib/hooks/use-autosave'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { saveIdentity } from '../actions/sheet'
import type { ProjectedSheet } from '../domain/sheet'
import { SheetSection } from './sheet-section'

/**
 * Who the character is.
 *
 * Age sits here rather than with the characteristics even though it changes
 * them, because it is part of who somebody is rather than what they can do. The
 * effects it has are shown next to the characteristics, where they apply.
 */
export function IdentitySection({
  sheet,
  readOnly,
  onVersionChange,
}: {
  sheet: ProjectedSheet
  readOnly: boolean
  onVersionChange: (version: number) => void
}) {
  const t = useTranslations('investigators.sheet.identity')
  const errors = useTranslations('investigators.sheet.errors')
  const router = useRouter()

  const [values, setValues] = useState({
    name: sheet.identity.name ?? '',
    age: sheet.identity.age?.toString() ?? '',
    sex: sheet.identity.sex ?? '',
    residence: sheet.identity.residence ?? '',
    birthplace: sheet.identity.birthplace ?? '',
    species: sheet.identity.species,
  })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const save = useAction(saveIdentity, {
    onSuccess: ({ data }) => {
      setSaved(true)
      if (data?.version !== undefined) onVersionChange(data.version)
      router.refresh()
    },
    onError: ({ error: actionError }) => {
      setSaved(false)
      setError(
        resolveActionError(
          {
            'investigators.errors.sheetMovedOn': errors('sheetMovedOn'),
            'investigators.errors.nameRequired': errors('nameRequired'),
            'investigators.errors.ageOutOfRange': errors('ageOutOfRange'),
          },
          errors('saveFailed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  const submit = () => {
    setError(null)
    save.execute({
      investigatorId: sheet.id,
      expectedVersion: sheet.lockVersion,
      name: values.name,
      age: values.age === '' ? null : Number(values.age),
      sex: values.sex || null,
      residence: values.residence || null,
      birthplace: values.birthplace || null,
      species: values.species || 'Human',
    })
  }

  /*
   * Only once there is a name. Autosaving an empty section would refuse on the
   * server and show an error to somebody who has not finished their first word.
   */
  useAutosave({
    value: values,
    onSave: submit,
    enabled: !readOnly && values.name.trim().length > 0,
  })

  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [key]: event.target.value }))
    setSaved(false)
  }

  return (
    <SheetSection
      title={t('title')}
      description={t('description')}
      readOnly={readOnly}
      pending={save.isPending}
      saved={saved}
      error={error}
      onSave={submit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="identity-name">{t('name')}</FieldLabel>
          <Input
            id="identity-name"
            value={values.name}
            onChange={set('name')}
            maxLength={160}
            disabled={readOnly}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="identity-age">{t('age')}</FieldLabel>
          <Input
            id="identity-age"
            type="number"
            inputMode="numeric"
            min={15}
            max={90}
            value={values.age}
            onChange={set('age')}
            disabled={readOnly}
          />
          <FieldDescription>{t('ageHint')}</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="identity-sex">{t('sex')}</FieldLabel>
          <Input
            id="identity-sex"
            value={values.sex}
            onChange={set('sex')}
            maxLength={80}
            disabled={readOnly}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="identity-residence">{t('residence')}</FieldLabel>
          <Input
            id="identity-residence"
            value={values.residence}
            onChange={set('residence')}
            maxLength={200}
            disabled={readOnly}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="identity-birthplace">{t('birthplace')}</FieldLabel>
          <Input
            id="identity-birthplace"
            value={values.birthplace}
            onChange={set('birthplace')}
            maxLength={200}
            disabled={readOnly}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="identity-species">{t('species')}</FieldLabel>
          <Input
            id="identity-species"
            value={values.species}
            onChange={set('species')}
            maxLength={80}
            disabled={readOnly}
          />
          <FieldDescription>{t('speciesHint')}</FieldDescription>
        </Field>
      </div>
    </SheetSection>
  )
}
