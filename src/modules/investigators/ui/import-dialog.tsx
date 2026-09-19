'use client'

import { Upload } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
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
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import { importInvestigator } from '../actions/investigators'

/**
 * Reading a character out of a file.
 *
 * The file is read in the browser and sent as text, so nothing is uploaded that
 * the server would have to store before deciding whether it is a character at
 * all. A paste box sits beside it because half the time the file came out of a
 * chat window rather than a download.
 *
 * Warnings are shown after a successful import rather than before it. What the
 * file got wrong is worth knowing, and it is not worth blocking a character
 * somebody has been waiting to play.
 */
export function ImportDialog() {
  const t = useTranslations('investigators.importDialog')
  const warnings = useTranslations('investigators.import')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [document, setDocument] = useState('')
  const [notes, setNotes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const run = useAction(importInvestigator, {
    onSuccess: ({ data }) => {
      if (!data) return

      if (data.warnings.length === 0) {
        setOpen(false)
        router.push(`/investigators/${data.investigatorId}`)
        return
      }

      setNotes(
        data.warnings.map((warning) =>
          warnings(warning.key.replace('investigators.import.', ''), {
            detail: warning.detail ?? '',
          }),
        ),
      )
      router.refresh()
    },
    onError: ({ error: actionError }) => {
      setError(
        resolveActionError(
          {
            'investigators.errors.importNotJson': t('errors.notJson'),
            'investigators.errors.importInvalid': t('errors.invalid'),
            'investigators.errors.importWrongRuleset': t('errors.wrongRuleset'),
            'investigators.errors.importDuplicateSkills': t('errors.duplicate'),
          },
          t('errors.failed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost">
            <Upload className="size-4" aria-hidden="true" />
            {t('trigger')}
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            setNotes([])
            run.execute({ document })
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="import-file">{t('file')}</FieldLabel>
              <input
                id="import-file"
                type="file"
                accept="application/json,.json"
                className="font-ui text-sm text-text-secondary"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  void file.text().then((text) => {
                    setDocument(text)
                    setError(null)
                  })
                }}
              />
              <FieldDescription>{t('fileHint')}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="import-text">{t('paste')}</FieldLabel>
              <Textarea
                id="import-text"
                value={document}
                onChange={(event) => setDocument(event.target.value)}
                rows={6}
              />
            </Field>

            {notes.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded-sm bg-surface-raised p-3">
                {notes.map((note) => (
                  <li key={note} className="font-ui text-xs text-status-warning">
                    {note}
                  </li>
                ))}
              </ul>
            ) : null}

            <FormError>{error}</FormError>
          </DialogBody>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant="accent"
              disabled={run.isPending || document.trim().length === 0}
            >
              {run.isPending ? t('importing') : t('confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
