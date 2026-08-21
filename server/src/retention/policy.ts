/**
 * What Volt keeps, what it lets go, and when.
 *
 * Archiving an organisation soft-deletes it along with its memberships,
 * invitations and working simulation data, all stamped with the same instant in
 * one transaction. For a window afterwards that archive can be undone; once the
 * window closes the working data is hard-deleted and the space reclaimed.
 *
 * Three things are never purged. Ledger events are hash-linked evidence about
 * energy and money, and deleting one would break the chain that makes the ledger
 * tamper-evident (ADR 0003). Audit events are the record of who did what,
 * including the archive itself. And the organisation and membership rows stay as
 * tombstones, because ledger and audit events reference them — purging those
 * would leave retained records pointing at nothing.
 *
 * What goes is only the bulky synthetic output: intervals, summaries, and the
 * runs that produced them. None of it is meter-backed, and every run is
 * replayable from its seed, model version and input digest.
 */

/** Collections the purge empties, in dependency order. */
export const PURGEABLE_COLLECTIONS = [
  'simulationIntervals',
  'simulationSummaries',
  'simulationRuns',
] as const

export type PurgeableCollection = (typeof PURGEABLE_COLLECTIONS)[number]

/** Collections the purge must never touch, whatever the window says. */
export const RETAINED_COLLECTIONS = [
  'ledgerEvents',
  'auditEvents',
  'organisations',
  'memberships',
] as const

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * The instant an archive must predate to be purgeable.
 *
 * Anything archived at or after this is still inside its window.
 */
export function purgeCutoff(now: Date, windowDays: number): Date {
  return new Date(now.getTime() - windowDays * MS_PER_DAY)
}

/**
 * Whether an archived organisation can still be restored.
 *
 * A live organisation is not recoverable because it was never archived; the
 * caller has nothing to undo.
 */
export function isRecoverable(
  deletedAt: Date | null,
  now: Date,
  windowDays: number,
): boolean {
  if (deletedAt === null) return false
  return deletedAt.getTime() > purgeCutoff(now, windowDays).getTime()
}

/** How much of the window is left, floored at zero. */
export function recoverableForMs(
  deletedAt: Date | null,
  now: Date,
  windowDays: number,
): number {
  if (deletedAt === null) return 0
  const expiresAt = deletedAt.getTime() + windowDays * MS_PER_DAY
  return Math.max(0, expiresAt - now.getTime())
}
