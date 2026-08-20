/**
 * Organisation slug rules, mirroring the API's `createOrganisationSchema`:
 * lower-case alphanumeric words joined by single hyphens, 3–64 characters.
 *
 * Deriving the slug in the client is a convenience, not a guarantee — the server
 * validates it again and owns uniqueness.
 */

export const MIN_SLUG_LENGTH = 3
export const MAX_SLUG_LENGTH = 64

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Unicode combining marks, left behind by the NFD decomposition below. */
const COMBINING_MARKS = /[̀-ͯ]/g

/** Suggests a slug for a human-entered name. Returns '' when nothing usable remains. */
export function toSlug(name: string): string {
  const ascii = name
    // Decompose accented characters so the base letter survives instead of being
    // stripped along with its mark.
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()

  return ascii
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '')
}

/** Whether the server's slug pattern and length bounds would accept this value. */
export function isValidSlug(slug: string): boolean {
  if (slug.length < MIN_SLUG_LENGTH || slug.length > MAX_SLUG_LENGTH) return false
  return SLUG_PATTERN.test(slug)
}
