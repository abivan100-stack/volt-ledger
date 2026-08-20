import { send, type ResourceOptions } from './resource'
import type { AssignableRole, MembershipRole } from '../lib/permissions'

/**
 * Membership resource: a user's role-bound relationship to one organisation.
 *
 * The owner membership is not editable here. It moves only through
 * `transferOwnership`, which atomically demotes the acting owner to admin.
 */

export interface Membership {
  id: string
  userId: string
  /** Null when no address was recorded for the membership. */
  email: string | null
  role: MembershipRole
  createdAt: string
  updatedAt: string
}

export interface OwnershipTransfer {
  previousOwner: Membership
  newOwner: Membership
}

interface MembershipListResponse {
  members: Membership[]
}

interface MembershipResponse {
  member: Membership
}

interface OwnershipTransferResponse {
  ownership: OwnershipTransfer
}

/** Every active member of the organisation. Readable by any member. */
export async function listMemberships(
  organisationId: string,
  options: ResourceOptions = {},
): Promise<Membership[]> {
  const response = await send<MembershipListResponse>(
    options,
    `/api/v1/organisations/${organisationId}/memberships`,
  )
  return response.members
}

/** Owner/admin only, and never to or from `owner`. */
export async function updateMembershipRole(
  organisationId: string,
  userId: string,
  role: AssignableRole,
  options: ResourceOptions = {},
): Promise<Membership> {
  const response = await send<MembershipResponse>(
    options,
    `/api/v1/organisations/${organisationId}/memberships/${encodeURIComponent(userId)}`,
    { method: 'PATCH', body: { role } },
  )
  return response.member
}

/** Owner/admin only. Removing the owner is refused by the server. */
export async function removeMembership(
  organisationId: string,
  userId: string,
  options: ResourceOptions = {},
): Promise<void> {
  await send<void>(
    options,
    `/api/v1/organisations/${organisationId}/memberships/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  )
}

/**
 * Hands ownership to an existing active member. Owner-only, and the acting owner
 * is demoted to admin in the same transaction — so the caller loses owner rights
 * as part of the success path.
 */
export async function transferOwnership(
  organisationId: string,
  newOwnerUserId: string,
  options: ResourceOptions = {},
): Promise<OwnershipTransfer> {
  const response = await send<OwnershipTransferResponse>(
    options,
    `/api/v1/organisations/${organisationId}/ownership/transfer`,
    { method: 'POST', body: { newOwnerUserId } },
  )
  return response.ownership
}
