import type { AuthService, AuthenticatedSession } from '../auth/auth.js'
import type { MembershipDocument, MembershipRole } from '../db/models.js'

export interface MembershipLookup {
  find(organisationId: string, userId: string): Promise<MembershipDocument | null>
}

export interface AuthorizationFailure {
  ok: false
  statusCode: 401 | 403
  error: string
  code: 'UNAUTHENTICATED' | 'ORGANISATION_ACCESS_DENIED' | 'ORGANISATION_ROLE_FORBIDDEN'
}

export interface AuthenticatedAccess {
  ok: true
  session: AuthenticatedSession
}

export interface OrganisationAccess extends AuthenticatedAccess {
  membership: MembershipDocument
}

export type AuthenticationResult = AuthenticatedAccess | AuthorizationFailure
export type OrganisationAuthorizationResult = OrganisationAccess | AuthorizationFailure

export async function getAuthenticatedSession(
  headers: Headers,
  auth: AuthService,
): Promise<AuthenticationResult> {
  const session = await auth.getSession(headers)
  if (!session) {
    return {
      ok: false,
      statusCode: 401,
      error: 'Authentication required',
      code: 'UNAUTHENTICATED',
    }
  }

  return { ok: true, session }
}

export async function getOrganisationAccess(
  headers: Headers,
  auth: AuthService,
  memberships: MembershipLookup,
  organisationId: string,
  allowedRoles: readonly MembershipRole[],
): Promise<OrganisationAuthorizationResult> {
  const authentication = await getAuthenticatedSession(headers, auth)
  if (!authentication.ok) return authentication

  const membership = await memberships.find(organisationId, authentication.session.user.id)
  if (!membership) {
    return {
      ok: false,
      statusCode: 403,
      error: 'Organisation access denied',
      code: 'ORGANISATION_ACCESS_DENIED',
    }
  }

  if (!allowedRoles.includes(membership.role)) {
    return {
      ok: false,
      statusCode: 403,
      error: 'Your role cannot perform this action',
      code: 'ORGANISATION_ROLE_FORBIDDEN',
    }
  }

  return { ok: true, session: authentication.session, membership }
}
