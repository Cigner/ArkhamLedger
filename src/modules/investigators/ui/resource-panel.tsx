'use client'

import { Heart, Sparkles, Undo2, Zap } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormError } from '@/modules/identity/ui/form-error'
import { adjustInvestigatorResource, reverseResourceChange } from '../actions/play'
import type { ResourceKind } from '../domain/resources'
import type { ProjectedSheet } from '../domain/sheet'

/**
 * The four numbers that move during a session.
 *
 * Pinned at the top of a played character, because this is the only part of a
 * sheet anybody touches while the game is running. Everything else is reference.
 *
 * Changes are amounts, not totals. "Took 8" is what somebody says at the table,
 * and it is also what the rules need to hear: eight at once is a major wound,
 * eight in four blows is a bruise, and a field that asked for the new total
 * could not tell the difference.
 */
const ICONS = {
  HP: Heart,
  SAN: Sparkles,
  MP: Zap,
  LUCK: Sparkles,
} as const

export function ResourcePanel({ sheet, readOnly }: { sheet: ProjectedSheet; readOnly: boolean }) {
  const t = useTranslations('investigators.play')
  const router = useRouter()
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const adjust = useAction(adjustInvestigatorResource, {
    onSuccess: ({ data }) => {
      const messages: string[] = []
      if (data?.killedOutright) messages.push(t('outcomes.killed'))
      else if (data?.majorWound) messages.push(t('outcomes.majorWound'))
      if (data?.constitutionRollRequired) messages.push(t('outcomes.constitutionRoll'))
      if (data?.intelligenceRollRequired) messages.push(t('outcomes.intelligenceRoll'))
      if (data?.indefiniteInsanity) messages.push(t('outcomes.indefiniteInsanity'))

      setNotice(messages.length > 0 ? messages.join(' ') : null)
      setAmounts({})
      router.refresh()
    },
    onError: () => setError(t('failed')),
  })

  /*
   * An undo puts the number back and nothing else. A major wound the blow
   * caused is a box somebody ticked, and the journal records values rather than
   * boxes - so it says so instead of leaving a Keeper to notice the tick is
   * still there.
   */
  const marked = Object.values(sheet.conditions).some(Boolean)

  const undo = useAction(reverseResourceChange, {
    onSuccess: () => {
      setNotice(marked ? t('outcomes.conditionsKept') : null)
      router.refresh()
    },
    onError: () => setError(t('nothingToUndo')),
  })

  const resources: readonly {
    kind: ResourceKind
    current: number | null
    maximum: number | null
  }[] = [
    { kind: 'HP', current: sheet.hitPoints.current, maximum: sheet.hitPoints.maximum },
    { kind: 'SAN', current: sheet.sanity.current, maximum: sheet.sanity.maximum },
    { kind: 'MP', current: sheet.magicPoints.current, maximum: sheet.magicPoints.maximum },
    { kind: 'LUCK', current: sheet.luck.current, maximum: sheet.luck.maximum },
  ]

  const apply = (kind: ResourceKind, sign: 1 | -1) => {
    const typed = Number(amounts[kind] ?? '')
    if (!Number.isFinite(typed) || typed === 0) return
    setError(null)
    adjust.execute({
      investigatorId: sheet.id,
      resource: kind,
      amount: sign * Math.abs(Math.trunc(typed)),
      reason: null,
    })
  }

  return (
    /*
     * Pinned rather than merely first. This is the only part of a sheet anybody
     * touches mid-session, and on a phone the alternative is scrolling back up
     * past forty skills every time somebody takes damage.
     */
    <section className="sticky top-0 z-10 flex flex-col gap-3 rounded-sm border border-border-subtle bg-surface-raised p-4 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {resources.map((resource) => {
          const Icon = ICONS[resource.kind]

          return (
            <div key={resource.kind} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <Icon className="size-4 text-text-muted" aria-hidden="true" />
                <span className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
                  {t(`resources.${resource.kind}`)}
                </span>
                <span className="ml-auto font-ui text-lg tabular-nums text-text-primary">
                  {resource.current ?? '—'}
                  {resource.maximum !== null ? (
                    <span className="text-sm text-text-muted"> / {resource.maximum}</span>
                  ) : null}
                </span>
              </div>

              {readOnly ? null : (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={t('lose', { resource: t(`resources.${resource.kind}`) })}
                    disabled={adjust.isPending}
                    onClick={() => apply(resource.kind, -1)}
                  >
                    −
                  </Button>
                  <Input
                    aria-label={t('amount')}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="w-16 text-center"
                    value={amounts[resource.kind] ?? ''}
                    onChange={(event) =>
                      setAmounts((current) => ({
                        ...current,
                        [resource.kind]: event.target.value,
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={t('gain', { resource: t(`resources.${resource.kind}`) })}
                    disabled={adjust.isPending}
                    onClick={() => apply(resource.kind, 1)}
                  >
                    +
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {notice ? (
        <p role="status" className="font-ui text-sm text-status-warning">
          {notice}
        </p>
      ) : null}

      <FormError>{error}</FormError>

      {readOnly ? null : (
        <div>
          <Button
            type="button"
            variant="ghost"
            disabled={undo.isPending}
            onClick={() => {
              setError(null)
              undo.execute({ investigatorId: sheet.id })
            }}
          >
            <Undo2 className="size-4" aria-hidden="true" />
            {t('undo')}
          </Button>
        </div>
      )}
    </section>
  )
}
