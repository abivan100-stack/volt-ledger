/** Fails loudly rather than sending a request without an organisation scope. */
export function requireOrganisationId(organisationId: string | null): string {
  if (!organisationId) throw new Error('No organisation is selected')
  return organisationId
}
