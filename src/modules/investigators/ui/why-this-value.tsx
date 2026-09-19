'use client'

import { CircleHelp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Explanation } from '../domain/explanations'

/**
 * Why a calculated number is what it is.
 *
 * A popover rather than a permanent line, because the explanation is wanted
 * once - the first time somebody doubts the number - and then never again. A
 * sheet that printed the derivation beside every value would be a rulebook with
 * a character hidden in it.
 */
export function WhyThisValue({ explanation }: { explanation: Explanation | null }) {
  const t = useTranslations()
  const label = useTranslations('investigators.why')

  if (!explanation) return null

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={label('label')}
            className="cursor-pointer text-text-muted transition-interactive hover:text-text-primary"
          />
        }
      >
        <CircleHelp className="size-3.5" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="max-w-64">
        <p className="font-ui text-xs text-text-secondary">
          {t(explanation.key, explanation.inputs)}
        </p>
      </PopoverContent>
    </Popover>
  )
}
