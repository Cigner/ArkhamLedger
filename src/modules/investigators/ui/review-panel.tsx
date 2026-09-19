'use client'

import { CircleAlert, CircleCheck } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import { activateInvestigator } from '../actions/sheet'
import { reviewDraft } from '../domain/creation'
import type { ProjectedSheet } from '../domain/sheet'

/**
 * What is still missing, and the button that ends the draft.
 *
 * Shown while the sheet is being written rather than only at the bottom of it,
 * because "what is left" is the question somebody filling in a long page keeps
 * asking. The same check runs on the server when they press the button, so this
 * is a courtesy rather than the rule.
 */
export function ReviewPanel({ sheet, readOnly }: { sheet: ProjectedSheet; readOnly: boolean }) {
  const t = useTranslations('investigators.sheet.review')
  const problems = useTranslations('investigators.errors')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  const review = reviewDraft({
    name: sheet.identity.name,
    age: sheet.identity.age,
    characteristics: sheet.characteristics,
    startingLuck: sheet.luck.current,
    occupationId: sheet.identity.occupationId,
  })

  const activate = useAction(activateInvestigator, {
    onSuccess: () => router.refresh(),
    onError: ({ error: actionError }) => {
      setError(
        resolveActionError(
          {},
          t('activateFailed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  if (sheet.status !== 'DRAFT') {
    return null
  }

  return (
    <section className="flex flex-col gap-4 rounded-sm border border-border-subtle p-4">
      <h2 className="font-display text-lg tracking-[--tracking-display] text-text-primary">
        {t('title')}
      </h2>

      {review.complete ? (
        <p className="flex items-center gap-2 font-ui text-sm text-status-positive">
          <CircleCheck className="size-4" aria-hidden="true" />
          {t('ready')}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {review.errors.map((problem) => (
            <li
              key={`${problem.key}-${JSON.stringify(problem.params ?? {})}`}
              className="flex items-center gap-2 font-ui text-sm text-text-secondary"
            >
              <CircleAlert className="size-4 shrink-0 text-status-warning" aria-hidden="true" />
              {problems(problem.key.replace('investigators.errors.', ''), problem.params)}
            </li>
          ))}
        </ul>
      )}

      <FormError>{error}</FormError>

      {readOnly ? null : (
        <div>
          <Button
            variant="accent"
            disabled={!review.complete || activate.isPending}
            onClick={() => {
              setError(null)
              activate.execute({
                investigatorId: sheet.id,
                expectedVersion: sheet.lockVersion,
              })
            }}
          >
            {activate.isPending ? t('activating') : t('activate')}
          </Button>
        </div>
      )}
    </section>
  )
}
