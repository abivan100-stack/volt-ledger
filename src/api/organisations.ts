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

interface OrganisationListResponse {
  organisations: Organisation[]
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
 * are retained for provenance. There is no undo.
 */
export async function archiveOrganisation(
  organisationId: string,
  options: ResourceOptions = {},
): Promise<void> {
  await send<void>(options, `/api/v1/organisations/${organisationId}`, { method: 'DELETE' })
}
