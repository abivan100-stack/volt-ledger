/**
 * Client-side mirror of the API's role rules.
 *
 * These predicates decide what the UI *offers*, never what the server allows —
 * every rule here is enforced again in `getOrganisationAccess` on the API, which
 * remains the only authority. Keeping them pure and co-located makes the two
 * sets easy to compare when either side changes.
 */

export const MEMBERSHIP_ROLES = ['owner', 'admin', 'operator', 'viewer'] as const

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number]

export function isMembershipRole(value: unknown): value is MembershipRole {
  return typeof value === 'string' && (MEMBERSHIP_ROLES as readonly string[]).includes(value)
}

/**
 * Roles that can be granted through an invitation or a role change. Owner is
 * absent by design: it moves only through an explicit ownership transfer.
 */
export const ASSIGNABLE_ROLES = ['admin', 'operator', 'viewer'] as const

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

/**
 * Whether `actorRole` may change or remove a membership currently held at
 * `targetRole`, optionally moving it to `nextRole`.
 *
 * Mirrors `isRoleManagementAllowed` on the API. Two rules do the work: the owner
 * membership is untouchable here (it moves only through an ownership transfer),
 * and an admin may not reach another admin or mint one.
 */
export function canManageMembership(
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

/** Invite, remove, and change the role of other members. */
export function canManageMembers(role: MembershipRole): boolean {
  return role === 'owner' || role === 'admin'
}

/** Queue simulation runs against the organisation's daily quota. */
export function canRunSimulations(role: MembershipRole): boolean {
  return role !== 'viewer'
}

/** Accept a completed outcome and append correction deltas to the ledger. */
export function canSettleAndAdjustLedger(role: MembershipRole): boolean {
  return role === 'owner' || role === 'admin'
}

/** Read the organisation's bounded audit stream. */
export function canViewAuditEvents(role: MembershipRole): boolean {
  return role === 'owner' || role === 'admin'
}

/** Hand ownership to another active member; the acting owner is demoted to admin. */
export function canTransferOwnership(role: MembershipRole): boolean {
  return role === 'owner'
}

/** Archive the organisation, soft-deleting active access and working data. */
export function canArchiveOrganisation(role: MembershipRole): boolean {
  return role === 'owner'
}

const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  operator: 'Operator',
  viewer: 'Viewer',
}

export function roleLabel(role: MembershipRole): string {
  return ROLE_LABELS[role]
}
