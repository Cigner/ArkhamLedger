'use client'

import { Bug, Check, Send } from 'lucide-react'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/cn'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import { submitIssueReport } from '../actions/reports'
import { ISSUE_MESSAGE_MAX_LENGTH } from '../domain/schemas'

export function IssueReportDialog({
  compact = false,
  onSubmitted,
}: {
  compact?: boolean
  onSubmitted?: (() => void) | undefined
}) {
  const t = useTranslations()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const action = useAction(submitIssueReport, {
    onSuccess: () => {
      setSubmitted(true)
      onSubmitted?.()
    },
    onError: ({ error: actionError }) => {
      setError(
        resolveActionError(
          {
            'feedback.errors.messageTooShort': t('feedback.errors.messageTooShort'),
            'feedback.errors.messageTooLong': t('feedback.errors.messageTooLong'),
            'errors.rateLimited': t('feedback.errors.rateLimited'),
          },
          t('feedback.report.errors.failed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  function reset() {
    setMessage('')
    setError(null)
    setSubmitted(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size={compact ? 'icon' : 'md'}
            className={cn(
              'min-h-11 w-full gap-3 rounded-sm px-3',
              compact ? 'justify-center px-0' : 'justify-start',
            )}
            aria-label={compact ? t('feedback.report.trigger') : undefined}
            title={compact ? t('feedback.report.trigger') : undefined}
          />
        }
      >
        <Bug className="size-5" aria-hidden="true" />
        {compact ? null : t('feedback.report.trigger')}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {submitted ? t('feedback.report.receivedTitle') : t('feedback.report.title')}
          </DialogTitle>
          <DialogDescription>
            {submitted
              ? t('feedback.report.receivedDescription')
              : t('feedback.report.description')}
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <>
            <DialogBody>
              <p className="flex items-center gap-2 font-ui text-sm text-status-positive">
                <Check className="size-5" aria-hidden="true" />
                {t('feedback.report.saved')}
              </p>
            </DialogBody>
            <DialogFooter>
              <Button variant="accent" onClick={() => setOpen(false)}>
                {t('common.done')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setError(null)
              action.execute({ message, sourcePath: pathname })
            }}
          >
            <DialogBody className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="issue-report-message">
                  {t('feedback.report.messageLabel')}
                </FieldLabel>
                <Textarea
                  id="issue-report-message"
                  value={message}
                  onChange={(event) => setMessage(event.currentTarget.value)}
                  minLength={10}
                  maxLength={ISSUE_MESSAGE_MAX_LENGTH}
                  rows={8}
                  required
                  autoFocus
                  disabled={action.isPending}
                  placeholder={t('feedback.report.placeholder')}
                />
                <FieldDescription>{t('feedback.report.hint')}</FieldDescription>
              </Field>

              <div className="flex items-center justify-between gap-3">
                <FormError>{error}</FormError>
                <span data-tabular className="ml-auto font-ui text-2xs text-text-muted">
                  {message.length}/{ISSUE_MESSAGE_MAX_LENGTH}
                </span>
              </div>
            </DialogBody>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={action.isPending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant="accent" disabled={action.isPending}>
                <Send className="size-4" aria-hidden="true" />
                {action.isPending ? t('feedback.report.sending') : t('feedback.report.submit')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
