'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import { setSessionParticipants } from '../actions/participants'
import { defaultQuorum } from '../domain/constants'
import type { ParticipantPriority, SessionDetail } from '../domain/types'

/**
 * Who is invited, and how much their presence matters.
 *
 * Priorities are the Keeper's private working notes. They are never shown to the
 * people they describe — being told you are "optional" is a social injury the
 * feature does not need to inflict to do its job.
 *
 * Keepers are pinned to required and their control is disabled: a session
 * without the person running it is not a session, and the rule is enforced
 * server-side regardless.
 */
const PRIORITY_LABELS = {
  REQUIRED: 'Required',
  PREFERRED: 'Preferred',
  OPTIONAL: 'Optional',
} as const

const PRIORITY_HELP: Record<ParticipantPriority, string> = {
  REQUIRED: 'No date works without them.',
  PREFERRED: 'Counts towards a good date.',
  OPTIONAL: 'Nice to have; never blocks.',
}

const MESSAGES: Record<string, string> = {
  'sessions.errors.participantsLocked':
    'The roster is fixed once a date has been proposed. Reopen availability to change it.',
  'sessions.errors.noKeeperAmongParticipants': 'Somebody has to run the session.',
  'sessions.errors.quorumAboveParticipantCount':
    'The quorum is higher than the number of people invited, so no date could ever work.',
  'sessions.errors.noParticipants': 'Invite at least one person.',
}

export function ParticipantsForm({
  session,
  candidates,
}: {
  session: SessionDetail
  candidates: readonly { userId: string; name: string; isKeeper: boolean }[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const initial = new Map(
    session.participants.map((participant) => [participant.userId, participant.priority]),
  )

  const [selected, setSelected] = useState<Map<string, ParticipantPriority>>(
    () => new Map(initial),
  )
  const [quorum, setQuorum] = useState(String(session.quorum))

  const save = useAction(setSessionParticipants, {
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      router.refresh()
    },
    onError: ({ error: actionError }) => {
      setError(
        resolveActionError(
          MESSAGES,
          'Could not save the roster.',
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  function toggle(userId: string, isKeeper: boolean) {
    setSelected((current) => {
      const next = new Map(current)
      if (next.has(userId)) next.delete(userId)
      else next.set(userId, isKeeper ? 'REQUIRED' : 'PREFERRED')
      return next
    })
  }

  function setPriority(userId: string, priority: ParticipantPriority) {
    setSelected((current) => new Map(current).set(userId, priority))
  }

  const investigatorCount = [...selected.keys()].filter(
    (userId) => !candidates.find((candidate) => candidate.userId === userId)?.isKeeper,
  ).length

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        save.execute({
          sessionId: session.id,
          quorum: Number(quorum),
          participants: [...selected.entries()].map(([userId, priority]) => ({
            userId,
            priority,
          })),
        })
      }}
      className="flex flex-col gap-6"
      noValidate
    >
      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Invited</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>How much their presence matters</TableHead>
              <TableHead>Answered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.map((candidate) => {
              const invited = selected.has(candidate.userId)
              const priority = selected.get(candidate.userId) ?? 'PREFERRED'
              const participant = session.participants.find(
                (entry) => entry.userId === candidate.userId,
              )

              return (
                <TableRow key={candidate.userId}>
                  <TableCell>
                    <Checkbox
                      checked={invited}
                      onCheckedChange={() => toggle(candidate.userId, candidate.isKeeper)}
                      aria-label={`Invite ${candidate.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    {candidate.name}
                    {candidate.isKeeper ? (
                      <span className="ml-2 font-ui text-2xs uppercase tracking-[--tracking-smallcaps] text-candle-11">
                        Keeper
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {invited ? (
                      <div className="flex max-w-56 flex-col gap-1">
                        <Select
                          items={PRIORITY_LABELS}
                          value={candidate.isKeeper ? 'REQUIRED' : priority}
                          disabled={candidate.isKeeper}
                          onValueChange={(value) =>
                            setPriority(candidate.userId, value as ParticipantPriority)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="font-ui text-2xs text-text-muted">
                          {candidate.isKeeper
                            ? 'Keepers are always required.'
                            : PRIORITY_HELP[priority]}
                        </span>
                      </div>
                    ) : (
                      <span className="font-ui text-sm text-text-muted">Not invited</span>
                    )}
                  </TableCell>
                  <TableCell className="text-text-secondary">
                    {participant?.respondedAt ? 'Yes' : '—'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Field className="max-w-56">
        <FieldLabel htmlFor="quorum">Quorum</FieldLabel>
        <Input
          id="quorum"
          type="number"
          min={1}
          max={selected.size || 1}
          value={quorum}
          onChange={(event) => setQuorum(event.target.value)}
          required
        />
        <FieldDescription>
          How many of the invited have to be free for the session to happen. Half plus one —{' '}
          {defaultQuorum(investigatorCount)} for this group — keeps a single busy person from
          holding up the campaign.
        </FieldDescription>
      </Field>

      <FormError>{error}</FormError>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="accent" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save roster'}
        </Button>
        {saved ? (
          <span role="status" className="font-ui text-xs text-status-positive">
            Saved
          </span>
        ) : null}
      </div>
    </form>
  )
}
