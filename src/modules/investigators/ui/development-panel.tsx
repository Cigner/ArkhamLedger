'use client'

import { Dices } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormError } from '@/modules/identity/ui/form-error'
import { resolveSkillDevelopment } from '../actions/play'
import type { SheetOptions } from '../data/sheet-options'
import { developmentSucceeds } from '../domain/development'
import { parseSkillKey, skillKeyOf } from '../domain/occupation-choices'
import type { ProjectedSheet } from '../domain/sheet'

/**
 * The development phase, at the end of a chapter.
 *
 * One ticked skill at a time, because that is how it is done at the table: a
 * roll, a result, the next skill. The second die only appears once the first one
 * earned it, which also stops somebody entering a number they never threw.
 *
 * What the roll has to beat is shown next to it. A player at 80 who rolls 74 and
 * learns nothing should be able to see why without reaching for the book.
 */
export function DevelopmentPanel({
  sheet,
  options,
  readOnly,
}: {
  sheet: ProjectedSheet
  options: SheetOptions
  readOnly: boolean
}) {
  const t = useTranslations('investigators.development')
  const names = useTranslations('investigators')
  const router = useRouter()

  const [rolls, setRolls] = useState<Record<string, { percentile: string; improvement: string }>>(
    {},
  )
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)

  const marked = sheet.skills.filter((skill) => skill.hasDevelopmentMark)

  const resolve = useAction(resolveSkillDevelopment, {
    onSuccess: ({ data }) => {
      setError(null)
      setOutcome(
        data?.improved
          ? t('improved', { increase: data.increase, current: data.current })
          : t('noChange'),
      )
      router.refresh()
    },
    onError: () => setError(t('failed')),
  })

  if (readOnly || marked.length === 0) return null

  const skillName = (definitionId: string, specializationKey: string): string => {
    const option = options.skills.find(
      (entry) => parseSkillKey(entry.skillKey).definitionId === definitionId,
    )
    const base = option ? names(option.nameKey.replace('investigators.', '')) : definitionId
    return specializationKey ? `${base} (${specializationKey})` : base
  }

  return (
    <section className="mb-4 flex flex-col gap-3 rounded-sm border border-border-subtle bg-surface-raised p-4">
      <h3 className="flex items-center gap-2 font-ui text-sm text-text-primary">
        <Dices className="size-4 text-text-muted" aria-hidden="true" />
        {t('title', { count: marked.length })}
      </h3>
      <p className="font-ui text-xs text-text-muted">{t('description')}</p>

      <ul className="flex flex-col gap-2">
        {marked.map((skill) => {
          const skillKey = skillKeyOf(skill.definitionId, skill.specializationKey || null)
          const entry = rolls[skillKey] ?? { percentile: '', improvement: '' }
          const percentile = Number(entry.percentile)
          const succeeded =
            entry.percentile === '' || !Number.isFinite(percentile)
              ? null
              : developmentSucceeds({
                  percentileRoll: percentile,
                  currentValue: skill.currentValue,
                })

          const earned = succeeded?.ok === true && succeeded.value !== null

          return (
            <li key={skillKey} className="flex flex-wrap items-center gap-2">
              <span className="min-w-40 font-ui text-sm text-text-primary">
                {skillName(skill.definitionId, skill.specializationKey)}
              </span>
              <span className="font-ui text-xs tabular-nums text-text-muted">
                {t('beat', { value: skill.currentValue })}
              </span>

              <Input
                aria-label={t('percentile')}
                type="number"
                min={1}
                max={100}
                className="w-20 text-center"
                value={entry.percentile}
                onChange={(event) =>
                  setRolls((current) => ({
                    ...current,
                    [skillKey]: { ...entry, percentile: event.target.value },
                  }))
                }
              />

              {earned ? (
                <Input
                  aria-label={t('improvement')}
                  type="number"
                  min={1}
                  max={10}
                  className="w-20 text-center"
                  placeholder="1D10"
                  value={entry.improvement}
                  onChange={(event) =>
                    setRolls((current) => ({
                      ...current,
                      [skillKey]: { ...entry, improvement: event.target.value },
                    }))
                  }
                />
              ) : null}

              <Button
                type="button"
                variant="outline"
                disabled={
                  resolve.isPending ||
                  entry.percentile === '' ||
                  (earned && entry.improvement === '')
                }
                onClick={() => {
                  setError(null)
                  resolve.execute({
                    investigatorId: sheet.id,
                    skillKey,
                    percentileRoll: percentile,
                    improvementRoll: earned ? Number(entry.improvement) : null,
                  })
                }}
              >
                {t('resolve')}
              </Button>
            </li>
          )
        })}
      </ul>

      {outcome ? (
        <p role="status" className="font-ui text-sm text-text-secondary">
          {outcome}
        </p>
      ) : null}

      <FormError>{error}</FormError>
    </section>
  )
}
