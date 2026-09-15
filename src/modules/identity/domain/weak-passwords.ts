/**
 * Rejection list for the most commonly breached passwords.
 *
 * Length alone does not make a password good: "passwordpassword" is sixteen
 * characters and appears in every credential dump. This list is deliberately
 * short - it catches the passwords an attacker tries first, which is where the
 * value is, rather than attempting to be a full dictionary.
 *
 * Comparison is case-insensitive and ignores trailing digits, because "Summer2024"
 * and "summer24" are the same guess.
 */
const WEAK_PASSWORD_STEMS = [
  'password',
  'passwort',
  'haslo',
  'qwerty',
  'qwertyuiop',
  'azerty',
  'asdfgh',
  'zaqwsx',
  'letmein',
  'welcome',
  'admin',
  'administrator',
  'root',
  'login',
  'master',
  'secret',
  'changeme',
  'default',
  'guest',
  'testtest',
  'iloveyou',
  'princess',
  'sunshine',
  'monkey',
  'dragon',
  'football',
  'baseball',
  'superman',
  'batman',
  'trustno',
  'starwars',
  'pokemon',
  'minecraft',
  'cthulhu',
  'nyarlathotep',
  'miskatonic',
  'arkham',
  'abcdef',
  'abcabc',
  'aaaaaa',
  'zxcvbn',
  'qazwsx',
  'lovely',
  'freedom',
  'whatever',
  'shadow',
  'michael',
  'jordan',
  'jessica',
  'charlie',
  'hunter',
  'matrix',
  'summer',
  'winter',
  'spring',
  'autumn',
  'january',
  'december',
] as const

const NUMERIC_SEQUENCES = ['123456', '1234567', '12345678', '123456789', '1234567890', '000000']

/** Classic character substitutions, so `p@ssw0rd` collapses onto `password`. */
const LEET: ReadonlyArray<readonly [RegExp, string]> = [
  [/[@4]/g, 'a'],
  [/0/g, 'o'],
  [/[1!|]/g, 'i'],
  [/3/g, 'e'],
  [/[$5]/g, 's'],
  [/7/g, 't'],
]

/**
 * Reduces a password to the word an attacker would actually guess.
 *
 * Order matters and is the part that is easy to get wrong: trailing digits are
 * stripped BEFORE substitutions are applied. Doing it the other way round turns
 * the year in "letmein2026" into letters, after which it can no longer be
 * stripped and the password looks novel.
 */
function stems(password: string): string[] {
  const lower = password.toLowerCase()
  const trimmed = lower.replace(/[^a-z@!|$]+$/, '')

  const substituted = LEET.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    trimmed,
  )

  // Substitution can reveal new trailing junk, e.g. "p@ssword!" -> "password i".
  const substitutedTrimmed = substituted.replace(/[^a-z]+$/, '')

  return [...new Set([trimmed, substituted, substitutedTrimmed])]
}

/**
 * Reports whether a password is an obvious guess.
 *
 * Matches against the reduced stem rather than the literal input, so padding a
 * known-bad password with a year or swapping letters for digits does not slip past.
 */
export function isWeakPassword(password: string): boolean {
  if (NUMERIC_SEQUENCES.some((sequence) => password.includes(sequence))) return true

  // One character repeated, however long.
  if (/^(.)\1+$/.test(password)) return true

  return stems(password).some((stem) =>
    WEAK_PASSWORD_STEMS.some((weak) => stem === weak || stem === weak.repeat(2)),
  )
}
