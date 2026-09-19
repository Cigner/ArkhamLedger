'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { saveFieldVisibility } from '../actions/privacy'
import type { ProjectedSheet } from '../domain/sheet'
import {
  type InvestigatorFieldKey,
  INVESTIGATOR_FIELD_KEYS,
  resolveVisibility,
} from '../domain/visibility'
import { SheetSection } from './sheet-section'

/**
 * What the rest of the party may read.
 *
 * Everything is public until somebody says otherwise, and the switches are for
 * the exceptions. The Keeper is never in scope here: they see the whole sheet,
 * because running a game means knowing what is on it.
 *
 * Hiding a characteristic hides what the rules calculate from it, and that
 * cascade is shown rather than explained. Somebody who hides SIZ and then finds
 * Build greyed out has learnt the rule; somebody who reads a paragraph about it
 * has not.
 */
const GROUPS: readonly { readonly id: string; readonly keys: readonly InvestigatorFieldKey[] }[] = [
  {
    id: 'identity',
    keys: INVESTIGATOR_FIELD_KEYS.filter((key) => key.startsWith('identity.')),
  },
  {
    id: 'characteristics',
    keys: INVESTIGATOR_FIELD_KEYS.filter((key) => key.startsWith('characteristics.')),
  },
  {
    id: 'derived',
    keys: INVESTIGATOR_FIELD_KEYS.filter(
      (key) => key.startsWith('derived.') || key === 'state.conditions',
    ),
  },
  {
    id: 'sheet',
    keys: INVESTIGATOR_FIELD_KEYS.filter(
      (key) =>
        key === 'skills' ||
        key === 'possessions' ||
        key === 'weapons' ||
        key.startsWith('finances.'),
    ),
  },
  {
    id: 'backstory',
    keys: INVESTIGATOR_FIELD_KEYS.filter((key) => key.startsWith('backstory.')),
  },
]

export function PrivacySection({
  sheet,
  hiddenFields,
  canConfigure,
}: {
  sheet: ProjectedSheet
  hiddenFields: readonly string[]
  canConfigure: boolean
}) {
  const t = useTranslations('investigators.sheet.privacy')
  const labels = useTranslations('investigators.fields')
  const categories = useTranslations('investigators.backstoryCategories')
  const errors = useTranslations('investigators.sheet.errors')
  const router = useRouter()

  const [hidden, setHidden] = useState<Set<string>>(() => new Set(hiddenFields))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  /*
   * The same resolution the server will apply, so the cascade is visible while
   * the switches are being flipped rather than after they are saved.
   */
  const resolved = useMemo(
    () => resolveVisibility([...hidden].map((key) => [key, 'HIDDEN'] as const)),
    [hidden],
  )

  const save = useAction(saveFieldVisibility, {
    onSuccess: () => {
      setSaved(true)
      router.refresh()
    },
    onError: ({ error: actionError }) => {
      setSaved(false)
      setError(
        resolveActionError(
          {},
          errors('saveFailed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  const label = (key: InvestigatorFieldKey): string =>
    key.startsWith('backstory.')
      ? categories(key.slice('backstory.'.length))
      : labels(key.replace(/\./g, '_'))

  const toggle = (key: string, hide: boolean) => {
    setHidden((current) => {
      const next = new Set(current)
      if (hide) next.add(key)
      else next.delete(key)
      return next
    })
    setSaved(false)
  }

  const setAll = (hide: boolean) => {
    setHidden(hide ? new Set(INVESTIGATOR_FIELD_KEYS) : new Set())
    setSaved(false)
  }

  /*
   * A preset per group, because the request people actually have is "hide my
   * backstory and nothing else". All-or-nothing makes them click twelve boxes
   * to express one intention.
   */
  const setGroup = (keys: readonly InvestigatorFieldKey[], hide: boolean) => {
    setHidden((current) => {
      const next = new Set(current)
      for (const key of keys) {
        if (hide) next.add(key)
        else next.delete(key)
      }
      return next
    })
    setSaved(false)
  }

  return (
    <SheetSection
      title={t('title')}
      description={t('description')}
      readOnly={!canConfigure}
      pending={save.isPending}
      saved={saved}
      error={error}
      onSave={() => {
        setError(null)
        save.execute({ investigatorId: sheet.id, hidden: [...hidden] })
      }}
    >
      {canConfigure ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={() => setAll(false)}>
            <Eye className="size-4" aria-hidden="true" />
            {t('presets.open')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAll(true)}>
            <EyeOff className="size-4" aria-hidden="true" />
            {t('presets.closed')}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        {GROUPS.map((group) => (
          <div key={group.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-3">
              <h3 className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
                {t(`groups.${group.id}`)}
              </h3>
              {canConfigure ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="cursor-pointer font-ui text-2xs uppercase tracking-[--tracking-smallcaps] text-text-muted transition-interactive hover:text-text-primary"
                    onClick={() => setGroup(group.keys, false)}
                  >
                    {t('presets.showGroup')}
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer font-ui text-2xs uppercase tracking-[--tracking-smallcaps] text-text-muted transition-interactive hover:text-text-primary"
                    onClick={() => setGroup(group.keys, true)}
                  >
                    {t('presets.hideGroup')}
                  </button>
                </div>
              ) : null}
            </div>
            <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {group.keys.map((key) => {
                const explicit = hidden.has(key)
                const effective = resolved.get(key) === 'HIDDEN'

                return (
                  <li key={key}>
                    <label className="flex items-center gap-2 font-ui text-sm text-text-secondary">
                      <Checkbox
                        checked={explicit}
                        onCheckedChange={(checked) => toggle(key, Boolean(checked))}
                        disabled={!canConfigure}
                      />
                      <span className={effective && !explicit ? 'text-text-muted' : undefined}>
                        {label(key)}
                      </span>
                      {effective && !explicit ? (
                        <span className="font-ui text-2xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
                          {t('followsSource')}
                        </span>
                      ) : null}
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <p className="font-ui text-xs text-text-muted">{t('keeperNote')}</p>
    </SheetSection>
  )
}
