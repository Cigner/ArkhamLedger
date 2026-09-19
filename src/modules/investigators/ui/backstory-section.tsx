'use client'

import { Star } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { useAutosave } from '@/lib/hooks/use-autosave'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { saveInvestigatorBackstory } from '../actions/sheet'
import { BACKSTORY_CATEGORIES } from '../domain/constants'
import type { ProjectedSheet } from '../domain/sheet'
import { SheetSection } from './sheet-section'

/**
 * The ten boxes.
 *
 * Laid out as the printed sheet lays them out, in the same order, because people
 * who have made a character before are looking for the box they already know.
 *
 * One entry may be marked the key connection - the thing that would pull this
 * character back in when any sensible person would walk away. It is one per
 * character by construction rather than by validation: choosing a second
 * unmarks the first.
 */
export function BackstorySection({
  sheet,
  readOnly,
  onVersionChange,
}: {
  sheet: ProjectedSheet
  readOnly: boolean
  onVersionChange: (version: number) => void
}) {
  const t = useTranslations('investigators.sheet.backstory')
  const categories = useTranslations('investigators.backstoryCategories')
  const errors = useTranslations('investigators.sheet.errors')
  const router = useRouter()

  const [entries, setEntries] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      BACKSTORY_CATEGORIES.map((category) => [
        category,
        sheet.backstory.find((entry) => entry.category === category)?.content ?? '',
      ]),
    ),
  )
  const [keyConnection, setKeyConnection] = useState<string | null>(
    sheet.backstory.find((entry) => entry.isKeyConnection)?.category ?? null,
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const submit = () => {
    setError(null)
    save.execute({
      investigatorId: sheet.id,
      expectedVersion: sheet.lockVersion,
      entries: BACKSTORY_CATEGORIES.map((category) => ({
        category,
        content: entries[category] ?? '',
        isKeyConnection: keyConnection === category,
      })),
    })
  }

  const save = useAction(saveInvestigatorBackstory, {
    onSuccess: ({ data }) => {
      setSaved(true)
      if (data?.version !== undefined) onVersionChange(data.version)
      router.refresh()
    },
    onError: ({ error: actionError }) => {
      setSaved(false)
      setError(
        resolveActionError(
          { 'investigators.errors.sheetMovedOn': errors('sheetMovedOn') },
          errors('saveFailed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  useAutosave({ value: { entries, keyConnection }, onSave: submit, enabled: !readOnly })

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
      <div className="flex flex-col gap-5">
        {BACKSTORY_CATEGORIES.map((category) => (
          <Field key={category}>
            <div className="flex items-center justify-between gap-3">
              <FieldLabel htmlFor={`backstory-${category}`}>{categories(category)}</FieldLabel>
              {readOnly ? null : (
                <label className="flex items-center gap-1.5 font-ui text-xs text-text-muted">
                  <Checkbox
                    checked={keyConnection === category}
                    onCheckedChange={(checked) => {
                      setKeyConnection(checked ? category : null)
                      setSaved(false)
                    }}
                  />
                  <Star className="size-3" aria-hidden="true" />
                  {t('keyConnection')}
                </label>
              )}
            </div>
            <Textarea
              id={`backstory-${category}`}
              rows={2}
              value={entries[category] ?? ''}
              onChange={(event) => {
                setEntries((current) => ({ ...current, [category]: event.target.value }))
                setSaved(false)
              }}
              maxLength={4000}
              disabled={readOnly}
            />
          </Field>
        ))}
      </div>

      <p className="font-ui text-xs text-text-muted">{t('keyConnectionHint')}</p>
    </SheetSection>
  )
}
