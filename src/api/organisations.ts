import { send, type ResourceOptions } from './resource'
import type { MembershipRole } from '../lib/permissions'

/**
 * Organisation resource: the group that owns a synthetic neighbourhood and its
 * Volt configuration. Every response carries the caller's own role, so the UI
 * never has to guess what it may offer.
 */

export interface Organisation {
  id: string
  name: string
  slug: string
  /** The requesting user's role in this organisation. */
  role: MembershipRole
  createdAt: string
  updatedAt: string
}

export interface CreateOrganisationInput {
  name: string
  /** Lower-case, hyphen-separated; the server rejects anything else. */
  slug: string
}

/**
 * An organisation the caller archived and can still bring back.
 *
 * Carries no role: every entry is one the caller owned at the archive, so a role
 * would restate the question. `restorableUntil` is fixed at the archive rather
 * than counted from now, so the deadline does not creep forward on reload.
 */
export interface ArchivedOrganisation {
  id: string
  name: string
  slug: string
  archivedAt: string
  restorableUntil: string
}

interface OrganisationListResponse {
  organisations: Organisation[]
}

interface ArchivedOrganisationListResponse {
  organisations: ArchivedOrganisation[]
}

interface OrganisationResponse {
  organisation: Organisation
}

/** Every organisation the signed-in user is an active member of. */
export async function listOrganisations(options: ResourceOptions = {}): Promise<Organisation[]> {
  const response = await send<OrganisationListResponse>(options, '/api/v1/organisations')
  return response.organisations
}

/** Creates an organisation with the caller as its owner. */
export async function createOrganisation(
  input: CreateOrganisationInput,
  options: ResourceOptions = {},
): Promise<Organisation> {
  const response = await send<OrganisationResponse>(options, '/api/v1/organisations', {
    method: 'POST',
    body: input,
  })
  return response.organisation
}

export async function getOrganisation(
  organisationId: string,
  options: ResourceOptions = {},
): Promise<Organisation> {
  const response = await send<OrganisationResponse>(
    options,
    `/api/v1/organisations/${organisationId}`,
  )
  return response.organisation
}

/**
 * Archives an organisation. Owner-only, and soft: active access and working
 * simulation data are removed in one transaction while ledger and audit history
 * are retained for provenance. Undoable through `restoreOrganisation` until the
 * deadline `listArchivedOrganisations` reports, and not afterwards.
 */
export async function archiveOrganisation(
  organisationId: string,
  options: ResourceOptions = {},
): Promise<void> {
  await send<void>(options, `/api/v1/organisations/${organisationId}`, { method: 'DELETE' })
}

/**
 * Archives the signed-in user still owns the undo for.
 *
 * An archived organisation has no active memberships, so it never appears in
 * `listOrganisations` — this is the only way to find one again.
 */
export async function listArchivedOrganisations(
  options: ResourceOptions = {},
): Promise<ArchivedOrganisation[]> {
  const response = await send<ArchivedOrganisationListResponse>(
    options,
    '/api/v1/organisations/archived',
  )
  return response.organisations
}

/**
 * Undoes an archive, returning the organisation to the caller's list.
 *
 * Restores exactly what the archive took: a membership removed beforehand stays
 * removed, and revoked invitations are not revived.
 */
export async function restoreOrganisation(
  organisationId: string,
  options: ResourceOptions = {},
): Promise<Organisation> {
  const response = await send<OrganisationResponse>(
    options,
    `/api/v1/organisations/${organisationId}/restore`,
    { method: 'POST' },
  )
  return response.organisation
}
