'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAutosave } from '@/lib/hooks/use-autosave'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { saveInvestigatorFinances } from '../actions/sheet'
import { calculateStartingFinances } from '../domain/finances'
import type { ProjectedSheet } from '../domain/sheet'
import { SheetSection } from './sheet-section'

/**
 * What the character can afford.
 *
 * Almost all of this is read out of Credit Rating rather than typed: the living
 * standard, the spending level and the starting amounts are a table lookup, and
 * a form that asked for them would be asking somebody to copy a book.
 *
 * Cash and assets are editable because play changes them. The starting figures
 * stay on screen beside them, so it is always visible how far a character has
 * drifted from where they began.
 */
export function FinancesSection({
  sheet,
  readOnly,
  onVersionChange,
}: {
  sheet: ProjectedSheet
  readOnly: boolean
  onVersionChange: (version: number) => void
}) {
  const t = useTranslations('investigators.sheet.finances')
  const standards = useTranslations('investigators.livingStandards')
  const errors = useTranslations('investigators.sheet.errors')
  const router = useRouter()

  const [cash, setCash] = useState(sheet.finances.cash?.toString() ?? '')
  const [assets, setAssets] = useState(sheet.finances.assets?.toString() ?? '')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const creditRating = sheet.finances.creditRating
  const starting =
    creditRating === null
      ? null
      : calculateStartingFinances(sheet.era === 'MODERN' ? 'MODERN' : 'CLASSIC_1920S', creditRating)

  const submit = () => {
    setError(null)
    save.execute({
      investigatorId: sheet.id,
      expectedVersion: sheet.lockVersion,
      cash: cash === '' ? null : Number(cash),
      assets: assets === '' ? null : Number(assets),
      notes: notes || null,
    })
  }

  const save = useAction(saveInvestigatorFinances, {
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

  useAutosave({ value: { cash, assets, notes }, onSave: submit, enabled: !readOnly })

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
      {creditRating === null ? (
        <p className="font-ui text-sm text-text-muted">{t('needsCreditRating')}</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-sm bg-surface-raised p-4 sm:grid-cols-4">
          <Figure label={t('creditRating')} value={String(creditRating)} />
          <Figure
            label={t('livingStandard')}
            value={starting?.ok ? standards(starting.value.livingStandard) : '—'}
          />
          <Figure
            label={t('spendingLevel')}
            value={starting?.ok ? String(starting.value.spendingLevel) : '—'}
          />
          <Figure
            label={t('startingCash')}
            value={starting?.ok ? String(starting.value.cash) : '—'}
          />
        </dl>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="finances-cash">{t('cash')}</FieldLabel>
          <Input
            id="finances-cash"
            type="number"
            inputMode="decimal"
            min={0}
            value={cash}
            onChange={(event) => {
              setCash(event.target.value)
              setSaved(false)
            }}
            disabled={readOnly}
          />
          <FieldDescription>{t('cashHint')}</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="finances-assets">{t('assets')}</FieldLabel>
          <Input
            id="finances-assets"
            type="number"
            inputMode="decimal"
            min={0}
            value={assets}
            onChange={(event) => {
              setAssets(event.target.value)
              setSaved(false)
            }}
            disabled={readOnly}
          />
          <FieldDescription>
            {starting?.ok && starting.value.assetsUnboundedAbove
              ? t('assetsUnbounded')
              : t('assetsHint')}
          </FieldDescription>
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="finances-notes">{t('notes')}</FieldLabel>
        <Textarea
          id="finances-notes"
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value)
            setSaved(false)
          }}
          maxLength={2000}
          disabled={readOnly}
        />
      </Field>
    </SheetSection>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
        {label}
      </dt>
      <dd className="font-ui text-sm tabular-nums text-text-primary">{value}</dd>
    </div>
  )
}
