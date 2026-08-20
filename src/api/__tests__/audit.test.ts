import { describe, it, expect, vi } from 'vitest'
import { listAuditEvents, type AuditEvent } from '../audit'
import type { ApiClient, ApiRequestOptions } from '../client'

const ORGANISATION_ID = '11111111-1111-4111-8111-111111111111'

const EVENT: AuditEvent = {
  id: 'audit-1',
  actorUserId: 'user-1',
  action: 'organisation.created',
  entityType: 'organisation',
  entityId: ORGANISATION_ID,
  metadata: { slug: 'nolambur' },
  createdAt: '2026-08-01T00:00:00.000Z',
}

function stubClient(result: unknown) {
  const calls: [string, ApiRequestOptions][] = []
  const request = vi.fn(async (path: string, init: ApiRequestOptions = {}) => {
    calls.push([path, init])
    return result
  })
  return { client: { request } as unknown as ApiClient, calls }
}

describe('listAuditEvents', () => {
  it('returns the page and its next cursor', async () => {
    const page = { events: [EVENT], nextCursor: 'cursor-2' }
    const { client, calls } = stubClient(page)

    const received = await listAuditEvents(ORGANISATION_ID, { client })

    expect(calls[0]?.[0]).toBe(`/api/v1/organisations/${ORGANISATION_ID}/audit-events`)
    expect(received).toEqual(page)
  })

  it('omits absent filters from the query rather than sending empties', async () => {
    const { client, calls } = stubClient({ events: [], nextCursor: null })
    await listAuditEvents(ORGANISATION_ID, { client })

    expect(calls[0]?.[1].query).toEqual({ limit: undefined, action: undefined, cursor: undefined })
  })

  it('passes the limit, action filter and cursor through', async () => {
    const { client, calls } = stubClient({ events: [], nextCursor: null })
    await listAuditEvents(ORGANISATION_ID, {
      client,
      limit: 25,
      action: 'membership.role_changed',
      cursor: 'cursor-1',
    })

    expect(calls[0]?.[1].query).toEqual({
      limit: 25,
      action: 'membership.role_changed',
      cursor: 'cursor-1',
    })
  })

  it('reports the last page with a null cursor', async () => {
    const { client } = stubClient({ events: [EVENT], nextCursor: null })
    const page = await listAuditEvents(ORGANISATION_ID, { client })
    expect(page.nextCursor).toBeNull()
  })
})
