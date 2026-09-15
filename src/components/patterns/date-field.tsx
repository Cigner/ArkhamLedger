'use client'

import { useRef, useState } from 'react'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { cn } from '@/lib/cn'

/**
 * A date entered as day, month and year, in that order, everywhere.
 *
 * The native date input was the obvious choice and had to go: its *display*
 * format follows the browser's locale rather than the page's, so the same field
 * read 05/10/2026 to one person and 10/05/2026 to another, and no attribute on
 * the page can change that — Chrome ignores `lang` for this entirely.
 *
 * Three segments remove the ambiguity by construction: the order is the order,
 * on every browser and every operating system. The cost is the native picker,
 * which is a real loss on a phone and is bought back partly by numeric keypads
 * and by typing that advances between segments on its own.
 *
 * The value reaching the form is a hidden input holding `YYYY-MM-DD`, so
 * everything downstream still receives an ISO date and nothing else has to know
 * this control exists.
 */
type Segments = { day: string; month: string; year: string }

export function DateField({
  id,
  name,
  label,
  defaultValue,
  required,
  disabled,
  description,
  onChange,
}: {
  id: string
  name: string
  label: string
  /** ISO `YYYY-MM-DD`. */
  defaultValue?: string | undefined
  required?: boolean | undefined
  disabled?: boolean | undefined
  description?: React.ReactNode
  onChange?: ((value: string) => void) | undefined
}) {
  const [segments, setSegments] = useState<Segments>(() => split(defaultValue))
  const monthRef = useRef<HTMLInputElement>(null)
  const yearRef = useRef<HTMLInputElement>(null)

  const value = join(segments)
  const spelled = spellDate(value)

  function update(part: keyof Segments, raw: string, advanceTo?: HTMLInputElement | null): void {
    const digits = raw.replace(/\D/g, '').slice(0, part === 'year' ? 4 : 2)
    const next = { ...segments, [part]: digits }

    setSegments(next)
    onChange?.(join(next))

    // Typing two digits into a two-digit box means that box is finished.
    if (advanceTo && digits.length === 2) advanceTo.focus()
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>

      <div
        className={cn(
          'flex h-10 w-full items-center gap-1 rounded-sm border border-border-default bg-surface-subtle px-3',
          'font-ui text-sm text-text-primary transition-interactive',
          'focus-within:border-focus-ring hover:border-border-strong',
          disabled && 'cursor-not-allowed opacity-45',
        )}
      >
        <Segment
          id={id}
          label="Day"
          placeholder="dd"
          width="w-7"
          value={segments.day}
          disabled={disabled}
          onValueChange={(raw) => update('day', raw, monthRef.current)}
        />
        <span aria-hidden="true" className="text-text-muted">
          /
        </span>
        <Segment
          ref={monthRef}
          label="Month"
          placeholder="mm"
          width="w-7"
          value={segments.month}
          disabled={disabled}
          onValueChange={(raw) => update('month', raw, yearRef.current)}
        />
        <span aria-hidden="true" className="text-text-muted">
          /
        </span>
        <Segment
          ref={yearRef}
          label="Year"
          placeholder="yyyy"
          width="w-12"
          value={segments.year}
          disabled={disabled}
          onValueChange={(raw) => update('year', raw)}
        />
      </div>

      <input type="hidden" name={name} value={value} required={required} />

      <FieldDescription>{spelled ?? description}</FieldDescription>
    </Field>
  )
}

function Segment({
  id,
  ref,
  label,
  placeholder,
  width,
  value,
  disabled,
  onValueChange,
}: {
  id?: string
  ref?: React.Ref<HTMLInputElement>
  label: string
  placeholder: string
  width: string
  value: string
  disabled?: boolean | undefined
  onValueChange: (value: string) => void
}) {
  return (
    <input
      id={id}
      ref={ref}
      type="text"
      // A numeric keypad on a phone, without the spinner and the scroll-wheel
      // surprises that type="number" brings.
      inputMode="numeric"
      autoComplete="off"
      aria-label={label}
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
      onFocus={(event) => event.target.select()}
      className={cn(
        width,
        'bg-transparent text-center tabular-nums outline-none',
        'placeholder:text-text-muted placeholder:italic',
        'disabled:cursor-not-allowed',
      )}
    />
  )
}

function split(value: string | undefined): Segments {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '')
  if (!match) return { day: '', month: '', year: '' }

  return { day: match[3]!, month: match[2]!, year: match[1]! }
}

/**
 * Assembles an ISO date, or nothing.
 *
 * A half-typed date is not a date: returning a partial value would let a form
 * submit 2026-1-, and the schema would reject it with something less helpful
 * than the field's own emptiness.
 */
function join(segments: Segments): string {
  const { day, month, year } = segments
  if (year.length !== 4 || month.length === 0 || day.length === 0) return ''

  const padded = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  return isRealDate(padded) ? padded : ''
}

/** Rejects the 31st of February, which every regex accepts. */
function isRealDate(iso: string): boolean {
  const date = new Date(`${iso}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso
}

export function spellDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const date = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return null

  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    // The value is a wall-clock date with no zone, so it is read back exactly as
    // typed; applying the browser's zone would shift it a day west of Greenwich.
    timeZone: 'UTC',
  })
}
