/**
 * Turning participant ids into something a Keeper can read.
 *
 * A breakdown carries ids because the algorithm has no business holding names.
 * Resolving them is the presentation layer's job, and only on the Keeper's
 * screen, which is the one authorized to see who said what.
 */
export function namesOf(
  userIds: readonly string[],
  names: Readonly<Record<string, string>>,
): string {
  return userIds.map((userId) => names[userId] ?? 'Someone').join(', ')
}
