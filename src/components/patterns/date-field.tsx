'use client'

import { useState } from 'react'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

/**
 * A date, with what was entered spelled out underneath.
 *
 * A native date input is the right control — it gives a real picker on a phone
 * and a keyboard-friendly one on a desktop — but its *display* format follows
 * the browser's locale, not the page's. The same field reads 05/10/2026 to one
 * person and 10/05/2026 to another, and nothing on the page says which.
 *
 * So the value is echoed in words. It costs a line and removes the ambiguity
 * entirely, which matters here more than most places: a session searched over
 * the wrong month is not obvious until nobody can make any of the dates.
 */
export function DateField({
  id,
  name,
  label,
  defaultValue,
  min,
  max,
  required,
  disabled,
  description,
}: {
  id: string
  name: string
  label: string
  defaultValue?: string | undefined
  min?: string | undefined
  max?: string | undefined
  required?: boolean | undefined
  disabled?: boolean | undefined
  description?: React.ReactNode
}) {
  const [value, setValue] = useState(defaultValue ?? '')
  const spelled = spellDate(value)

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        type="date"
        defaultValue={defaultValue}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
      />
      <FieldDescription>{spelled ?? description}</FieldDescription>
    </Field>
  )
}

/** The same, for a deadline: a date and a time of day. */
export function DateTimeField({
  id,
  name,
  label,
  defaultValue,
  required,
  disabled,
  description,
}: {
  id: string
  name: string
  label: string
  defaultValue?: string | undefined
  required?: boolean | undefined
  disabled?: boolean | undefined
  description?: React.ReactNode
}) {
  const [value, setValue] = useState(defaultValue ?? '')
  const spelled = spellDateTime(value)

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        type="datetime-local"
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
      />
      <FieldDescription>{spelled ?? description}</FieldDescription>
    </Field>
  )
}

/**
 * Formatted as UTC on purpose.
 *
 * The value is a wall-clock date with no zone attached, so it is read back
 * exactly as typed. Letting the browser apply its own zone would shift the
 * echoed date by a day for anybody west of Greenwich.
 */
function spellDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const date = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return null

  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function spellDateTime(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!match?.[1]) return null

  const day = spellDate(match[1])
  return day ? `${day} at ${match[2]}:${match[3]}` : null
}
