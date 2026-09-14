import { Field as FieldPrimitive } from '@base-ui/react/field'
import { cn } from '@/lib/cn'

/**
 * Form field wrapper.
 *
 * Owns the label-control-description-error grouping so that every form in the
 * application gets the same accessible wiring: the primitive links label,
 * description and error message to the control via aria-describedby and
 * aria-invalid without each form having to remember to.
 *
 * The error slot renders an icon glyph alongside the message, because a red
 * border on its own is invisible to anyone who cannot distinguish the colour.
 */
export function Field({ className, ...props }: FieldPrimitive.Root.Props) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      className={cn('flex w-full flex-col gap-1.5', className)}
      {...props}
    />
  )
}

export function FieldLabel({ className, ...props }: FieldPrimitive.Label.Props) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      className={cn(
        'font-ui text-xs font-medium uppercase tracking-[--tracking-smallcaps] text-text-secondary',
        className,
      )}
      {...props}
    />
  )
}

export function FieldDescription({ className, ...props }: FieldPrimitive.Description.Props) {
  return (
    <FieldPrimitive.Description
      data-slot="field-description"
      className={cn('font-ui text-xs leading-[--leading-ui] text-text-muted', className)}
      {...props}
    />
  )
}

/**
 * A note about a group of fields rather than about one.
 *
 * Deliberately not a Field part: the primitive's Description reads the Field
 * context to wire itself to a control with aria-describedby, and rendering one
 * outside a Field throws. A fieldset-level hint belongs to no single control, so
 * it is a plain paragraph that merely looks the same.
 */
export function FieldNote({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="field-note"
      className={cn('font-ui text-xs leading-[--leading-ui] text-text-muted', className)}
      {...props}
    />
  )
}

export function FieldError({ className, children, ...props }: FieldPrimitive.Error.Props) {
  return (
    <FieldPrimitive.Error
      data-slot="field-error"
      className={cn(
        'flex items-start gap-1.5 font-ui text-xs leading-[--leading-ui] text-status-danger',
        className,
      )}
      {...props}
    >
      <span aria-hidden="true">✕</span>
      <span>{children}</span>
    </FieldPrimitive.Error>
  )
}

export { FieldPrimitive }
