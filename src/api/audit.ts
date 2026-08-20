import { send, type ResourceOptions } from './resource'

/**
 * Organisation audit stream.
 *
 * A bounded, owner/admin-readable history ordered newest first. Paging uses an
 * opaque cursor rather than an offset: the cursor encodes a position (creation
 * time and event id) and no authorization of its own, so it stays stable while
 * new events are appended ahead of it. `nextCursor` is present only when another
 * page exists.
 *
 * Audit events are retained for provenance, including after an organisation is
 * archived.
 */

export interface AuditEvent {
  id: string
  actorUserId: string
  /** Dotted action name, e.g. `organisation.created`. */
  action: string
  entityType: string
  entityId: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface AuditEventPage {
  events: AuditEvent[]
  /** `null` when this is the last page. */
  nextCursor: string | null
}

export interface ListAuditEventsOptions extends ResourceOptions {
  /** 1–500; the API defaults to 100. */
  limit?: number
  /** Exact action match. */
  action?: string
  /** Opaque `nextCursor` from a previous page. */
  cursor?: string
}

export async function listAuditEvents(
  organisationId: string,
  options: ListAuditEventsOptions = {},
): Promise<AuditEventPage> {
  const { limit, action, cursor, ...resourceOptions } = options
  return send<AuditEventPage>(
    resourceOptions,
    `/api/v1/organisations/${organisationId}/audit-events`,
    { query: { limit, action, cursor } },
  )
}
