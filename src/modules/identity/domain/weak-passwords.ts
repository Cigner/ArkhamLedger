/**
 * Rejection list for the most commonly breached passwords.
 *
 * Length alone does not make a password good: "passwordpassword" is sixteen
 * characters and appears in every credential dump. This list is deliberately
 * short — it catches the passwords an attacker tries first, which is where the
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

/**
 * Reports whether a password is an obvious guess.
 *
 * Strips case, trailing digits and common leet substitutions before matching, so
 * padding a known-bad password does not slip past.
 */
export function isWeakPassword(password: string): boolean {
  const normalized = password
    .toLowerCase()
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/\$|5/g, 's')
    .replace(/4/g, 'a')
    .replace(/7/g, 't')

  const stem = normalized.replace(/[^a-z]+$/, '')

  if (NUMERIC_SEQUENCES.some((sequence) => password.includes(sequence))) return true
  if (WEAK_PASSWORD_STEMS.some((weak) => stem === weak || stem === weak.repeat(2))) return true

  // A password made of one repeated character, however long.
  if (/^(.)\1+$/.test(password)) return true

  return false
}
