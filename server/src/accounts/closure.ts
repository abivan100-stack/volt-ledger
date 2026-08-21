import { createHash } from 'node:crypto'
import type { MembershipDocument } from '../db/models.js'

/**
 * The rules for closing an account, kept free of I/O.
 *
 * Closure anonymises rather than erases. Ledger events carry `actorUserId` and
 * are hash-linked, so rewriting one to drop a reference would break the chain
 * that makes the ledger tamper-evident, and the record of who accepted a
 * settlement is the evidence the ledger exists to hold. What survives closure is
 * an opaque identifier attached to energy and money; what does not survive is any
 * way to connect it to a person. See ADR 0011.
 */

/** Refusal code when the account still owns an organisation. */
export const ACCOUNT_OWNS_ORGANISATIONS = 'ACCOUNT_OWNS_ORGANISATIONS'

/** A closed account keeps no display name. */
export const ANONYMISED_NAME = ''

/**
 * Organisations this account still owns.
 *
 * Ownership blocks closure because an owner membership cannot be removed — the
 * repository refuses it outright — and an organisation with no owner is one
 * nobody can administer while it still holds settlement records. The holder must
 * transfer ownership or archive the organisation first.
 *
 * Soft-deleted memberships do not count: archiving an organisation soft-deletes
 * them, so an archived organisation never blocks its former owner.
 */
export function ownedOrganisationIds(memberships: readonly MembershipDocument[]): string[] {
  return memberships
    .filter((membership) => membership.deletedAt === null && membership.role === 'owner')
    .map((membership) => membership.organisationId)
}

export function canCloseAccount(memberships: readonly MembershipDocument[]): boolean {
  return ownedOrganisationIds(memberships).length === 0
}

/**
 * The placeholder address a closed account is left with.
 *
 * `.invalid` is reserved precisely so it can never resolve, so the address can
 * neither receive mail nor be signed in with. It is derived from the account id
 * rather than randomly, so closing twice is idempotent and two closed accounts
 * can never collide on a unique email index.
 */
export function anonymisedEmail(userId: string): string {
  const digest = createHash('sha256').update(userId).digest('hex').slice(0, 32)
  return `deleted-${digest}@invalid`
}

/** Whether an address is one this module already produced. */
export function isAnonymisedEmail(email: string): boolean {
  return /^deleted-[0-9a-f]{32}@invalid$/.test(email)
}
