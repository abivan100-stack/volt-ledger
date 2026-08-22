import type { MembershipRole } from '../db/models.js'

/**
 * Which active organisation roles may change another active membership.
 *
 * This is deliberately shared by the HTTP preflight and Mongo transaction: a
 * role read before a transaction is only advisory once another request can
 * change it.
 */
export function isRoleManagementAllowed(
  actorRole: MembershipRole,
  targetRole: MembershipRole,
  nextRole?: MembershipRole,
): boolean {
  if (targetRole === 'owner' || nextRole === 'owner') return false
  if (actorRole === 'owner') return true
  if (actorRole === 'admin') {
    return (targetRole === 'operator' || targetRole === 'viewer') && nextRole !== 'admin'
  }
  return false
}
