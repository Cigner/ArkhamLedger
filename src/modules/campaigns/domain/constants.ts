/**
 * Campaign policy constants.
 */

/** How long an invitation link stays usable. */
export const INVITATION_TTL_DAYS = 14

/** Upper bound on uses for a shared link, so a leaked one has a bounded blast radius. */
export const INVITATION_MAX_USES = 50

export const CAMPAIGN_NAME_MIN_LENGTH = 3
export const CAMPAIGN_NAME_MAX_LENGTH = 160
export const CAMPAIGN_DESCRIPTION_MAX_LENGTH = 4000

export const SCENARIO_NAME_MAX_LENGTH = 200
export const SCENARIO_DESCRIPTION_MAX_LENGTH = 8000
