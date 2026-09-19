'use client'

import { Plus, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { IconButton } from '@/components/patterns/icon-button'
import { Input } from '@/components/ui/input'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { saveInvestigatorPossessions } from '../actions/sheet'
import type { ProjectedSheet } from '../domain/sheet'
import { SheetSection } from './sheet-section'

/**
 * What the character is carrying.
 *
 * A free list rather than a catalog. Equipment in this game is whatever the
 * story put in somebody's hands, and a picker would be a worse version of a
 * blank line.
 *
 * Treasured possessions are marked because the sheet marks them: they are a
 * backstory entry that happens to be an object, and losing one is a scene.
 */
type Row = {
  name: string
  description: string
  quantity: string
  value: string
  isTreasured: boolean
}

function emptyRow(): Row {
  return { name: '', description: '', quantity: '1', value: '', isTreasured: false }
}

export function PossessionsSection({
  sheet,
  readOnly,
  onVersionChange,
}: {
  sheet: ProjectedSheet
  readOnly: boolean
  onVersionChange: (version: number) => void
}) {
  const t = useTranslations('investigators.sheet.possessions')
  const errors = useTranslations('investigators.sheet.errors')
  const router = useRouter()

  const [rows, setRows] = useState<Row[]>(() =>
    sheet.possessions.length === 0
      ? [emptyRow()]
      : sheet.possessions.map((possession) => ({
          name: possession.name,
          description: possession.description ?? '',
          quantity: String(possession.quantity),
          value: possession.value?.toString() ?? '',
          isTreasured: possession.isTreasured,
        })),
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const save = useAction(saveInvestigatorPossessions, {
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

  const update = (index: number, patch: Partial<Row>) => {
    setRows((current) =>
      current.map((row, position) => (position === index ? { ...row, ...patch } : row)),
    )
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
      onSave={() => {
        setError(null)
        save.execute({
          investigatorId: sheet.id,
          expectedVersion: sheet.lockVersion,
          entries: rows
            .filter((row) => row.name.trim().length > 0)
            .map((row) => ({
              name: row.name,
              description: row.description || null,
              quantity: Number(row.quantity) || 1,
              value: row.value === '' ? null : Number(row.value),
              isTreasured: row.isTreasured,
            })),
        })
      }}
    >
      <ul className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <li key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem_6rem_auto]">
            <Input
              aria-label={t('name')}
              placeholder={t('name')}
              value={row.name}
              onChange={(event) => update(index, { name: event.target.value })}
              maxLength={200}
              disabled={readOnly}
            />
            <Input
              aria-label={t('note')}
              placeholder={t('note')}
              value={row.description}
              onChange={(event) => update(index, { description: event.target.value })}
              maxLength={1000}
              disabled={readOnly}
            />
            <Input
              aria-label={t('quantity')}
              type="number"
              min={1}
              value={row.quantity}
              onChange={(event) => update(index, { quantity: event.target.value })}
              disabled={readOnly}
            />
            <Input
              aria-label={t('value')}
              type="number"
              min={0}
              placeholder={t('value')}
              value={row.value}
              onChange={(event) => update(index, { value: event.target.value })}
              disabled={readOnly}
            />
            <div className="flex items-center gap-1">
              <label className="flex items-center gap-1 font-ui text-xs text-text-muted">
                <Checkbox
                  checked={row.isTreasured}
                  onCheckedChange={(checked) => update(index, { isTreasured: Boolean(checked) })}
                  disabled={readOnly}
                />
                <Star className="size-3" aria-hidden="true" />
              </label>
              {readOnly ? null : (
                <IconButton
                  label={t('remove')}
                  variant="ghost"
                  icon={<Trash2 className="size-4" aria-hidden="true" />}
                  onClick={() => {
                    setRows((current) => current.filter((_unused, position) => position !== index))
                    setSaved(false)
                  }}
                />
              )}
            </div>
          </li>
        ))}
      </ul>

      {readOnly ? null : (
        <div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setRows((current) => [...current, emptyRow()])}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t('add')}
          </Button>
        </div>
      )}

      <p className="font-ui text-xs text-text-muted">{t('treasuredHint')}</p>
    </SheetSection>
  )
}
