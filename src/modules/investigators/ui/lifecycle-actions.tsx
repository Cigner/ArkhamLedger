'use client'

import { Archive, ArchiveRestore, Skull, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/patterns/confirm-dialog'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import {
  archiveInvestigator,
  changeInvestigatorStatus,
  deleteDraftInvestigator,
} from '../actions/lifecycle'
import type { InvestigatorStatus } from '../domain/lifecycle'
import type { ProjectedSheet } from '../domain/sheet'

/**
 * How a character ends.
 *
 * Retiring, dying and being put away are the endings this game produces, and
 * they are offered here rather than buried in a settings page because they are
 * the things a player reaches for after a bad night.
 *
 * Nothing here destroys a character except deleting a draft nobody has seen.
 * The dialogs say which is which, because "archive" and "delete" are the two
 * words people most often read as each other.
 */
export function LifecycleActions({
  sheet,
  archived,
  canEdit,
}: {
  sheet: ProjectedSheet
  archived: boolean
  canEdit: boolean
}) {
  const t = useTranslations('investigators.lifecycle')
  const router = useRouter()
  const [pending, setPending] = useState<'RETIRED' | 'DECEASED' | 'ACTIVE' | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const messages = {
    'investigators.errors.sheetMovedOn': t('errors.movedOn'),
    'investigators.errors.invalidStatusTransition': t('errors.notPossible'),
    'investigators.errors.deceasedStaysArchived': t('errors.deceasedStays'),
    'investigators.errors.deleteBlocked': t('errors.deleteBlocked'),
    'investigators.errors.notYours': t('errors.notYours'),
  }

  const fail = (actionError: {
    serverError?: { messageKey?: string | undefined } | undefined
    validationErrors?: unknown
  }) => {
    setPending(null)
    setArchiving(false)
    setDeleting(false)
    setError(
      resolveActionError(
        messages,
        t('errors.failed'),
        actionError.serverError?.messageKey,
        actionError.validationErrors,
      ),
    )
  }

  const change = useAction(changeInvestigatorStatus, {
    onSuccess: () => {
      setPending(null)
      router.refresh()
    },
    onError: ({ error: actionError }) => fail(actionError),
  })

  const archive = useAction(archiveInvestigator, {
    onSuccess: () => {
      setArchiving(false)
      router.refresh()
    },
    onError: ({ error: actionError }) => fail(actionError),
  })

  const remove = useAction(deleteDraftInvestigator, {
    onSuccess: () => router.push('/investigators'),
    onError: ({ error: actionError }) => fail(actionError),
  })

  if (!canEdit) return null

  const status: InvestigatorStatus = sheet.status

  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
      <div className="flex flex-wrap items-center gap-2">
        {status === 'ACTIVE' ? (
          <>
            <Button variant="ghost" onClick={() => setPending('RETIRED')}>
              <Undo2 className="size-4" aria-hidden="true" />
              {t('retire')}
            </Button>
            <Button variant="ghost" onClick={() => setPending('DECEASED')}>
              <Skull className="size-4" aria-hidden="true" />
              {t('died')}
            </Button>
          </>
        ) : null}

        {status === 'RETIRED' ? (
          <Button variant="ghost" onClick={() => setPending('ACTIVE')}>
            <Undo2 className="size-4" aria-hidden="true" />
            {t('unretire')}
          </Button>
        ) : null}

        <Button variant="ghost" onClick={() => setArchiving(true)}>
          {archived ? (
            <ArchiveRestore className="size-4" aria-hidden="true" />
          ) : (
            <Archive className="size-4" aria-hidden="true" />
          )}
          {archived ? t('restore') : t('archive')}
        </Button>

        {status === 'DRAFT' ? (
          <Button variant="danger" onClick={() => setDeleting(true)}>
            <Trash2 className="size-4" aria-hidden="true" />
            {t('delete')}
          </Button>
        ) : null}
      </div>

      <FormError>{error}</FormError>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending === 'DECEASED' ? t('diedDialog.title') : t('statusDialog.title')}
        description={
          pending === 'DECEASED' ? t('diedDialog.description') : t('statusDialog.description')
        }
        confirmLabel={pending === 'DECEASED' ? t('died') : t('confirm')}
        pending={change.isPending}
        onConfirm={() => {
          if (!pending) return
          setError(null)
          change.execute({
            investigatorId: sheet.id,
            expectedVersion: sheet.lockVersion,
            status: pending,
          })
        }}
      />

      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title={archived ? t('restoreDialog.title') : t('archiveDialog.title')}
        description={archived ? t('restoreDialog.description') : t('archiveDialog.description')}
        confirmLabel={archived ? t('restore') : t('archive')}
        pending={archive.isPending}
        onConfirm={() => {
          setError(null)
          archive.execute({ investigatorId: sheet.id, archived: !archived })
        }}
      />

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('deleteDialog.title')}
        description={t('deleteDialog.description')}
        confirmLabel={t('delete')}
        pending={remove.isPending}
        onConfirm={() => {
          setError(null)
          remove.execute({ investigatorId: sheet.id })
        }}
      />
    </div>
  )
}
