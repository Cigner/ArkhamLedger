'use client'

import { Printer } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import type { SheetOptions } from '../data/sheet-options'
import { calculateSuccessThresholds } from '../domain/derived-values'
import { parseSkillKey } from '../domain/occupation-choices'
import type { ProjectedSheet } from '../domain/sheet'

/**
 * The paper layout.
 *
 * Arranged the way the printed sheet arranges it, because the point of printing
 * is to hand somebody something they already know how to read. Redacted fields
 * print as they render - blank - since a sheet that filled them in on paper
 * would be the one place privacy did not hold.
 *
 * Everything interactive is hidden at print time by `print:hidden`, and the
 * colours invert to ink on white: a dark theme printed as-is costs a cartridge
 * and reads worse.
 */
export function PrintableSheet({
  sheet,
  options,
}: {
  sheet: ProjectedSheet
  options: SheetOptions
}) {
  const t = useTranslations('investigators.print')
  const names = useTranslations('investigators')

  const skillName = (definitionId: string, specializationKey: string): string => {
    const option = options.skills.find(
      (entry) => parseSkillKey(entry.skillKey).definitionId === definitionId,
    )
    const base = option ? names(option.nameKey.replace('investigators.', '')) : definitionId
    return specializationKey ? `${base} (${specializationKey})` : base
  }

  const occupation = options.occupations.find((entry) => entry.id === sheet.identity.occupationId)

  return (
    <div className="flex flex-col gap-6 print:gap-3 print:bg-white print:text-black">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <h1 className="font-display text-2xl tracking-[--tracking-display] text-text-primary">
          {sheet.identity.name ?? t('unnamed')}
        </h1>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden="true" />
          {t('print')}
        </Button>
      </div>

      <article className="flex flex-col gap-5 rounded-sm border border-border-subtle p-6 print:gap-4 print:border-0 print:p-0">
        <header className="flex flex-col gap-1 border-b border-border-subtle pb-3 print:border-black">
          <h2 className="font-display text-xl tracking-[--tracking-display] text-text-primary print:text-black">
            {sheet.identity.name ?? t('unnamed')}
          </h2>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 font-ui text-xs text-text-secondary print:text-black">
            <Pair
              label={t('occupation')}
              value={occupation ? names(occupation.nameKey.replace('investigators.', '')) : null}
            />
            <Pair label={t('age')} value={sheet.identity.age} />
            <Pair label={t('sex')} value={sheet.identity.sex} />
            <Pair label={t('residence')} value={sheet.identity.residence} />
            <Pair label={t('birthplace')} value={sheet.identity.birthplace} />
            <Pair label={t('species')} value={sheet.identity.species} />
            <Pair label={t('contact')} value={sheet.identity.occupationContact} />
          </dl>
        </header>

        <section className="grid grid-cols-3 gap-x-6 gap-y-1 sm:grid-cols-5">
          {(['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU'] as const).map((key) => {
            const value = sheet.characteristics[key]
            const thresholds = value === null ? null : calculateSuccessThresholds(value)

            return (
              <div key={key} className="flex items-baseline justify-between gap-2">
                <span className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted print:text-black">
                  {key}
                </span>
                <span className="font-ui text-sm tabular-nums text-text-primary print:text-black">
                  {value ?? '—'}
                  {thresholds ? (
                    <span className="ml-1 text-xs text-text-muted print:text-black">
                      {thresholds.hard}/{thresholds.extreme}
                    </span>
                  ) : null}
                </span>
              </div>
            )
          })}
        </section>

        <section className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          <Resource label={t('hitPoints')} value={sheet.hitPoints} />
          <Resource label={t('sanity')} value={sheet.sanity} />
          <Resource label={t('magicPoints')} value={sheet.magicPoints} />
          <Resource label={t('luck')} value={sheet.luck} />
          <Pair label={t('movement')} value={sheet.movementRate} />
          <Pair label={t('build')} value={sheet.build} />
          <Pair label={t('creditRating')} value={sheet.finances.creditRating} />
          <Pair label={t('cash')} value={sheet.finances.cash} />
        </section>

        {sheet.skills.length > 0 ? (
          <section>
            <h3 className="mb-1 font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted print:text-black">
              {t('skills')}
            </h3>
            <ul className="columns-2 gap-x-8 sm:columns-3">
              {[...sheet.skills]
                .sort((left, right) =>
                  skillName(left.definitionId, left.specializationKey).localeCompare(
                    skillName(right.definitionId, right.specializationKey),
                  ),
                )
                .map((skill) => {
                  const thresholds = calculateSuccessThresholds(skill.currentValue)

                  return (
                    <li
                      key={`${skill.definitionId}:${skill.specializationKey}`}
                      className="flex break-inside-avoid items-baseline justify-between gap-2 font-ui text-xs text-text-primary print:text-black"
                    >
                      <span>
                        {skill.hasDevelopmentMark ? '☑ ' : '☐ '}
                        {skillName(skill.definitionId, skill.specializationKey)}
                      </span>
                      <span className="tabular-nums">
                        {skill.currentValue}
                        <span className="ml-1 text-text-muted print:text-black">
                          {thresholds.hard}/{thresholds.extreme}
                        </span>
                      </span>
                    </li>
                  )
                })}
            </ul>
          </section>
        ) : null}

        {sheet.weapons.length > 0 ? (
          <section>
            <h3 className="mb-1 font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted print:text-black">
              {t('weapons')}
            </h3>
            <ul className="flex flex-col gap-0.5">
              {sheet.weapons.map((weapon) => (
                <li
                  key={weapon.name}
                  className="flex flex-wrap gap-x-4 font-ui text-xs text-text-primary print:text-black"
                >
                  <span>{weapon.name}</span>
                  <span>{weapon.damage}</span>
                  {weapon.range ? <span>{weapon.range}</span> : null}
                  {weapon.ammunition !== null ? <span>{weapon.ammunition}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {sheet.backstory.length > 0 ? (
          <section className="break-inside-avoid">
            <h3 className="mb-1 font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted print:text-black">
              {t('backstory')}
            </h3>
            <dl className="flex flex-col gap-1">
              {sheet.backstory.map((entry) => (
                <div key={entry.category}>
                  <dt className="font-ui text-2xs uppercase tracking-[--tracking-smallcaps] text-text-muted print:text-black">
                    {names(`backstoryCategories.${entry.category}`)}
                  </dt>
                  <dd className="whitespace-pre-line font-body text-xs text-text-primary print:text-black">
                    {entry.content}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {sheet.possessions.length > 0 ? (
          <section className="break-inside-avoid">
            <h3 className="mb-1 font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted print:text-black">
              {t('possessions')}
            </h3>
            <p className="font-ui text-xs text-text-primary print:text-black">
              {sheet.possessions
                .map((item) => (item.quantity > 1 ? `${item.quantity} × ${item.name}` : item.name))
                .join(', ')}
            </p>
          </section>
        ) : null}

        {sheet.redacted.length > 0 ? (
          <p className="font-ui text-2xs text-text-muted print:text-black">
            {t('redactedNote', { count: sheet.redacted.length })}
          </p>
        ) : null}
      </article>
    </div>
  )
}

function Pair({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-text-muted print:text-black">{label}</dt>
      <dd className="text-text-primary print:text-black">{value ?? '—'}</dd>
    </div>
  )
}

function Resource({
  label,
  value,
}: {
  label: string
  value: { current: number | null; maximum: number | null }
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted print:text-black">
        {label}
      </span>
      <span className="font-ui text-sm tabular-nums text-text-primary print:text-black">
        {value.current ?? '—'}
        {value.maximum !== null ? (
          <span className="text-text-muted print:text-black"> / {value.maximum}</span>
        ) : null}
      </span>
    </div>
  )
}
