'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/patterns/icon-button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { addInvestigatorSkill, removeInvestigatorSkill, saveSkills } from '../actions/skills'
import type { SheetOptions } from '../data/sheet-options'
import { calculateSuccessThresholds } from '../domain/derived-values'
import { parseSkillKey } from '../domain/occupation-choices'
import type { ProjectedSheet } from '../domain/sheet'
import { SheetSection } from './sheet-section'

/**
 * Spending the two budgets.
 *
 * The counters are the whole interface. Somebody allocating points is answering
 * one question repeatedly - "how much have I got left" - and a form that only
 * answers it on submit turns that into arithmetic they have to do themselves.
 *
 * Occupation points may only go on occupation skills, which is why those columns
 * are disabled elsewhere rather than merely validated: a control that accepts a
 * number and then refuses it is worse than one that never offered.
 */
export function SkillsSection({
  sheet,
  options,
  readOnly,
  onVersionChange,
}: {
  sheet: ProjectedSheet
  options: SheetOptions
  readOnly: boolean
  onVersionChange: (version: number) => void
}) {
  const t = useTranslations('investigators.sheet.skills')
  const errors = useTranslations('investigators.sheet.errors')
  const names = useTranslations('investigators')
  const router = useRouter()

  const [values, setValues] = useState<Record<string, { occupation: string; personal: string }>>(
    () =>
      Object.fromEntries(
        sheet.skills.map((skill) => [
          `${skill.definitionId}${skill.specializationKey ? `:${skill.specializationKey}` : ''}`,
          {
            occupation: String(skill.occupationPoints),
            personal: String(skill.personalInterestPoints),
          },
        ]),
      ),
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const rows = useMemo(
    () =>
      sheet.skills.map((skill) => {
        const skillKey = `${skill.definitionId}${
          skill.specializationKey ? `:${skill.specializationKey}` : ''
        }`
        const entry = values[skillKey] ?? { occupation: '0', personal: '0' }
        const occupationPoints = Number(entry.occupation) || 0
        const personalPoints = Number(entry.personal) || 0

        return {
          skillKey,
          skill,
          occupationPoints,
          personalPoints,
          total:
            skill.baseValue +
            occupationPoints +
            personalPoints +
            skill.playImprovement +
            skill.otherAdjustment,
        }
      }),
    [sheet.skills, values],
  )

  const spent = rows.reduce(
    (totals, row) => ({
      occupation: totals.occupation + row.occupationPoints,
      personal: totals.personal + row.personalPoints,
    }),
    { occupation: 0, personal: 0 },
  )

  const occupationBudget = options.budgets.occupationPoints
  const personalBudget = options.budgets.personalInterestPoints

  const save = useAction(saveSkills, {
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
            'investigators.errors.occupationPointBudgetExceeded': t('errors.occupationExceeded'),
            'investigators.errors.personalInterestPointBudgetExceeded':
              t('errors.personalExceeded'),
            'investigators.errors.creditRatingOutsideOccupationRange': t('errors.creditRating'),
            'investigators.errors.cthulhuMythosCannotReceiveCreationPoints': t('errors.mythos'),
            'investigators.errors.skillValueOutOfRange': t('errors.valueOutOfRange'),
            'investigators.errors.occupationRequired': t('errors.occupationFirst'),
          },
          errors('saveFailed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  const set = (skillKey: string, field: 'occupation' | 'personal', value: string) => {
    setValues((current) => ({
      ...current,
      [skillKey]: { ...(current[skillKey] ?? { occupation: '0', personal: '0' }), [field]: value },
    }))
    setSaved(false)
  }

  const [newSkill, setNewSkill] = useState('')
  const [specialization, setSpecialization] = useState('')

  const add = useAction(addInvestigatorSkill, {
    onSuccess: ({ data }) => {
      if (data?.version !== undefined) onVersionChange(data.version)
      setNewSkill('')
      setSpecialization('')
      router.refresh()
    },
    onError: ({ error: actionError }) => {
      setError(
        resolveActionError(
          {
            'investigators.errors.skillAlreadyOnSheet': t('errors.alreadyOnSheet'),
            'investigators.errors.specializationRequired': t('errors.specializationRequired'),
            'investigators.errors.sheetMovedOn': errors('sheetMovedOn'),
          },
          errors('saveFailed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  const drop = useAction(removeInvestigatorSkill, {
    onSuccess: () => router.refresh(),
    onError: () => setError(t('errors.cannotRemove')),
  })

  const addable = options.skills.filter((entry) => {
    const parsed = parseSkillKey(entry.skillKey)
    const isFamily = parsed.specializationKey === 'CHOOSE'
    if (isFamily) return true
    return !sheet.skills.some(
      (skill) => skill.definitionId === parsed.definitionId && skill.specializationKey === '',
    )
  })

  const chosenIsFamily = parseSkillKey(newSkill).specializationKey === 'CHOOSE'

  const skillName = (definitionId: string, specializationKey: string): string => {
    const option = options.skills.find((entry) => {
      const parsed = parseSkillKey(entry.skillKey)
      return parsed.definitionId === definitionId && parsed.specializationKey === ''
    })
    const base = option ? names(option.nameKey.replace('investigators.', '')) : definitionId
    return specializationKey ? `${base} (${specializationKey})` : base
  }

  if (sheet.skills.length === 0) {
    return (
      <SheetSection title={t('title')} description={t('description')} readOnly>
        <p className="font-ui text-sm text-text-muted">{t('chooseOccupationFirst')}</p>
      </SheetSection>
    )
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
          allocations: rows.map((row) => ({
            skillKey: row.skillKey,
            occupationPoints: row.occupationPoints,
            personalInterestPoints: row.personalPoints,
          })),
        })
      }}
    >
      <div className="flex flex-wrap gap-6 rounded-sm bg-surface-raised p-4">
        <Counter label={t('occupationPoints')} spent={spent.occupation} budget={occupationBudget} />
        <Counter label={t('personalPoints')} spent={spent.personal} budget={personalBudget} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse">
          <thead>
            <tr className="border-b border-border-subtle text-left">
              <th className="py-2 font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
                {t('columns.skill')}
              </th>
              <th className="py-2 text-right font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
                {t('columns.base')}
              </th>
              <th className="w-24 py-2 text-right font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
                {t('columns.occupation')}
              </th>
              <th className="w-24 py-2 text-right font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
                {t('columns.personal')}
              </th>
              <th className="py-2 text-right font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
                {t('columns.total')}
              </th>
              <th className="w-10 py-2">
                <span className="sr-only">{t('remove')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const thresholds = calculateSuccessThresholds(row.total)

              return (
                <tr key={row.skillKey} className="border-b border-border-subtle/60">
                  <td className="py-1.5 font-ui text-sm text-text-primary">
                    {skillName(row.skill.definitionId, row.skill.specializationKey)}
                    {row.skill.isOccupationSkill ? (
                      <span className="ml-2 font-ui text-2xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
                        {t('occupationSkill')}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 text-right font-ui text-sm tabular-nums text-text-muted">
                    {row.skill.baseValue}
                  </td>
                  <td className="py-1.5 text-right">
                    <Input
                      aria-label={t('columns.occupation')}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={99}
                      className="text-right"
                      value={values[row.skillKey]?.occupation ?? '0'}
                      onChange={(event) => set(row.skillKey, 'occupation', event.target.value)}
                      disabled={readOnly || !row.skill.isOccupationSkill}
                    />
                  </td>
                  <td className="py-1.5 text-right">
                    <Input
                      aria-label={t('columns.personal')}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={99}
                      className="text-right"
                      value={values[row.skillKey]?.personal ?? '0'}
                      onChange={(event) => set(row.skillKey, 'personal', event.target.value)}
                      disabled={readOnly}
                    />
                  </td>
                  <td className="py-1.5 text-right font-ui text-sm tabular-nums text-text-primary">
                    {row.total}
                    <span className="ml-2 text-xs text-text-muted">
                      {thresholds.hard}/{thresholds.extreme}
                    </span>
                  </td>
                  <td className="py-1.5 text-right">
                    {readOnly || row.skill.isOccupationSkill ? null : (
                      <IconButton
                        label={t('remove')}
                        variant="ghost"
                        icon={<Trash2 className="size-4" aria-hidden="true" />}
                        onClick={() =>
                          drop.execute({ investigatorId: sheet.id, skillKey: row.skillKey })
                        }
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {readOnly ? null : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Select value={newSkill} onValueChange={(value) => setNewSkill(String(value))}>
              <SelectTrigger aria-label={t('addSkill')}>
                <SelectValue placeholder={t('addSkill')}>
                  {(value: string) => {
                    if (!value) return ''
                    const parsed = parseSkillKey(value)
                    return skillName(
                      parsed.definitionId,
                      parsed.specializationKey === 'CHOOSE' ? '' : parsed.specializationKey,
                    )
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {addable.map((entry) => {
                  const parsed = parseSkillKey(entry.skillKey)
                  return (
                    <SelectItem key={entry.skillKey} value={entry.skillKey}>
                      {skillName(parsed.definitionId, '')}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {chosenIsFamily ? (
            <Input
              aria-label={t('specialization')}
              placeholder={t('specialization')}
              value={specialization}
              onChange={(event) => setSpecialization(event.target.value)}
              maxLength={100}
              className="w-48"
            />
          ) : null}

          <Button
            type="button"
            variant="ghost"
            disabled={newSkill === '' || add.isPending || (chosenIsFamily && specialization === '')}
            onClick={() => {
              setError(null)
              add.execute({
                investigatorId: sheet.id,
                expectedVersion: sheet.lockVersion,
                definitionId: parseSkillKey(newSkill).definitionId,
                specialization: chosenIsFamily ? specialization : null,
              })
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t('addSkill')}
          </Button>
        </div>
      )}
    </SheetSection>
  )
}

function Counter({
  label,
  spent,
  budget,
}: {
  label: string
  spent: number
  budget: number | null
}) {
  const remaining = budget === null ? null : budget - spent
  const over = remaining !== null && remaining < 0

  return (
    <div className="flex flex-col">
      <span className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
        {label}
      </span>
      <span
        className={`font-ui text-lg tabular-nums ${over ? 'text-status-danger' : 'text-text-primary'}`}
      >
        {budget === null ? '—' : `${remaining} / ${budget}`}
      </span>
    </div>
  )
}
