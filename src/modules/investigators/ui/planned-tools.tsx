import { Compass, Dices, Flame, Swords } from 'lucide-react'
import { useTranslations } from 'next-intl'

/**
 * What this module will grow into, said out loud.
 *
 * Section 20 asks for this rather than leaving the gaps to be discovered: a
 * Keeper looking for chase rules and finding nothing cannot tell whether they
 * are missing or merely elsewhere. It is a small panel in the sheet's own
 * settings, deliberately not a row of dead navigation tabs.
 */
const PLANNED = [
  { id: 'dice', icon: Dices },
  { id: 'combat', icon: Swords },
  { id: 'chases', icon: Compass },
  { id: 'magic', icon: Flame },
] as const

export function PlannedTools() {
  const t = useTranslations('investigators.planned')

  return (
    <section className="flex flex-col gap-3 rounded-sm border border-dashed border-border-subtle p-4">
      <h2 className="font-ui text-sm text-text-primary">{t('title')}</h2>
      <p className="font-ui text-xs text-text-muted">{t('description')}</p>

      <ul className="grid gap-2 sm:grid-cols-2">
        {PLANNED.map((tool) => (
          <li key={tool.id} className="flex items-start gap-2">
            <tool.icon className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden="true" />
            <div className="flex flex-col">
              <span className="font-ui text-sm text-text-secondary">
                {t(`tools.${tool.id}.name`)}
              </span>
              <span className="font-ui text-xs text-text-muted">{t(`tools.${tool.id}.note`)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
