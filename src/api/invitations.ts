import { send, type ResourceOptions } from './resource'
import type { AssignableRole, MembershipRole } from '../lib/permissions'

/**
 * Organisation invitation resource.
 *
 * An invitation is not a membership: it names an organisation, a target role,
 * and an email address, and becomes a membership only when the invited person
 * accepts it while signed in with that verified address. It can never grant the
 * owner role — ownership moves through a transfer instead.
 */

export const INVITATION_STATUSES = ['pending', 'accepted', 'revoked'] as const

export type InvitationStatus = (typeof INVITATION_STATUSES)[number]

export interface Invitation {
  id: string
  email: string
  role: AssignableRole
  status: InvitationStatus
  /** ISO-8601. Past this point the worker revokes the invitation. */
  expiresAt: string
  /** Present on the list route only. */
  createdAt?: string
}

export interface CreateInvitationInput {
  email: string
  role: AssignableRole
}

export interface AcceptedInvitation {
  organisationId: string
  membershipId: string
  role: MembershipRole
}

interface InvitationListResponse {
  invitations: Invitation[]
}

interface InvitationResponse {
  invitation: Invitation
}

/** Every invitation ever issued for the organisation, whatever its status. Owner/admin only. */
export async function listInvitations(
  organisationId: string,
  options: ResourceOptions = {},
): Promise<Invitation[]> {
  const response = await send<InvitationListResponse>(
    options,
    `/api/v1/organisations/${organisationId}/invitations`,
  )
  return response.invitations
}

/**
 * Issues an invitation and sends its email. Delivery is part of the operation:
 * if the email cannot be sent the server revokes the invitation and answers
 * `503`, so a resolved call means the recipient has been written to.
 */
export async function createInvitation(
  organisationId: string,
  input: CreateInvitationInput,
  options: ResourceOptions = {},
): Promise<Invitation> {
  const response = await send<InvitationResponse>(
    options,
    `/api/v1/organisations/${organisationId}/invitations`,
    { method: 'POST', body: input },
  )
  return response.invitation
}

/** Revokes a pending invitation. The record is retained for history. */
export async function revokeInvitation(
  organisationId: string,
  invitationId: string,
  options: ResourceOptions = {},
): Promise<void> {
  await send<void>(
    options,
    `/api/v1/organisations/${organisationId}/invitations/${encodeURIComponent(invitationId)}`,
    { method: 'DELETE' },
  )
}

/**
 * Accepts an invitation with the token from its email. Requires a signed-in user
 * whose verified email matches the invited address.
 */
export async function acceptInvitation(
  token: string,
  options: ResourceOptions = {},
): Promise<AcceptedInvitation> {
  return send<AcceptedInvitation>(options, '/api/v1/invitations/accept', {
    method: 'POST',
    body: { token },
  })
}
