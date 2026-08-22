/**
 * How a recovery deadline reads to the person who has to act on it.
 *
 * Archiving an organisation is reversible for a window the server sets, and the
 * API publishes the deadline as a fixed instant rather than a countdown, so that
 * it does not creep forward every time the page reloads. What is left here is
 * turning that instant into something a reader can act on.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Whole days left before a deadline, floored and never negative.
 *
 * Floored deliberately. With nineteen hours to go this says zero days, which
 * understates the time left; rounding up would tell somebody who has until this
 * evening that they have a day. When the cost of being wrong is a permanently
 * deleted organisation, the safe direction is to understate.
 */
export function wholeDaysUntil(deadline: Date, now: Date): number {
  return Math.max(0, Math.floor((deadline.getTime() - now.getTime()) / MS_PER_DAY))
}

/** Whether there is still time to act. */
export function isWithinRecoveryWindow(deadline: Date, now: Date): boolean {
  return deadline.getTime() > now.getTime()
}

/**
 * A short phrase for how long is left.
 *
 * Says "less than a day" rather than "0 days", because zero reads as "gone" to
 * someone who still has hours to save their organisation.
 */
export function recoveryWindowLabel(deadline: Date, now: Date): string {
  if (!isWithinRecoveryWindow(deadline, now)) return 'Recovery window closed'

  const days = wholeDaysUntil(deadline, now)
  if (days === 0) return 'Less than a day left'
  if (days === 1) return '1 day left'
  return `${days} days left`
}
