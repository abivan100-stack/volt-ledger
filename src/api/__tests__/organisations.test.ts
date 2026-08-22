import { describe, it, expect, vi } from 'vitest'
import {
  archiveOrganisation,
  createOrganisation,
  getOrganisation,
  listArchivedOrganisations,
  listOrganisations,
  restoreOrganisation,
  type ArchivedOrganisation,
  type Organisation,
} from '../organisations'
import type { ApiClient } from '../client'

const ORGANISATION: Organisation = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Nolambur Microgrid',
  slug: 'nolambur-microgrid',
  role: 'owner',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const ARCHIVED: ArchivedOrganisation = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Nolambur Microgrid',
  slug: 'nolambur-microgrid',
  archivedAt: '2026-08-01T00:00:00.000Z',
  restorableUntil: '2026-08-31T00:00:00.000Z',
}

function stubClient(result: unknown) {
  const request = vi.fn(async () => result)
  return { client: { request } as unknown as ApiClient, request }
}

describe('listOrganisations', () => {
  it('unwraps the organisations envelope', async () => {
    const { client, request } = stubClient({ organisations: [ORGANISATION] })
    const organisations = await listOrganisations({ client })

    expect(request).toHaveBeenCalledWith('/api/v1/organisations', { signal: undefined })
    expect(organisations).toEqual([ORGANISATION])
  })

  it('returns an empty list for a user with no memberships', async () => {
    const { client } = stubClient({ organisations: [] })
    await expect(listOrganisations({ client })).resolves.toEqual([])
  })

  it('forwards an abort signal', async () => {
    const { client, request } = stubClient({ organisations: [] })
    const controller = new AbortController()
    await listOrganisations({ client, signal: controller.signal })
    expect(request).toHaveBeenCalledWith('/api/v1/organisations', { signal: controller.signal })
  })
})

describe('createOrganisation', () => {
  it('posts the name and slug and returns the created organisation', async () => {
    const { client, request } = stubClient({ organisation: ORGANISATION })
    const created = await createOrganisation(
      { name: 'Nolambur Microgrid', slug: 'nolambur-microgrid' },
      { client },
    )

    expect(request).toHaveBeenCalledWith('/api/v1/organisations', {
      method: 'POST',
      body: { name: 'Nolambur Microgrid', slug: 'nolambur-microgrid' },
      signal: undefined,
    })
    expect(created).toEqual(ORGANISATION)
  })
})

describe('getOrganisation', () => {
  it('reads one organisation by id', async () => {
    const { client, request } = stubClient({ organisation: ORGANISATION })
    const organisation = await getOrganisation(ORGANISATION.id, { client })

    expect(request).toHaveBeenCalledWith(`/api/v1/organisations/${ORGANISATION.id}`, { signal: undefined })
    expect(organisation).toEqual(ORGANISATION)
  })
})

describe('archiveOrganisation', () => {
  it('sends a DELETE and resolves with nothing', async () => {
    const { client, request } = stubClient(undefined)
    await expect(archiveOrganisation(ORGANISATION.id, { client })).resolves.toBeUndefined()
    expect(request).toHaveBeenCalledWith(`/api/v1/organisations/${ORGANISATION.id}`, {
      method: 'DELETE',
      signal: undefined,
    })
  })
})

describe('listArchivedOrganisations', () => {
  it('reads the archives from their own path, not the organisation list', async () => {
    const { client, request } = stubClient({ organisations: [ARCHIVED] })
    const archived = await listArchivedOrganisations({ client })

    expect(request).toHaveBeenCalledWith('/api/v1/organisations/archived', { signal: undefined })
    expect(archived).toEqual([ARCHIVED])
  })

  it('returns an empty list when there is nothing to undo', async () => {
    const { client } = stubClient({ organisations: [] })
    await expect(listArchivedOrganisations({ client })).resolves.toEqual([])
  })

  it('forwards an abort signal', async () => {
    const { client, request } = stubClient({ organisations: [] })
    const controller = new AbortController()
    await listArchivedOrganisations({ client, signal: controller.signal })
    expect(request).toHaveBeenCalledWith('/api/v1/organisations/archived', {
      signal: controller.signal,
    })
  })
})

describe('restoreOrganisation', () => {
  it('posts to the restore path and returns the organisation', async () => {
    const { client, request } = stubClient({ organisation: ORGANISATION })
    const restored = await restoreOrganisation(ORGANISATION.id, { client })

    expect(request).toHaveBeenCalledWith(`/api/v1/organisations/${ORGANISATION.id}/restore`, {
      method: 'POST',
      signal: undefined,
    })
    // Comes back as a full organisation, role and all, so it can go straight
    // into the working list.
    expect(restored).toEqual(ORGANISATION)
  })
})
