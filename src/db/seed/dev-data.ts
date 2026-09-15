/**
 * Development dataset.
 *
 * Deliberately not "a few happy rows". Every list, badge, empty state and
 * rejection screen in the application should be reachable by signing in as
 * somebody here, so the set covers each status a record can hold - including the
 * awkward ones: an account awaiting activation, a disabled account, an archived
 * campaign, a member who left, an invitation that was revoked.
 *
 * Separated from the seeding logic so the shape of the fixture can be read and
 * changed without wading through inserts.
 */
export const DEV_PASSWORD = 'arkham-dev-password'

/** Anchor for every relative date, so a seeded database always looks the same. */
export const SEED_NOW = new Date('2026-09-14T12:00:00.000Z')

export type SeedUser = {
  readonly key: string
  readonly email: string
  readonly name: string
  readonly role?: 'user' | 'admin'
  readonly status?: 'PENDING_ACTIVATION' | 'ACTIVE' | 'DISABLED'
  readonly note: string
}

export const SEED_USERS: readonly SeedUser[] = [
  {
    key: 'warden',
    email: 'admin@arkham.test',
    name: 'Warden Hollis',
    role: 'admin',
    note: 'Administrator - use this to reach the admin panel',
  },
  {
    key: 'eleanor',
    email: 'eleanor@arkham.test',
    name: 'Eleanor Ashcroft',
    note: 'Keeper and owner of two campaigns; the richest view of the app',
  },
  {
    key: 'marcus',
    email: 'marcus@arkham.test',
    name: 'Marcus Vane',
    note: 'Owns two campaigns, plays in a third - mixed roles across campaigns',
  },
  {
    key: 'harriet',
    email: 'harriet@arkham.test',
    name: 'Harriet Blackwood',
    note: 'Co-Keeper without ownership - sees Settings but not the owner controls',
  },
  { key: 'anna', email: 'anna@arkham.test', name: 'Anna Kowalska', note: 'Investigator' },
  { key: 'tomas', email: 'tomas@arkham.test', name: 'Tomás Reyes', note: 'Investigator' },
  {
    key: 'jozef',
    email: 'jozef@arkham.test',
    name: 'Józef Malinowski',
    note: 'Investigator - non-ASCII name, checks collation and rendering',
  },
  {
    key: 'nadia',
    email: 'nadia@arkham.test',
    name: 'Nadia Farouk',
    note: 'Left one campaign - her membership row is LEFT, not deleted',
  },
  {
    key: 'silas',
    email: 'silas@arkham.test',
    name: 'Silas Crane',
    status: 'PENDING_ACTIVATION',
    note: 'Awaiting activation - an activation link is printed below',
  },
  {
    key: 'mordecai',
    email: 'mordecai@arkham.test',
    name: 'Mordecai Finch',
    status: 'DISABLED',
    note: 'Disabled - signing in as them must fail with the generic message',
  },
] as const

export type SeedMembership = {
  readonly userKey: string
  readonly role: 'KEEPER' | 'INVESTIGATOR'
  readonly status?: 'ACTIVE' | 'LEFT' | 'REMOVED'
}

export type SeedCampaign = {
  readonly key: string
  readonly name: string
  readonly description: string
  readonly ownerKey: string
  readonly status: 'PLANNING' | 'ACTIVE' | 'ON_HIATUS' | 'COMPLETED' | 'ARCHIVED'
  readonly scenario?: { readonly name: string; readonly description: string }
  readonly members: readonly SeedMembership[]
}

export const SEED_CAMPAIGNS: readonly SeedCampaign[] = [
  {
    key: 'masks',
    name: 'Masks of Nyarlathotep',
    description:
      'A globe-spanning investigation that begins with a dead friend in New York, 1925, and ends somewhere none of them expected.',
    ownerKey: 'eleanor',
    status: 'ACTIVE',
    scenario: {
      name: 'Chapter One: Peru',
      description: 'The 1921 expedition, and what the survivors agreed never to write down.',
    },
    members: [
      { userKey: 'eleanor', role: 'KEEPER' },
      { userKey: 'harriet', role: 'KEEPER' },
      { userKey: 'anna', role: 'INVESTIGATOR' },
      { userKey: 'tomas', role: 'INVESTIGATOR' },
      { userKey: 'jozef', role: 'INVESTIGATOR' },
      { userKey: 'marcus', role: 'INVESTIGATOR' },
      { userKey: 'nadia', role: 'INVESTIGATOR', status: 'LEFT' },
    ],
  },
  {
    key: 'haunting',
    name: 'The Haunting',
    description:
      'A short piece of work at the Corbitt house on Boston Road. It should take one evening.',
    ownerKey: 'marcus',
    status: 'PLANNING',
    scenario: {
      name: 'The Corbitt House',
      description: 'Nothing is wrong with the house. Several tenants have said so, in writing.',
    },
    members: [
      { userKey: 'marcus', role: 'KEEPER' },
      { userKey: 'anna', role: 'INVESTIGATOR' },
      { userKey: 'jozef', role: 'INVESTIGATOR' },
      { userKey: 'eleanor', role: 'INVESTIGATOR' },
    ],
  },
  {
    key: 'orient',
    name: 'Horror on the Orient Express',
    description: 'Paused while half the party is abroad. Resuming in the winter.',
    ownerKey: 'eleanor',
    status: 'ON_HIATUS',
    members: [
      { userKey: 'eleanor', role: 'KEEPER' },
      { userKey: 'tomas', role: 'INVESTIGATOR' },
      { userKey: 'harriet', role: 'INVESTIGATOR' },
      { userKey: 'nadia', role: 'INVESTIGATOR' },
    ],
  },
  {
    key: 'innsmouth',
    name: 'Shadows over Innsmouth',
    description: 'Finished. Two investigators retired; one did not.',
    ownerKey: 'marcus',
    status: 'COMPLETED',
    members: [
      { userKey: 'marcus', role: 'KEEPER' },
      { userKey: 'anna', role: 'INVESTIGATOR' },
      { userKey: 'tomas', role: 'INVESTIGATOR' },
    ],
  },
  {
    key: 'derelict',
    name: 'The Derelict',
    description: 'Abandoned after two sessions. Kept for the notes.',
    ownerKey: 'eleanor',
    status: 'ARCHIVED',
    members: [
      { userKey: 'eleanor', role: 'KEEPER' },
      { userKey: 'jozef', role: 'INVESTIGATOR' },
    ],
  },
] as const

export type SeedInvitation = {
  readonly campaignKey: string
  readonly label: string
  readonly targetUserKey?: string
  readonly roleOnJoin?: 'KEEPER' | 'INVESTIGATOR'
  readonly maxUses?: number
  readonly usedCount?: number
  /** Days from the anchor; negative puts the expiry in the past. */
  readonly expiresInDays?: number
  readonly revoked?: boolean
}

/**
 * One invitation per rejection screen, so every branch of the landing page can
 * be seen without manufacturing the state by hand.
 */
export const SEED_INVITATIONS: readonly SeedInvitation[] = [
  {
    campaignKey: 'masks',
    label: 'live personal invitation for Silas (who has not activated yet)',
    targetUserKey: 'silas',
  },
  {
    campaignKey: 'masks',
    label: 'live shared link, 5 uses, 1 taken',
    maxUses: 5,
    usedCount: 1,
  },
  {
    campaignKey: 'haunting',
    label: 'live shared link that joins as Keeper',
    maxUses: 3,
    roleOnJoin: 'KEEPER',
  },
  { campaignKey: 'masks', label: 'EXPIRED', expiresInDays: -3 },
  { campaignKey: 'masks', label: 'REVOKED', revoked: true },
  { campaignKey: 'masks', label: 'EXHAUSTED', maxUses: 2, usedCount: 2 },
] as const

export type SeedAvailabilityRange = {
  readonly userKey: string
  /** Local date in the campaign's zone, ISO `YYYY-MM-DD`. */
  readonly date: string
  readonly fromHour: number
  readonly toHour: number
  readonly state: 'YES' | 'IF_NEED_BE' | 'NO'
}

export type SeedSession = {
  readonly key: string
  readonly campaignKey: string
  readonly title: string
  readonly description: string
  readonly status: 'DRAFT' | 'COLLECTING' | 'PROPOSED' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'
  readonly windowStart: string
  readonly windowEnd: string
  readonly gridStartHour?: number
  readonly gridEndHour?: number
  readonly minSessionHours?: number
  readonly quorum?: number
  /** Days from the anchor. */
  readonly deadlineInDays?: number
  readonly participants: readonly {
    readonly userKey: string
    readonly priority: 'REQUIRED' | 'PREFERRED' | 'OPTIONAL'
    readonly responded?: boolean
    readonly attendance?: 'UNKNOWN' | 'ATTENDED' | 'ABSENT'
  }[]
  readonly availability?: readonly SeedAvailabilityRange[]
  /** Local wall-clock confirmation for SCHEDULED and COMPLETED sessions. */
  readonly confirmed?: { readonly date: string; readonly fromHour: number; readonly toHour: number }
  readonly cancelledReason?: string
}

/**
 * Sessions, one per lifecycle status.
 *
 * The COLLECTING session carries a hand-built availability fixture with a
 * deliberately determinable answer, so the scheduling algorithm can be checked
 * against a result a human worked out first:
 *
 *   Thu 8 Oct 18:00–24:00  everyone required is free; Marcus never answered
 *   Sun 11 Oct 18:00–24:00 runner-up: Anna only "if need be", Józef leaves at 20
 *   Mon 5 Oct              rejected: a Keeper and a required player said no
 *   Thu 15 Oct             rejected: everybody is free, but only for four hours
 *
 * Marcus never answers, which is what exercises the "has not responded" state -
 * distinct from answering no, and the distinction the whole quorum idea rests on.
 *
 * No schedule runs or proposals are seeded. The seed is a database fixture and
 * must not reach into a domain module to produce them, and inventing the output
 * by hand would pin a contract the algorithm owns. The availability is real, so
 * one press of "Find dates" produces genuine proposals.
 *
 * Quorums count players, not participants: both Keepers of the Masks campaign
 * are outside the count, which is why a five-person session asks for three.
 */
export const SEED_SESSIONS: readonly SeedSession[] = [
  {
    key: 'masks-draft',
    campaignKey: 'masks',
    title: 'Chapter Three: London',
    description: 'Not announced yet. Still deciding whether to split the party.',
    status: 'DRAFT',
    windowStart: '2026-11-02',
    windowEnd: '2026-11-15',
    participants: [
      { userKey: 'eleanor', priority: 'REQUIRED' },
      { userKey: 'harriet', priority: 'REQUIRED' },
      { userKey: 'anna', priority: 'PREFERRED' },
      { userKey: 'tomas', priority: 'PREFERRED' },
      { userKey: 'jozef', priority: 'OPTIONAL' },
    ],
  },
  {
    key: 'masks-collecting',
    campaignKey: 'masks',
    title: 'Chapter Two: New York',
    description: 'Picking up at the Ju-Ju House. Bring the ledger from last time.',
    status: 'COLLECTING',
    windowStart: '2026-10-05',
    windowEnd: '2026-11-03',
    deadlineInDays: 9,
    // Two of the four players are enough for this group, which is what lets the
    // compromised Sunday appear below the clean Thursday instead of vanishing.
    quorum: 2,
    participants: [
      { userKey: 'eleanor', priority: 'REQUIRED', responded: true },
      { userKey: 'harriet', priority: 'REQUIRED', responded: true },
      { userKey: 'anna', priority: 'REQUIRED', responded: true },
      { userKey: 'tomas', priority: 'PREFERRED', responded: true },
      { userKey: 'jozef', priority: 'PREFERRED', responded: true },
      { userKey: 'marcus', priority: 'OPTIONAL', responded: false },
    ],
    availability: [
      // Monday the 5th is out: Harriet runs the game and cannot make it, and
      // Anna, who is required, cannot either.
      { userKey: 'eleanor', date: '2026-10-05', fromHour: 18, toHour: 24, state: 'YES' },
      { userKey: 'harriet', date: '2026-10-05', fromHour: 16, toHour: 24, state: 'NO' },
      { userKey: 'anna', date: '2026-10-05', fromHour: 16, toHour: 24, state: 'NO' },
      { userKey: 'tomas', date: '2026-10-05', fromHour: 18, toHour: 24, state: 'YES' },

      // Thursday the 8th is the answer.
      { userKey: 'eleanor', date: '2026-10-08', fromHour: 18, toHour: 24, state: 'YES' },
      { userKey: 'harriet', date: '2026-10-08', fromHour: 17, toHour: 24, state: 'YES' },
      { userKey: 'anna', date: '2026-10-08', fromHour: 18, toHour: 24, state: 'YES' },
      { userKey: 'tomas', date: '2026-10-08', fromHour: 16, toHour: 24, state: 'YES' },
      { userKey: 'jozef', date: '2026-10-08', fromHour: 18, toHour: 24, state: 'YES' },

      // Sunday the 11th comes second: Anna is grudging, and Józef leaving at
      // eight takes him out of a six-hour evening entirely.
      { userKey: 'eleanor', date: '2026-10-11', fromHour: 16, toHour: 24, state: 'YES' },
      { userKey: 'harriet', date: '2026-10-11', fromHour: 17, toHour: 24, state: 'YES' },
      { userKey: 'anna', date: '2026-10-11', fromHour: 17, toHour: 24, state: 'IF_NEED_BE' },
      { userKey: 'tomas', date: '2026-10-11', fromHour: 18, toHour: 24, state: 'YES' },
      { userKey: 'jozef', date: '2026-10-11', fromHour: 16, toHour: 20, state: 'YES' },

      // Thursday the 15th: everyone free, but not early enough for six hours.
      { userKey: 'eleanor', date: '2026-10-15', fromHour: 20, toHour: 24, state: 'YES' },
      { userKey: 'harriet', date: '2026-10-15', fromHour: 20, toHour: 24, state: 'YES' },
      { userKey: 'anna', date: '2026-10-15', fromHour: 20, toHour: 24, state: 'YES' },
    ],
  },
  {
    key: 'masks-proposed',
    campaignKey: 'masks',
    title: 'Interlude: The Carlyle Estate',
    description: 'Deadline has passed. Waiting on the Keeper to pick a date.',
    status: 'PROPOSED',
    windowStart: '2026-09-21',
    windowEnd: '2026-09-27',
    deadlineInDays: -2,
    quorum: 3,
    participants: [
      { userKey: 'eleanor', priority: 'REQUIRED', responded: true },
      { userKey: 'anna', priority: 'PREFERRED', responded: true },
      { userKey: 'tomas', priority: 'PREFERRED', responded: true },
      { userKey: 'jozef', priority: 'OPTIONAL', responded: false },
    ],
    availability: [
      { userKey: 'eleanor', date: '2026-09-24', fromHour: 18, toHour: 24, state: 'YES' },
      { userKey: 'anna', date: '2026-09-24', fromHour: 18, toHour: 24, state: 'YES' },
      { userKey: 'tomas', date: '2026-09-24', fromHour: 17, toHour: 24, state: 'IF_NEED_BE' },
    ],
  },
  {
    key: 'masks-scheduled',
    campaignKey: 'masks',
    title: 'Chapter One, part four: the last of Peru',
    description: 'Confirmed. We start on time; bring dice.',
    status: 'SCHEDULED',
    windowStart: '2026-09-14',
    windowEnd: '2026-09-27',
    quorum: 3,
    participants: [
      { userKey: 'eleanor', priority: 'REQUIRED', responded: true },
      { userKey: 'harriet', priority: 'PREFERRED', responded: true },
      { userKey: 'anna', priority: 'REQUIRED', responded: true },
      { userKey: 'tomas', priority: 'PREFERRED', responded: true },
      { userKey: 'jozef', priority: 'OPTIONAL', responded: true },
    ],
    confirmed: { date: '2026-09-24', fromHour: 18, toHour: 24 },
  },
  {
    key: 'masks-completed',
    campaignKey: 'masks',
    title: 'Chapter One, part three',
    description: 'Ran long. Two investigators went into the tomb; one came back.',
    status: 'COMPLETED',
    windowStart: '2026-08-24',
    windowEnd: '2026-09-06',
    quorum: 3,
    participants: [
      { userKey: 'eleanor', priority: 'REQUIRED', responded: true, attendance: 'ATTENDED' },
      { userKey: 'harriet', priority: 'PREFERRED', responded: true, attendance: 'ATTENDED' },
      { userKey: 'anna', priority: 'REQUIRED', responded: true, attendance: 'ATTENDED' },
      { userKey: 'tomas', priority: 'PREFERRED', responded: true, attendance: 'ABSENT' },
      { userKey: 'jozef', priority: 'OPTIONAL', responded: true, attendance: 'ATTENDED' },
    ],
    confirmed: { date: '2026-09-03', fromHour: 18, toHour: 24 },
  },
  {
    key: 'masks-cancelled',
    campaignKey: 'masks',
    title: 'Chapter One, part three (first attempt)',
    description: 'Called off the morning of.',
    status: 'CANCELLED',
    windowStart: '2026-08-17',
    windowEnd: '2026-08-30',
    quorum: 2,
    cancelledReason: 'Two of the four required players fell ill the same week.',
    participants: [
      { userKey: 'eleanor', priority: 'REQUIRED', responded: true },
      { userKey: 'anna', priority: 'REQUIRED', responded: true },
      { userKey: 'tomas', priority: 'PREFERRED', responded: true },
    ],
  },
  {
    key: 'haunting-collecting',
    campaignKey: 'haunting',
    title: 'The Corbitt House',
    description: 'One evening, in theory.',
    status: 'COLLECTING',
    windowStart: '2026-10-19',
    windowEnd: '2026-11-01',
    deadlineInDays: 20,
    quorum: 3,
    participants: [
      { userKey: 'marcus', priority: 'REQUIRED', responded: true },
      { userKey: 'anna', priority: 'PREFERRED', responded: false },
      { userKey: 'jozef', priority: 'PREFERRED', responded: false },
      { userKey: 'eleanor', priority: 'OPTIONAL', responded: false },
    ],
    availability: [
      { userKey: 'marcus', date: '2026-10-22', fromHour: 18, toHour: 24, state: 'YES' },
      { userKey: 'marcus', date: '2026-10-24', fromHour: 16, toHour: 24, state: 'YES' },
      // Spans the night the clocks go back, so the grid has a 25-hour day in it.
      { userKey: 'marcus', date: '2026-10-25', fromHour: 16, toHour: 24, state: 'IF_NEED_BE' },
    ],
  },
] as const
