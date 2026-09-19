import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { availableRulesets } from '@/modules/investigators/domain/rulesets'

/**
 * Which rules this deployment is carrying.
 *
 * Read-only, and that is the decision rather than a stage of one. Rulesets are
 * immutable versioned packages in the repository; an administrator who could
 * edit the active one could change what an existing character's numbers mean.
 * The editor described in section 26 of the plan publishes new versions instead,
 * and it comes after the model has stopped moving.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.rulesets')
  return { title: t('title') }
}

export default async function AdminRulesetsPage() {
  const t = await getTranslations('admin.rulesets')
  const names = await getTranslations('investigators')
  const rulesets = availableRulesets()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg tracking-[--tracking-display] text-text-primary">
          {t('title')}
        </h2>
        <p className="font-ui text-sm text-text-secondary">{t('description')}</p>
      </div>

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.name')}</TableHead>
              <TableHead>{t('columns.id')}</TableHead>
              <TableHead>{t('columns.version')}</TableHead>
              <TableHead className="text-right">{t('columns.skills')}</TableHead>
              <TableHead className="text-right">{t('columns.occupations')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rulesets.map((ruleset) => (
              <TableRow key={`${ruleset.manifest.id}@${ruleset.manifest.version}`}>
                <TableCell>
                  {names(ruleset.manifest.nameKey.replace('investigators.', ''))}
                </TableCell>
                <TableCell className="font-ui text-xs text-text-secondary">
                  {ruleset.manifest.id}
                </TableCell>
                <TableCell className="tabular-nums text-text-secondary">
                  {ruleset.manifest.version}
                </TableCell>
                <TableCell className="text-right tabular-nums text-text-secondary">
                  {ruleset.skills.skills.length}
                </TableCell>
                <TableCell className="text-right tabular-nums text-text-secondary">
                  {ruleset.occupations.occupations.length}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <p className="font-ui text-xs text-text-muted">{t('immutableNote')}</p>
    </div>
  )
}
