'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { InvestigatorView } from '../data/investigator-view'
import { CharacteristicsSection } from './characteristics-section'
import { IdentitySection } from './identity-section'
import { ActiveSheet } from './active-sheet'
import { BackstorySection } from './backstory-section'
import { LifecycleActions } from './lifecycle-actions'
import { FinancesSection } from './finances-section'
import { OccupationSection } from './occupation-section'
import { PossessionsSection } from './possessions-section'
import { PrivacySection } from './privacy-section'
import { ReviewPanel } from './review-panel'
import { SkillsSection } from './skills-section'
import { WeaponsSection } from './weapons-section'

/**
 * The whole sheet, on one page.
 *
 * Sections rather than steps. A character is written by moving around it -
 * choosing an occupation sends you back to look at EDU, and a wizard would make
 * that a journey. Each section saves on its own and reports what it did.
 *
 * The version is held here and handed down, so a section that saves updates the
 * number its siblings will send. Without that the second save of a sitting would
 * always collide with the first.
 */
export function InvestigatorSheet({ view }: { view: InvestigatorView }) {
  const t = useTranslations('investigators.sheet')
  const [version, setVersion] = useState(view.sheet.lockVersion)

  const sheet = { ...view.sheet, lockVersion: version }
  const readOnly = !view.viewer.canEdit

  /*
   * A draft is written; anything else is played. Showing the creator for a
   * character already in a campaign would offer to rewrite a sheet somebody is
   * in the middle of using.
   */
  if (sheet.status !== 'DRAFT') {
    return (
      <ActiveSheet
        sheet={sheet}
        options={view.options}
        events={view.events}
        notes={view.notes}
        viewer={{ userId: view.viewer.userId, role: view.viewer.role }}
        archived={view.archived}
        provenance={view.provenance}
        history={view.history}
        requestable={view.requestable}
        readOnly={readOnly}
        onVersionChange={setVersion}
      />
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {readOnly ? (
        <p className="rounded-sm bg-surface-raised p-3 font-ui text-sm text-text-secondary">
          {t('readOnly')}
        </p>
      ) : null}

      <IdentitySection sheet={sheet} readOnly={readOnly} onVersionChange={setVersion} />
      <CharacteristicsSection sheet={sheet} readOnly={readOnly} onVersionChange={setVersion} />
      <OccupationSection
        sheet={sheet}
        options={view.options}
        readOnly={readOnly}
        onVersionChange={setVersion}
      />
      <SkillsSection
        sheet={sheet}
        options={view.options}
        readOnly={readOnly}
        onVersionChange={setVersion}
      />
      <WeaponsSection
        sheet={sheet}
        options={view.options}
        readOnly={readOnly}
        onVersionChange={setVersion}
      />
      <BackstorySection sheet={sheet} readOnly={readOnly} onVersionChange={setVersion} />
      <FinancesSection sheet={sheet} readOnly={readOnly} onVersionChange={setVersion} />
      <PossessionsSection sheet={sheet} readOnly={readOnly} onVersionChange={setVersion} />
      <PrivacySection
        sheet={sheet}
        hiddenFields={view.hiddenFields}
        canConfigure={view.viewer.canConfigurePrivacy}
      />
      <ReviewPanel sheet={sheet} readOnly={readOnly} />
      <LifecycleActions sheet={sheet} archived={view.archived} canEdit={!readOnly} />
    </div>
  )
}
