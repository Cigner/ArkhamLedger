'use client'

import { Check, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { FormError } from '@/modules/identity/ui/form-error'

/**
 * One block of the character sheet.
 *
 * The sheet is one long page rather than a wizard, because that is what the
 * paper it comes from is: somebody filling in their occupation can see the
 * characteristics it depends on without going back a step. Each block saves on
 * its own, so a long page is not one enormous submission.
 *
 * The save state lives beside the button rather than in a corner of the screen.
 * A confirmation somewhere else is a confirmation nobody sees while they are
 * looking at what they just typed.
 */
export function SheetSection({
  title,
  description,
  children,
  onSave,
  pending,
  saved,
  error,
  readOnly,
}: {
  title: string
  description?: string
  children: React.ReactNode
  onSave?: () => void
  pending?: boolean
  saved?: boolean
  error?: string | null
  readOnly?: boolean
}) {
  const t = useTranslations('investigators.sheet')

  return (
    <section className="flex flex-col gap-4 border-b border-border-subtle pb-8 last:border-0">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg tracking-[--tracking-display] text-text-primary">
          {title}
        </h2>
        {description ? <p className="font-ui text-sm text-text-secondary">{description}</p> : null}
      </header>

      {children}

      {error ? <FormError>{error}</FormError> : null}

      {readOnly || !onSave ? null : (
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={onSave} disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-4" aria-hidden="true" />
            )}
            {pending ? t('saving') : t('save')}
          </Button>
          <span role="status" className="font-ui text-xs text-status-positive">
            {saved && !pending ? t('saved') : ''}
          </span>
        </div>
      )}
    </section>
  )
}
