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
 * checks them again regardless — this is about not offering a button that will
 * be refused, which reads as a bug rather than as a rule.
 */
const MESSAGES: Record<string, string> = {
  'sessions.errors.noKeeperAmongParticipants': 'Nobody is set to run this session.',
  'sessions.errors.fewerParticipantsThanQuorum':
    'Fewer people are invited than the quorum requires, so no date could ever work.',
  'sessions.errors.deadlineInThePast': 'That deadline has already passed.',
  'sessions.errors.deadlineAfterWindowStarts':
    'The deadline falls after the first date being searched.',
  'sessions.errors.sessionMovedOn': 'Somebody else changed this session. Reload and try again.',
  'sessions.errors.invalidTransition': 'That is not possible from the session’s current state.',
  'sessions.errors.endBeforeStart': 'The session ends before it starts.',
}

/**
 * One error channel for every action on this panel.
 *
 * The shape is deliberately loose: each action has its own validation-error
 * type, and naming them all here would couple the panel to every schema it
 * touches for no gain — the flattening reads them structurally.
 */
type ActionFailure = {
  error: {
    serverError?: { messageKey?: string | undefined } | undefined
    validationErrors?: unknown
  }
}

function useMessage() {
  const [error, setError] = useState<string | null>(null)

  const handle = (fallback: string) => (failure: ActionFailure) => {
    setError(
      resolveActionError(
        MESSAGES,
        fallback,
        failure.error.serverError?.messageKey,
        failure.error.validationErrors,
      ),
    )
  }

  return { error, setError, handle }
}

export function KeeperActions({ session }: { session: SessionDetail }) {
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
    onError: handle('Could not open this session for availability.'),
  })
  const schedule = useAction(setSessionDate, {
    onSuccess: () => {
      setSchedulingOpen(false)
      refresh()
    },
    onError: handle('Could not set that date.'),
  })
  const reopen = useAction(reopenCollection, {
    onSuccess: () => {
      setReopenOpen(false)
      refresh()
    },
    onError: handle('Could not reopen collection.'),
  })
  const closeAnswers = useAction(closeCollection, {
    onSuccess: () => {
      setCloseOpen(false)
      refresh()
    },
    onError: handle('Could not close the answers.'),
  })
  const cancel = useAction(cancelSession, {
    onSuccess: () => {
      setCancelOpen(false)
      refresh()
    },
    onError: handle('Could not cancel this session.'),
  })
  const complete = useAction(completeSession, {
    onSuccess: () => {
      setCompleteOpen(false)
      refresh()
    },
    onError: handle('Could not close this session.'),
  })

  const status = session.status
  const terminal = status === 'COMPLETED' || status === 'CANCELLED'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {status === 'DRAFT' || status === 'COLLECTING' ? (
          <ButtonLink href={`/sessions/${session.id}/edit`} variant="outline">
            <Pencil className="size-4" aria-hidden="true" />
            Edit
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
            {publish.isPending ? 'Opening…' : 'Ask for availability'}
          </Button>
        ) : null}

        {status === 'COLLECTING' || status === 'PROPOSED' ? (
          <ButtonLink href={`/sessions/${session.id}/scheduling`} variant="accent">
            <CalendarSearch className="size-4" aria-hidden="true" />
            Find dates
          </ButtonLink>
        ) : null}

        {status === 'COLLECTING' ? (
          <Button variant="ghost" onClick={() => setCloseOpen(true)}>
            <Lock className="size-4" aria-hidden="true" />
            Close answers
          </Button>
        ) : null}

        {!terminal ? (
          <Button variant="outline" onClick={() => setSchedulingOpen(true)}>
            {status === 'SCHEDULED' ? (
              <Pencil className="size-4" aria-hidden="true" />
            ) : (
              <CalendarCheck className="size-4" aria-hidden="true" />
            )}
            {status === 'SCHEDULED' ? 'Change the date' : 'Set a date'}
          </Button>
        ) : null}

        {status === 'PROPOSED' || status === 'SCHEDULED' ? (
          <Button variant="ghost" onClick={() => setReopenOpen(true)}>
            <Undo2 className="size-4" aria-hidden="true" />
            Reopen
          </Button>
        ) : null}

        {status === 'SCHEDULED' ? (
          <Button variant="ghost" onClick={() => setCompleteOpen(true)}>
            <CircleCheck className="size-4" aria-hidden="true" />
            Mark as played
          </Button>
        ) : null}

        {!terminal ? (
          <Button variant="danger" onClick={() => setCancelOpen(true)}>
            <XCircle className="size-4" aria-hidden="true" />
            Cancel
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
              <DialogTitle>Set the date by hand</DialogTitle>
              <DialogDescription>
                Everyone invited is told. Times are in {session.timezone}.
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="date">Date</FieldLabel>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  required
                  defaultValue={session.searchWindowStart}
                  min={session.searchWindowStart}
                  max={session.searchWindowEnd}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="startHour">Starts at</FieldLabel>
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
                  <FieldLabel htmlFor="endHour">Ends at</FieldLabel>
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

              <FieldNote>
                Setting a date by hand overrides what people said they could do.
              </FieldNote>
            </DialogBody>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setSchedulingOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="accent" disabled={schedule.isPending}>
                {schedule.isPending ? 'Setting…' : 'Confirm date'}
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
              <DialogTitle>Ask everyone again?</DialogTitle>
              <DialogDescription>
                Every answer already given is cleared, and any confirmed date is dropped.
              </DialogDescription>
            </DialogHeader>

            <DialogBody>
              <Field>
                <FieldLabel htmlFor="availabilityDeadline">New deadline</FieldLabel>
                <Input
                  id="availabilityDeadline"
                  name="availabilityDeadline"
                  type="datetime-local"
                />
                <FieldDescription>
                  Optional, in {session.timezone}. Without one, collection stays open until you
                  close it.
                </FieldDescription>
              </Field>
            </DialogBody>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setReopenOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="accent" disabled={reopen.isPending}>
                {reopen.isPending ? 'Reopening…' : 'Reopen and clear answers'}
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
              <DialogTitle>Cancel this session?</DialogTitle>
              <DialogDescription>
                Everyone invited is told, with the reason. This cannot be undone.
              </DialogDescription>
            </DialogHeader>

            <DialogBody>
              <Field>
                <FieldLabel htmlFor="reason">Why</FieldLabel>
                <Textarea id="reason" name="reason" required autoFocus />
                <FieldDescription>Shown to everyone invited.</FieldDescription>
              </Field>
            </DialogBody>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setCancelOpen(false)}>
                Keep it
              </Button>
              <Button type="submit" variant="danger" disabled={cancel.isPending}>
                {cancel.isPending ? 'Cancelling…' : 'Cancel session'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Stop asking for availability?"
        description="Nobody can change their answer afterwards, and the dates already suggested stay as they are. You can reopen it later if plans change."
        confirmLabel="Close answers"
        pending={closeAnswers.isPending}
        onConfirm={() => closeAnswers.execute({ sessionId: session.id })}
      />

      <ConfirmDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        title="Mark this session as played?"
        description="Record who was there on the participants tab first if you have not already. A played session cannot be reopened."
        confirmLabel="Mark as played"
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
