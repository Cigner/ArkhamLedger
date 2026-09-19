'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useAutosave } from '@/lib/hooks/use-autosave'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { saveInvestigatorCharacteristics } from '../actions/sheet'
import { CHARACTERISTIC_KEYS, ageGuidance } from '../domain/creation'
import {
  calculateDamageBonusAndBuild,
  calculateHitPoints,
  calculateMagicPoints,
  calculateMaximumSanity,
  calculateMovementRate,
  calculateSuccessThresholds,
} from '../domain/derived-values'
import type { ProjectedSheet } from '../domain/sheet'
import type { Explanation } from '../domain/explanations'
import {
  explainBuild,
  explainHitPoints,
  explainMagicPoints,
  explainMovement,
  explainSanity,
} from '../domain/explanations'
import type { CharacteristicKey, DamageBonus } from '../domain/types'
import { WhyThisValue } from './why-this-value'
import { SheetSection } from './sheet-section'

/**
 * The eight numbers, and everything the rules read out of them.
 *
 * Values are typed in rather than rolled here. Dice are planned as their own
 * feature whose results drop into many places, so this accepts a number and
 * records where it came from - which is also what somebody rolling physical dice
 * at their own table needs.
 *
 * The derived values recalculate as you type, unsaved. Seeing Build change while
 * deciding where to spend an age reduction is the point of putting them on the
 * same page.
 */
const SOURCE_OF = {
  STANDARD_ROLLS: 'ROLLED',
  ASSIGNED_ROLLS: 'ASSIGNED',
  MANUAL_ENTRY: 'MANUAL',
} as const

function damageBonusLabel(bonus: DamageBonus): string {
  if (bonus.kind === 'FIXED') return bonus.value === 0 ? '0' : String(bonus.value)
  return `+${bonus.count}D${bonus.sides}`
}

export function CharacteristicsSection({
  sheet,
  readOnly,
  onVersionChange,
}: {
  sheet: ProjectedSheet
  readOnly: boolean
  onVersionChange: (version: number) => void
}) {
  const t = useTranslations('investigators.sheet.characteristics')
  const errors = useTranslations('investigators.sheet.errors')
  const router = useRouter()

  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(
      CHARACTERISTIC_KEYS.map((key) => [key, sheet.characteristics[key]?.toString() ?? '']),
    ),
    startingLuck: sheet.luck.current?.toString() ?? '',
  }))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const numbers = useMemo(() => {
    const parsed: Partial<Record<CharacteristicKey, number>> = {}
    for (const key of CHARACTERISTIC_KEYS) {
      const value = Number(values[key])
      if (values[key] !== '' && Number.isFinite(value)) parsed[key] = value
    }
    return parsed
  }, [values])

  const derived = useMemo(() => {
    const { STR, CON, SIZ, DEX, POW } = numbers
    const strengthAndSize = STR !== undefined && SIZ !== undefined ? STR + SIZ : null

    return {
      hitPoints:
        CON !== undefined && SIZ !== undefined
          ? calculateHitPoints({ constitution: CON, size: SIZ })
          : null,
      magicPoints: POW !== undefined ? calculateMagicPoints(POW) : null,
      sanity: POW ?? null,
      maximumSanity: calculateMaximumSanity(0),
      movementRate:
        STR !== undefined && DEX !== undefined && SIZ !== undefined && sheet.identity.age !== null
          ? calculateMovementRate({
              strength: STR,
              dexterity: DEX,
              size: SIZ,
              age: sheet.identity.age,
            })
          : null,
      damageBonusAndBuild:
        strengthAndSize !== null ? calculateDamageBonusAndBuild(strengthAndSize) : null,
    }
  }, [numbers, sheet.identity.age])

  const guidance = sheet.identity.age !== null ? ageGuidance(sheet.identity.age) : null

  const save = useAction(saveInvestigatorCharacteristics, {
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

  const submit = () => {
    setError(null)
    save.execute({
      investigatorId: sheet.id,
      expectedVersion: sheet.lockVersion,
      STR: numberOrNull('STR'),
      CON: numberOrNull('CON'),
      SIZ: numberOrNull('SIZ'),
      DEX: numberOrNull('DEX'),
      APP: numberOrNull('APP'),
      INT: numberOrNull('INT'),
      POW: numberOrNull('POW'),
      EDU: numberOrNull('EDU'),
      startingLuck: numberOrNull('startingLuck'),
      source: SOURCE_OF[sheet.creationMethod],
    })
  }

  useAutosave({ value: values, onSave: submit, enabled: !readOnly })

  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [key]: event.target.value }))
    setSaved(false)
  }

  const numberOrNull = (key: string) => (values[key] === '' ? null : Number(values[key]))

  return (
    <SheetSection
      title={t('title')}
      description={t(`methods.${sheet.creationMethod}`)}
      readOnly={readOnly}
      pending={save.isPending}
      saved={saved}
      error={error}
      onSave={submit}
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[...CHARACTERISTIC_KEYS, 'startingLuck'].map((key) => {
          const value = Number(values[key])
          const thresholds =
            values[key] !== '' && Number.isFinite(value) ? calculateSuccessThresholds(value) : null

          return (
            <Field key={key}>
              <FieldLabel htmlFor={`characteristic-${key}`}>
                {key === 'startingLuck' ? t('luck') : t(`keys.${key}`)}
              </FieldLabel>
              <Input
                id={`characteristic-${key}`}
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                value={values[key] ?? ''}
                onChange={set(key)}
                disabled={readOnly}
              />
              <span className="font-ui text-xs tabular-nums text-text-muted">
                {thresholds ? `${thresholds.hard} / ${thresholds.extreme}` : '—'}
              </span>
            </Field>
          )
        })}
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-sm bg-surface-raised p-4 sm:grid-cols-3">
        <Derived
          label={t('derived.hitPoints')}
          value={derived.hitPoints}
          explanation={
            numbers.CON !== undefined && numbers.SIZ !== undefined
              ? explainHitPoints({ constitution: numbers.CON, size: numbers.SIZ })
              : null
          }
        />
        <Derived
          label={t('derived.sanity')}
          value={derived.sanity}
          explanation={numbers.POW !== undefined ? explainSanity(numbers.POW) : null}
        />
        <Derived
          label={t('derived.magicPoints')}
          value={derived.magicPoints}
          explanation={numbers.POW !== undefined ? explainMagicPoints(numbers.POW) : null}
        />
        <Derived
          label={t('derived.movementRate')}
          value={derived.movementRate}
          explanation={
            numbers.STR !== undefined &&
            numbers.DEX !== undefined &&
            numbers.SIZ !== undefined &&
            sheet.identity.age !== null
              ? explainMovement({
                  strength: numbers.STR,
                  dexterity: numbers.DEX,
                  size: numbers.SIZ,
                  age: sheet.identity.age,
                })
              : null
          }
        />
        <Derived
          label={t('derived.damageBonus')}
          text={
            derived.damageBonusAndBuild
              ? damageBonusLabel(derived.damageBonusAndBuild.damageBonus)
              : null
          }
        />
        <Derived
          label={t('derived.build')}
          value={derived.damageBonusAndBuild?.build ?? null}
          explanation={
            numbers.STR !== undefined && numbers.SIZ !== undefined
              ? explainBuild({ strength: numbers.STR, size: numbers.SIZ })
              : null
          }
        />
      </dl>

      {guidance ? (
        <p className="font-ui text-xs text-text-muted">
          {t('ageEffects', {
            physical: guidance.physicalReduction.total,
            eligible: guidance.physicalReduction.eligible.join(', '),
            appearance: guidance.appearanceReduction,
            education: guidance.educationImprovementChecks,
          })}
        </p>
      ) : null}
    </SheetSection>
  )
}

function Derived({
  label,
  value,
  text,
  explanation,
}: {
  label: string
  value?: number | null
  text?: string | null
  explanation?: Explanation | null
}) {
  const shown = text ?? (value === null || value === undefined ? null : String(value))

  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="flex items-center gap-1 font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
        {label}
        <WhyThisValue explanation={explanation ?? null} />
      </dt>
      <dd className="font-ui text-sm tabular-nums text-text-primary">{shown ?? '—'}</dd>
    </div>
  )
}
