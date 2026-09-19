import { useTranslations } from 'next-intl'
import type { SheetComparison } from '../domain/comparison'
import type { SheetOptions } from '../data/sheet-options'
import { parseSkillKey } from '../domain/occupation-choices'

/**
 * What the evening did.
 *
 * Read from the two snapshots the session took, so it describes that night
 * rather than the sheet as it stands now. Losses are shown as losses rather
 * than as new totals: "lost 13 Sanity" is the sentence somebody says afterwards,
 * and "62" is not.
 */
export function SessionComparison({
  name,
  comparison,
  options,
}: {
  name: string
  comparison: SheetComparison
  options: SheetOptions
}) {
  const t = useTranslations('investigators.comparison')
  const resources = useTranslations('investigators.play.resources')
  const conditions = useTranslations('investigators.play.conditions')
  const names = useTranslations('investigators')

  const skillName = (definitionId: string, specializationKey: string): string => {
    const option = options.skills.find(
      (entry) => parseSkillKey(entry.skillKey).definitionId === definitionId,
    )
    const base = option ? names(option.nameKey.replace('investigators.', '')) : definitionId
    return specializationKey ? `${base} (${specializationKey})` : base
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-ui text-sm text-text-primary">{name}</h3>

      {comparison.unchanged ? (
        <p className="font-ui text-sm text-text-muted">{t('unchanged')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {comparison.resources.map((change) => (
            <li key={change.resource} className="font-ui text-sm tabular-nums text-text-secondary">
              {change.delta < 0
                ? t('lost', {
                    amount: Math.abs(change.delta),
                    resource: resources(change.resource),
                    after: change.after ?? 0,
                  })
                : t('recovered', {
                    amount: change.delta,
                    resource: resources(change.resource),
                    after: change.after ?? 0,
                  })}
            </li>
          ))}

          {comparison.conditions.map((change) => (
            <li key={change.condition} className="font-ui text-sm text-status-warning">
              {t('gained', { condition: conditions(change.condition) })}
            </li>
          ))}

          {comparison.skills.map((change) => (
            <li
              key={`${change.definitionId}:${change.specializationKey}`}
              className="font-ui text-sm tabular-nums text-status-positive"
            >
              {change.isNew
                ? t('learned', {
                    skill: skillName(change.definitionId, change.specializationKey),
                    value: change.after,
                  })
                : t('improved', {
                    skill: skillName(change.definitionId, change.specializationKey),
                    amount: change.delta,
                    value: change.after,
                  })}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
