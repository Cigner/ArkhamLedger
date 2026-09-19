'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
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
import { saveInvestigatorWeapons } from '../actions/sheet'
import type { SheetOptions } from '../data/sheet-options'
import { calculateSuccessThresholds } from '../domain/derived-values'
import { parseSkillKey, skillKeyOf } from '../domain/occupation-choices'
import type { ProjectedSheet } from '../domain/sheet'
import { SheetSection } from './sheet-section'

/**
 * What the character can fight with.
 *
 * The skill is chosen from the character's own skills rather than typed, so a
 * weapon cannot end up pointing at a skill they do not have - and the chance of
 * hitting with it is shown next to it, which is the number anybody reaching for
 * this section actually wants.
 *
 * Damage is text on purpose. It is dice notation with exceptions the rules spell
 * out in prose, and parsing it would buy nothing the table cannot read for
 * itself.
 */
type Row = {
  name: string
  skillKey: string
  damage: string
  range: string
  attacks: string
  ammunition: string
  malfunction: string
}

function emptyRow(defaultSkill: string): Row {
  return {
    name: '',
    skillKey: defaultSkill,
    damage: '',
    range: '',
    attacks: '1',
    ammunition: '',
    malfunction: '',
  }
}

export function WeaponsSection({
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
  const t = useTranslations('investigators.sheet.weapons')
  const names = useTranslations('investigators')
  const errors = useTranslations('investigators.sheet.errors')
  const router = useRouter()

  const ownSkills = sheet.skills.map((skill) => ({
    skillKey: skillKeyOf(skill.definitionId, skill.specializationKey || null),
    value: skill.currentValue,
    definitionId: skill.definitionId,
    specializationKey: skill.specializationKey,
  }))

  const skillName = (skillKey: string): string => {
    const { definitionId, specializationKey } = parseSkillKey(skillKey)
    const option = options.skills.find(
      (entry) => parseSkillKey(entry.skillKey).definitionId === definitionId,
    )
    const base = option ? names(option.nameKey.replace('investigators.', '')) : definitionId
    return specializationKey ? `${base} (${specializationKey})` : base
  }

  const [rows, setRows] = useState<Row[]>(() =>
    sheet.weapons.map((weapon) => ({
      name: weapon.name,
      skillKey: weapon.skillKey,
      damage: weapon.damage,
      range: weapon.range ?? '',
      attacks: weapon.attacks ?? '',
      ammunition: weapon.ammunition?.toString() ?? '',
      malfunction: weapon.malfunction?.toString() ?? '',
    })),
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const save = useAction(saveInvestigatorWeapons, {
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

  if (ownSkills.length === 0) {
    return (
      <SheetSection title={t('title')} description={t('description')} readOnly>
        <p className="font-ui text-sm text-text-muted">{t('needsSkills')}</p>
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
          entries: rows
            .filter((row) => row.name.trim().length > 0 && row.damage.trim().length > 0)
            .map((row) => ({
              name: row.name,
              skillKey: row.skillKey,
              damage: row.damage,
              range: row.range || null,
              attacks: row.attacks || null,
              ammunition: row.ammunition === '' ? null : Number(row.ammunition),
              malfunction: row.malfunction === '' ? null : Number(row.malfunction),
              notes: null,
            })),
        })
      }}
    >
      <ul className="flex flex-col gap-3">
        {rows.map((row, index) => {
          const skill = ownSkills.find((entry) => entry.skillKey === row.skillKey)
          const thresholds = skill ? calculateSuccessThresholds(skill.value) : null

          return (
            <li key={index} className="flex flex-col gap-2 rounded-sm bg-surface-raised p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem_auto]">
                <Input
                  aria-label={t('name')}
                  placeholder={t('name')}
                  value={row.name}
                  onChange={(event) => update(index, { name: event.target.value })}
                  maxLength={160}
                  disabled={readOnly}
                />
                <Select
                  value={row.skillKey}
                  onValueChange={(value) => update(index, { skillKey: String(value) })}
                >
                  <SelectTrigger aria-label={t('skill')} disabled={readOnly}>
                    <SelectValue placeholder={t('skill')}>
                      {(value: string) => (value ? skillName(value) : '')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ownSkills.map((entry) => (
                      <SelectItem key={entry.skillKey} value={entry.skillKey}>
                        {skillName(entry.skillKey)} — {entry.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  aria-label={t('damage')}
                  placeholder={t('damage')}
                  value={row.damage}
                  onChange={(event) => update(index, { damage: event.target.value })}
                  maxLength={80}
                  disabled={readOnly}
                />
                {readOnly ? null : (
                  <IconButton
                    label={t('remove')}
                    variant="ghost"
                    icon={<Trash2 className="size-4" aria-hidden="true" />}
                    onClick={() => {
                      setRows((current) =>
                        current.filter((_unused, position) => position !== index),
                      )
                      setSaved(false)
                    }}
                  />
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-4">
                <Input
                  aria-label={t('range')}
                  placeholder={t('range')}
                  value={row.range}
                  onChange={(event) => update(index, { range: event.target.value })}
                  maxLength={80}
                  disabled={readOnly}
                />
                <Input
                  aria-label={t('attacks')}
                  placeholder={t('attacks')}
                  value={row.attacks}
                  onChange={(event) => update(index, { attacks: event.target.value })}
                  maxLength={80}
                  disabled={readOnly}
                />
                <Input
                  aria-label={t('ammunition')}
                  type="number"
                  min={0}
                  placeholder={t('ammunition')}
                  value={row.ammunition}
                  onChange={(event) => update(index, { ammunition: event.target.value })}
                  disabled={readOnly}
                />
                <Input
                  aria-label={t('malfunction')}
                  type="number"
                  min={0}
                  max={100}
                  placeholder={t('malfunction')}
                  value={row.malfunction}
                  onChange={(event) => update(index, { malfunction: event.target.value })}
                  disabled={readOnly}
                />
              </div>

              {thresholds ? (
                <p className="font-ui text-xs tabular-nums text-text-muted">
                  {t('chance', {
                    regular: thresholds.regular,
                    hard: thresholds.hard,
                    extreme: thresholds.extreme,
                  })}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>

      {readOnly ? null : (
        <div>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              setRows((current) => [...current, emptyRow(ownSkills[0]?.skillKey ?? '')])
            }
          >
            <Plus className="size-4" aria-hidden="true" />
            {t('add')}
          </Button>
        </div>
      )}
    </SheetSection>
  )
}
