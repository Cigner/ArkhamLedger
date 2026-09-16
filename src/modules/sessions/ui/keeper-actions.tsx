'use client'

import {
  CalendarCheck,
  CalendarSearch,
  CircleCheck,
  Lock,
  Pencil,
  Send,
  Undo2,
  XCircle,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { ButtonLink } from '@/components/ui/button-link'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel, FieldNote } from '@/components/ui/field'
import { DateField } from '@/components/patterns/date-field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/patterns/confirm-dialog'
import { readString } from '@/lib/form-data'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import {
  cancelSession,
  closeCollection,
  completeSession,
  publishSession,
  reopenCollection,
  setSessionDate,
} from '../actions/session'
import type { SessionDetail } from '../domain/types'

/**
 * Everything a Keeper can do to a session, offered according to its status.
 *
 * Only the transitions the lifecycle actually permits are rendered. The server
 * checks them again regardless - this is about not offering a button that will
 * be refused, which reads as a bug rather than as a rule.
 */
/**
 * One error channel for every action on this panel.
 *
 * The shape is deliberately loose: each action has its own validation-error
 * type, and naming them all here would couple the panel to every schema it
 * touches for no gain - the flattening reads them structurally.
 */
type ActionFailure = {
  error: {
    serverError?: { messageKey?: string | undefined } | undefined
    validationErrors?: unknown
  }
}

function useMessage() {
  const t = useTranslations('sessions.keeperActions')
  const [error, setError] = useState<string | null>(null)
  const messages: Record<string, string> = {
    'sessions.errors.noKeeperAmongParticipants': t('errors.noKeeper'),
    'sessions.errors.fewerParticipantsThanQuorum': t('errors.fewerThanQuorum'),
    'sessions.errors.deadlineInThePast': t('errors.deadlineInPast'),
    'sessions.errors.deadlineAfterWindowStarts': t('errors.deadlineAfterStart'),
    'sessions.errors.sessionMovedOn': t('errors.sessionMovedOn'),
    'sessions.errors.invalidTransition': t('errors.invalidTransition'),
    'sessions.errors.endBeforeStart': t('errors.endBeforeStart'),
  }

  const handle = (fallback: string) => (failure: ActionFailure) => {
    setError(
      resolveActionError(
        messages,
        fallback,
        failure.error.serverError?.messageKey,
        failure.error.validationErrors,
      ),
    )
  }

  return { error, setError, handle }
}

export function KeeperActions({ session }: { session: SessionDetail }) {
  const t = useTranslations('sessions.keeperActions')
  const router = useRouter()
  const { error, setError, handle } = useMessage()

  const [schedulingOpen, setSchedulingOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)

  const refresh = () => router.refresh()

  const publish = useAction(publishSession, {
    onSuccess: refresh,
    onError: handle(t('errors.publishFailed')),
  })
  const schedule = useAction(setSessionDate, {
    onSuccess: () => {
      setSchedulingOpen(false)
      refresh()
    },
    onError: handle(t('errors.scheduleFailed')),
  })
  const reopen = useAction(reopenCollection, {
    onSuccess: () => {
      setReopenOpen(false)
      refresh()
    },
    onError: handle(t('errors.reopenFailed')),
  })
  const closeAnswers = useAction(closeCollection, {
    onSuccess: () => {
      setCloseOpen(false)
      refresh()
    },
    onError: handle(t('errors.closeFailed')),
  })
  const cancel = useAction(cancelSession, {
    onSuccess: () => {
      setCancelOpen(false)
      refresh()
    },
    onError: handle(t('errors.cancelFailed')),
  })
  const complete = useAction(completeSession, {
    onSuccess: () => {
      setCompleteOpen(false)
      refresh()
    },
    onError: handle(t('errors.completeFailed')),
  })

  const status = session.status
  const terminal = status === 'COMPLETED' || status === 'CANCELLED'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {status === 'DRAFT' || status === 'COLLECTING' ? (
          <ButtonLink href={`/sessions/${session.id}/edit`} variant="outline">
            <Pencil className="size-4" aria-hidden="true" />
            {t('edit')}
          </ButtonLink>
        ) : null}

        {status === 'DRAFT' ? (
          <Button
            variant="accent"
            disabled={publish.isPending}
            onClick={() => {
              setError(null)
              publish.execute({ sessionId: session.id })
            }}
          >
            <Send className="size-4" aria-hidden="true" />
            {publish.isPending ? t('opening') : t('askAvailability')}
          </Button>
        ) : null}

        {status === 'COLLECTING' || status === 'PROPOSED' ? (
          <ButtonLink href={`/sessions/${session.id}/scheduling`} variant="accent">
            <CalendarSearch className="size-4" aria-hidden="true" />
            {t('findDates')}
          </ButtonLink>
        ) : null}

        {status === 'COLLECTING' ? (
          <Button variant="ghost" onClick={() => setCloseOpen(true)}>
            <Lock className="size-4" aria-hidden="true" />
            {t('closeAnswers')}
          </Button>
        ) : null}

        {!terminal ? (
          <Button variant="outline" onClick={() => setSchedulingOpen(true)}>
            {status === 'SCHEDULED' ? (
              <Pencil className="size-4" aria-hidden="true" />
            ) : (
              <CalendarCheck className="size-4" aria-hidden="true" />
            )}
            {status === 'SCHEDULED' ? t('changeDate') : t('setDate')}
          </Button>
        ) : null}

        {status === 'PROPOSED' || status === 'SCHEDULED' ? (
          <Button variant="ghost" onClick={() => setReopenOpen(true)}>
            <Undo2 className="size-4" aria-hidden="true" />
            {t('reopen')}
          </Button>
        ) : null}

        {status === 'SCHEDULED' ? (
          <Button variant="ghost" onClick={() => setCompleteOpen(true)}>
            <CircleCheck className="size-4" aria-hidden="true" />
            {t('markPlayed')}
          </Button>
        ) : null}

        {!terminal ? (
          <Button variant="danger" onClick={() => setCancelOpen(true)}>
            <XCircle className="size-4" aria-hidden="true" />
            {t('cancel')}
          </Button>
        ) : null}
      </div>

      <FormError>{error}</FormError>

      <Dialog open={schedulingOpen} onOpenChange={setSchedulingOpen}>
        <DialogContent className="max-w-md">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setError(null)
              const form = new FormData(event.currentTarget)
              schedule.execute({
                sessionId: session.id,
                date: readString(form, 'date'),
                startHour: Number(readString(form, 'startHour')),
                endHour: Number(readString(form, 'endHour')),
                acknowledgeWarnings: true,
              })
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('manual.title')}</DialogTitle>
              <DialogDescription>
                {t('manual.description', { timezone: session.timezone })}
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="flex flex-col gap-4">
              <DateField
                id="date"
                name="date"
                label={t('manual.date')}
                required
                defaultValue={session.searchWindowStart}
              />

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="startHour">{t('manual.startsAt')}</FieldLabel>
                  <Input
                    id="startHour"
                    name="startHour"
                    type="number"
                    min={0}
                    max={23}
                    defaultValue={session.gridStartHour + 2}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="endHour">{t('manual.endsAt')}</FieldLabel>
                  <Input
                    id="endHour"
                    name="endHour"
                    type="number"
                    min={1}
                    max={24}
                    defaultValue={session.gridEndHour}
                    required
                  />
                </Field>
              </div>

              <FieldNote>{t('manual.warning')}</FieldNote>
            </DialogBody>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setSchedulingOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" variant="accent" disabled={schedule.isPending}>
                {schedule.isPending ? t('manual.setting') : t('manual.confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent className="max-w-md">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setError(null)
              const form = new FormData(event.currentTarget)
              reopen.execute({
                sessionId: session.id,
                availabilityDeadline: readString(form, 'availabilityDeadline') || undefined,
              })
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('reopenDialog.title')}</DialogTitle>
              <DialogDescription>{t('reopenDialog.description')}</DialogDescription>
            </DialogHeader>

            <DialogBody>
              <DateField
                id="availabilityDeadline"
                name="availabilityDeadline"
                label={t('reopenDialog.deadline')}
                description={t('reopenDialog.deadlineHint', { timezone: session.timezone })}
              />
            </DialogBody>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setReopenOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" variant="accent" disabled={reopen.isPending}>
                {reopen.isPending ? t('reopenDialog.reopening') : t('reopenDialog.confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-md">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setError(null)
              const form = new FormData(event.currentTarget)
              cancel.execute({ sessionId: session.id, reason: readString(form, 'reason') })
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('cancelDialog.title')}</DialogTitle>
              <DialogDescription>{t('cancelDialog.description')}</DialogDescription>
            </DialogHeader>

            <DialogBody>
              <Field>
                <FieldLabel htmlFor="reason">{t('cancelDialog.reason')}</FieldLabel>
                <Textarea id="reason" name="reason" required autoFocus />
                <FieldDescription>{t('cancelDialog.reasonHint')}</FieldDescription>
              </Field>
            </DialogBody>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setCancelOpen(false)}>
                {t('cancelDialog.keep')}
              </Button>
              <Button type="submit" variant="danger" disabled={cancel.isPending}>
                {cancel.isPending ? t('cancelDialog.cancelling') : t('cancelDialog.confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title={t('closeDialog.title')}
        description={t('closeDialog.description')}
        confirmLabel={t('closeAnswers')}
        pending={closeAnswers.isPending}
        onConfirm={() => closeAnswers.execute({ sessionId: session.id })}
      />

      <ConfirmDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        title={t('completeDialog.title')}
        description={t('completeDialog.description')}
        confirmLabel={t('markPlayed')}
        pending={complete.isPending}
        onConfirm={() =>
          complete.execute({
            sessionId: session.id,
            attendance: session.participants.map((participant) => ({
              userId: participant.userId,
              attendance: participant.attendance,
            })),
          })
        }
      />
    </div>
  )
}
