'use client'

import { CircleAlert, CircleCheck, Copy } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import { assignSessionInvestigator, useSameInvestigators } from '../actions/assignments'
import type { AssignmentRow } from '../data/assignments'

/**
 * Who is playing which character on the night.
 *
 * The list shows everybody who is bringing one, including those who have not
 * chosen yet, because the Keeper's question before a session is "who is still
 * missing" - and a list of the decided ones cannot answer it.
 *
 * "Use the same characters" is the button this screen exists for. The same
 * people playing the same characters next week is the overwhelmingly common
 * case, and it reports what it could not copy rather than copying quietly.
 */
export function SessionAssignments({
  sessionId,
  rows,
  choices,
  canEdit,
}: {
  sessionId: string
  rows: readonly AssignmentRow[]
  /** The characters each player has available in this campaign. */
  choices: Readonly<Record<string, readonly { investigatorId: string; name: string | null }[]>>
  canEdit: boolean
}) {
  const t = useTranslations('investigators.assignments')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const messages = {
    'investigators.errors.stillADraft': t('errors.stillADraft'),
    'investigators.errors.notInCampaign': t('errors.notInCampaign'),
    'investigators.errors.retired': t('errors.retired'),
    'investigators.errors.deceased': t('errors.deceased'),
    'investigators.errors.notTheirCharacter': t('errors.notTheirs'),
    'investigators.errors.noPreviousSession': t('errors.noPrevious'),
    'sessions.errors.assignmentsLocked': t('errors.locked'),
  }

  const assign = useAction(assignSessionInvestigator, {
    onSuccess: () => {
      setError(null)
      router.refresh()
    },
    onError: ({ error: actionError }) => {
      setError(
        resolveActionError(
          messages,
          t('errors.failed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  const copy = useAction(useSameInvestigators, {
    onSuccess: ({ data }) => {
      setError(null)
      setNotice(
        data
          ? t('copied', {
              from: data.from,
              copied: data.copied.length,
              skipped: data.skipped.length,
            })
          : null,
      )
      router.refresh()
    },
    onError: ({ error: actionError }) => {
      setNotice(null)
      setError(
        resolveActionError(
          messages,
          t('errors.failed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  const missing = rows.filter((row) => row.investigatorId === null).length

  if (rows.length === 0) {
    return <p className="font-ui text-sm text-text-muted">{t('nobodyPlaying')}</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className={`flex items-center gap-2 font-ui text-sm ${
            missing === 0 ? 'text-status-positive' : 'text-text-secondary'
          }`}
        >
          {missing === 0 ? (
            <CircleCheck className="size-4" aria-hidden="true" />
          ) : (
            <CircleAlert className="size-4 text-status-warning" aria-hidden="true" />
          )}
          {missing === 0 ? t('everybodyReady') : t('stillMissing', { count: missing })}
        </p>

        {canEdit ? (
          <Button
            type="button"
            variant="outline"
            disabled={copy.isPending}
            onClick={() => copy.execute({ sessionId })}
          >
            <Copy className="size-4" aria-hidden="true" />
            {copy.isPending ? t('copying') : t('useSame')}
          </Button>
        ) : null}
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const available = choices[row.userId] ?? []

          return (
            <li
              key={row.participantId}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle/60 pb-2"
            >
              <span className="font-ui text-sm text-text-primary">
                {row.name}
                {row.isKeeper ? (
                  <span className="ml-2 font-ui text-2xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
                    {t('alsoKeeper')}
                  </span>
                ) : null}
              </span>

              {canEdit ? (
                <Select
                  value={row.investigatorId ?? ''}
                  onValueChange={(value) => {
                    setNotice(null)
                    assign.execute({
                      sessionId,
                      participantId: row.participantId,
                      investigatorId: String(value) === '' ? null : String(value),
                    })
                  }}
                >
                  <SelectTrigger aria-label={t('character')} className="w-56">
                    <SelectValue placeholder={t('notChosen')}>
                      {(value: string) =>
                        available.find((entry) => entry.investigatorId === value)?.name ??
                        (value ? t('unnamed') : '')
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((entry) => (
                      <SelectItem key={entry.investigatorId} value={entry.investigatorId}>
                        {entry.name ?? t('unnamed')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="font-ui text-sm text-text-secondary">
                  {row.investigatorName ?? t('notChosen')}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      {notice ? (
        <p role="status" className="font-ui text-sm text-text-secondary">
          {notice}
        </p>
      ) : null}

      <FormError>{error}</FormError>
    </div>
  )
}
