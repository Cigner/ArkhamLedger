'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useFormatter, useTranslations } from 'next-intl'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { markSkill, setInvestigatorConditions } from '../actions/play'
import type { InvestigatorHistory } from '../data/history'
import type { Provenance } from '../data/investigator-view'
import type { NoteRecord } from '../data/notes'
import type { ResourceEvent } from '../data/resources'
import type { SheetOptions } from '../data/sheet-options'
import { calculateSuccessThresholds } from '../domain/derived-values'
import { parseSkillKey } from '../domain/occupation-choices'
import type { ProjectedSheet } from '../domain/sheet'
import { ArrowDownWideNarrow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox as MarkBox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { DevelopmentPanel } from './development-panel'
import { HistoryPanel } from './history-panel'
import { LifecycleActions } from './lifecycle-actions'
import { NotesSection } from './notes-section'
import { OverridesPanel } from './overrides-panel'
import { PlannedTools } from './planned-tools'
import { ProvenancePanel } from './provenance-panel'
import { SheetToolbar } from './sheet-toolbar'
import { ResourcePanel } from './resource-panel'

/**
 * A character that is being played rather than written.
 *
 * Sections, not one long page: the creator is filled in top to bottom once, and
 * this is navigated repeatedly for one answer at a time. What somebody needs
 * mid-session is a skill's number, a weapon's chance, or how much Sanity is
 * left - and the resources sit above the tabs because they are the only part
 * that changes while the game runs.
 */
export function ActiveSheet({
  sheet,
  options,
  events,
  notes,
  viewer,
  archived,
  provenance,
  history,
  requestable,
  readOnly,
  onVersionChange,
}: {
  sheet: ProjectedSheet
  options: SheetOptions
  events: readonly ResourceEvent[]
  notes: readonly NoteRecord[]
  viewer: { userId: string; role: string }
  archived: boolean
  provenance: Provenance
  history: InvestigatorHistory
  requestable: readonly { campaignId: string; name: string }[]
  readOnly: boolean
  /** The played sheet edits little, but what it does edit claims the version. */
  onVersionChange: (version: number) => void
}) {
  const t = useTranslations('investigators.play')
  const names = useTranslations('investigators')
  const categories = useTranslations('investigators.backstoryCategories')
  const format = useFormatter()
  const router = useRouter()

  const [conditions, setConditions] = useState(sheet.conditions)

  const save = useAction(setInvestigatorConditions, {
    onSuccess: () => router.refresh(),
  })

  const mark = useAction(markSkill, {
    onSuccess: () => router.refresh(),
  })

  const skillName = (definitionId: string, specializationKey: string): string => {
    const option = options.skills.find(
      (entry) => parseSkillKey(entry.skillKey).definitionId === definitionId,
    )
    const base = option ? names(option.nameKey.replace('investigators.', '')) : definitionId
    return specializationKey ? `${base} (${specializationKey})` : base
  }

  const toggle = (key: keyof typeof conditions, value: boolean) => {
    const next = { ...conditions, [key]: value }
    setConditions(next)
    save.execute({ investigatorId: sheet.id, ...next })
  }

  /*
   * Search and an ordering choice, because forty-four skills in one alphabetical
   * column is the arrangement paper uses for want of an alternative. Mid-session
   * the question is usually "what is my Spot Hidden", while by value is how a
   * table decides who should try the door.
   */
  const [skillQuery, setSkillQuery] = useState('')
  const [skillOrder, setSkillOrder] = useState<'VALUE' | 'NAME'>('VALUE')

  const visibleSkills = sheet.skills
    .filter((skill) => {
      const query = skillQuery.trim().toLowerCase()
      if (query.length === 0) return true
      return skillName(skill.definitionId, skill.specializationKey).toLowerCase().includes(query)
    })
    .sort((left, right) =>
      skillOrder === 'VALUE'
        ? right.currentValue - left.currentValue
        : skillName(left.definitionId, left.specializationKey).localeCompare(
            skillName(right.definitionId, right.specializationKey),
          ),
    )

  return (
    <div className="flex flex-col gap-6">
      <SheetToolbar sheet={sheet} canDuplicate={!readOnly} requestable={requestable} />
      <ResourcePanel sheet={sheet} readOnly={readOnly} />

      <section className="flex flex-wrap gap-4 rounded-sm border border-border-subtle p-3">
        {(
          ['majorWound', 'unconscious', 'dying', 'temporaryInsanity', 'indefiniteInsanity'] as const
        ).map((key) => (
          <label key={key} className="flex items-center gap-2 font-ui text-sm text-text-secondary">
            <Checkbox
              checked={conditions[key]}
              onCheckedChange={(checked) => toggle(key, Boolean(checked))}
              disabled={readOnly}
            />
            {t(`conditions.${key}`)}
          </label>
        ))}
      </section>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
          <TabsTrigger value="skills">{t('tabs.skills')}</TabsTrigger>
          <TabsTrigger value="combat">{t('tabs.combat')}</TabsTrigger>
          <TabsTrigger value="backstory">{t('tabs.backstory')}</TabsTrigger>
          <TabsTrigger value="possessions">{t('tabs.possessions')}</TabsTrigger>
          <TabsTrigger value="notes">{t('tabs.notes')}</TabsTrigger>
          <TabsTrigger value="history">{t('tabs.history')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            {(['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU'] as const).map((key) => {
              const value = sheet.characteristics[key]
              const thresholds = value === null ? null : calculateSuccessThresholds(value)

              return (
                <div key={key} className="flex items-baseline justify-between gap-2">
                  <dt className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
                    {key}
                  </dt>
                  <dd className="font-ui text-sm tabular-nums text-text-primary">
                    {value ?? '—'}
                    {thresholds ? (
                      <span className="ml-2 text-xs text-text-muted">
                        {thresholds.hard}/{thresholds.extreme}
                      </span>
                    ) : null}
                  </dd>
                </div>
              )
            })}
            <Figure label={t('movement')} value={sheet.movementRate} />
            <Figure label={t('build')} value={sheet.build} />
          </dl>
        </TabsContent>

        <TabsContent value="skills" className="pt-4">
          <DevelopmentPanel sheet={sheet} options={options} readOnly={readOnly} />

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input
              aria-label={t('searchSkills')}
              placeholder={t('searchSkills')}
              value={skillQuery}
              onChange={(event) => setSkillQuery(event.target.value)}
              className="max-w-56"
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSkillOrder(skillOrder === 'VALUE' ? 'NAME' : 'VALUE')}
            >
              <ArrowDownWideNarrow className="size-4" aria-hidden="true" />
              {skillOrder === 'VALUE' ? t('byValue') : t('byName')}
            </Button>
          </div>

          <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleSkills.map((skill) => {
              const thresholds = calculateSuccessThresholds(skill.currentValue)

              return (
                <li
                  key={`${skill.definitionId}:${skill.specializationKey}`}
                  className="flex items-baseline justify-between gap-2 border-b border-border-subtle/60 py-1"
                >
                  <span className="flex items-center gap-2 font-ui text-sm text-text-primary">
                    {readOnly ? (
                      skill.hasDevelopmentMark ? (
                        <span className="text-status-positive" aria-label={t('marked')}>
                          ✓
                        </span>
                      ) : null
                    ) : (
                      <MarkBox
                        aria-label={t('markFor', {
                          skill: skillName(skill.definitionId, skill.specializationKey),
                        })}
                        checked={skill.hasDevelopmentMark}
                        onCheckedChange={(checked) =>
                          mark.execute({
                            investigatorId: sheet.id,
                            skillKey: `${skill.definitionId}${
                              skill.specializationKey ? `:${skill.specializationKey}` : ''
                            }`,
                            marked: Boolean(checked),
                          })
                        }
                      />
                    )}
                    {skillName(skill.definitionId, skill.specializationKey)}
                  </span>
                  <span className="font-ui text-sm tabular-nums text-text-primary">
                    {skill.currentValue}
                    <span className="ml-2 text-xs text-text-muted">
                      {thresholds.hard}/{thresholds.extreme}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </TabsContent>

        <TabsContent value="combat" className="pt-4">
          {sheet.weapons.length === 0 ? (
            <p className="font-ui text-sm text-text-muted">{t('noWeapons')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sheet.weapons.map((weapon) => {
                const skill = sheet.skills.find(
                  (entry) =>
                    `${entry.definitionId}${entry.specializationKey ? `:${entry.specializationKey}` : ''}` ===
                    weapon.skillKey,
                )

                return (
                  <li
                    key={weapon.name}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-sm bg-surface-raised p-3"
                  >
                    <span className="font-ui text-sm text-text-primary">{weapon.name}</span>
                    <span className="font-ui text-sm tabular-nums text-text-secondary">
                      {skill ? skill.currentValue : '—'}
                    </span>
                    <span className="font-ui text-sm text-text-secondary">{weapon.damage}</span>
                    {weapon.range ? (
                      <span className="font-ui text-xs text-text-muted">{weapon.range}</span>
                    ) : null}
                    {weapon.ammunition !== null ? (
                      <span className="font-ui text-xs text-text-muted">
                        {t('ammo', { count: weapon.ammunition })}
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="backstory" className="pt-4">
          {sheet.backstory.length === 0 ? (
            <p className="font-ui text-sm text-text-muted">{t('noBackstory')}</p>
          ) : (
            <dl className="flex flex-col gap-3">
              {sheet.backstory.map((entry) => (
                <div key={entry.category}>
                  <dt className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
                    {categories(entry.category)}
                    {entry.isKeyConnection ? (
                      <span className="ml-2 text-candle-9">{t('keyConnection')}</span>
                    ) : null}
                  </dt>
                  <dd className="whitespace-pre-line font-ui text-sm text-text-primary">
                    {entry.content}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </TabsContent>

        <TabsContent value="possessions" className="pt-4">
          <div className="flex flex-col gap-4">
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
              <Figure label={t('cash')} value={sheet.finances.cash} />
              <Figure label={t('assets')} value={sheet.finances.assets} />
              <Figure label={t('spendingLevel')} value={sheet.finances.spendingLevel} />
            </dl>

            {sheet.possessions.length === 0 ? (
              <p className="font-ui text-sm text-text-muted">{t('noPossessions')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {sheet.possessions.map((item) => (
                  <li key={item.name} className="font-ui text-sm text-text-primary">
                    {item.quantity > 1 ? `${item.quantity} × ` : ''}
                    {item.name}
                    {item.isTreasured ? (
                      <span className="ml-2 text-candle-9">{t('treasured')}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="notes" className="pt-4">
          <NotesSection
            investigatorId={sheet.id}
            campaignId={null}
            notes={notes}
            viewerId={viewer.userId}
            canWriteKeeperNote={viewer.role === 'KEEPER' || viewer.role === 'CREATOR_KEEPER'}
            canWriteOwnerNote={viewer.role === 'OWNER'}
          />
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <div className="mb-4 flex flex-col gap-4">
            <OverridesPanel sheet={sheet} readOnly={readOnly} onVersionChange={onVersionChange} />
            <ProvenancePanel provenance={provenance} />
            <HistoryPanel history={history} options={options} />
            <PlannedTools />
            <LifecycleActions sheet={sheet} archived={archived} canEdit={!readOnly} />
          </div>
          {events.length === 0 ? (
            <p className="font-ui text-sm text-text-muted">{t('noHistory')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {events.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap items-baseline gap-x-3 border-b border-border-subtle/60 py-1 font-ui text-sm"
                >
                  <span className="tabular-nums text-text-muted">
                    {format.dateTime(event.createdAt, {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="text-text-primary">
                    {t(`resources.${event.resource}`)} {event.previousValue} → {event.currentValue}
                  </span>
                  {event.reversesEventId ? (
                    <span className="text-xs text-text-muted">{t('reversal')}</span>
                  ) : null}
                  {event.reason ? (
                    <span className="text-xs text-text-secondary">{event.reason}</span>
                  ) : null}
                  {event.actorName ? (
                    <span className="ml-auto text-xs text-text-muted">{event.actorName}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
        {label}
      </dt>
      <dd className="font-ui text-sm tabular-nums text-text-primary">{value ?? '—'}</dd>
    </div>
  )
}
