import { describe, it, expect, vi } from 'vitest'
import {
  createLedgerAdjustment,
  listLedgerEvents,
  settleSimulationRun,
  type LedgerEvent,
} from '../ledger'
import type { ApiClient } from '../client'

const ORGANISATION_ID = '11111111-1111-4111-8111-111111111111'
const RUN_ID = 'run-1'

const EVENT: LedgerEvent = {
  id: 'event-1',
  sequence: 1,
  eventType: 'settlement',
  outcome: 'p50',
  actorUserId: 'user-1',
  householdId: 'h1',
  settlementDate: '2026-08-01',
  sourceRunId: RUN_ID,
  simulationResultDigest: 'result-digest',
  energyKwh: 4.75,
  estimatedCreditInr: 26.13,
  previousSeal: null,
  canonicalSeal: 'seal-1',
  adjustmentTargetEventId: null,
  adjustmentReason: null,
  idempotencyKey: null,
  createdAt: '2026-08-01T00:00:00.000Z',
}

function stubClient(result: unknown) {
  const request = vi.fn(async () => result)
  return { client: { request } as unknown as ApiClient, request }
}

describe('listLedgerEvents', () => {
  it('returns the events alongside the server integrity check', async () => {
    const page = {
      events: [EVENT],
      integrity: { valid: true, complete: true, checkedEvents: 1, firstSequence: 1, lastSequence: 1 },
    }
    const { client, request } = stubClient(page)

    const received = await listLedgerEvents(ORGANISATION_ID, { client })

    expect(request).toHaveBeenCalledWith(
      `/api/v1/organisations/${ORGANISATION_ID}/ledger`,
      { signal: undefined },
    )
    expect(received).toEqual(page)
  })

  it('passes a limit as a query parameter', async () => {
    const { client, request } = stubClient({ events: [], integrity: {} })
    await listLedgerEvents(ORGANISATION_ID, { client, limit: 50 })

    expect(request).toHaveBeenCalledWith(
      `/api/v1/organisations/${ORGANISATION_ID}/ledger`,
      { query: { limit: 50 }, signal: undefined },
    )
  })
})

describe('settleSimulationRun', () => {
  it('posts the chosen outcome and returns the appended events', async () => {
    const settlement = {
      runId: RUN_ID,
      resultDigest: 'result-digest',
      outcome: 'p50',
      alreadySettled: false,
      events: [EVENT],
    }
    const { client, request } = stubClient({ settlement })

    const received = await settleSimulationRun(ORGANISATION_ID, RUN_ID, 'p50', { client })

    expect(request).toHaveBeenCalledWith(
      `/api/v1/organisations/${ORGANISATION_ID}/simulations/${RUN_ID}/settlement`,
      { method: 'POST', body: { outcome: 'p50' }, signal: undefined },
    )
    expect(received).toEqual(settlement)
  })

  it('reports a repeated acceptance as already settled', async () => {
    const { client } = stubClient({
      settlement: {
        runId: RUN_ID,
        resultDigest: 'result-digest',
        outcome: 'p50',
        alreadySettled: true,
        events: [EVENT],
      },
    })

    const settlement = await settleSimulationRun(ORGANISATION_ID, RUN_ID, 'p50', { client })
    expect(settlement.alreadySettled).toBe(true)
  })
})

describe('createLedgerAdjustment', () => {
  it('posts the signed delta against its target', async () => {
    const adjustment = {
      alreadyApplied: false,
      event: { ...EVENT, id: 'event-2', sequence: 2, eventType: 'adjustment' as const },
    }
    const { client, request } = stubClient({ adjustment })

    const input = {
      targetEventId: 'event-1',
      idempotencyKey: 'key-1',
      energyKwh: -0.5,
      estimatedCreditInr: -2.75,
      reason: 'Meter correction',
    }
    const received = await createLedgerAdjustment(ORGANISATION_ID, input, { client })

    expect(request).toHaveBeenCalledWith(
      `/api/v1/organisations/${ORGANISATION_ID}/ledger/adjustments`,
      { method: 'POST', body: input, signal: undefined },
    )
    expect(received.event.eventType).toBe('adjustment')
  })

  it('reports a replayed idempotency key as already applied', async () => {
    const { client } = stubClient({
      adjustment: { alreadyApplied: true, event: { ...EVENT, eventType: 'adjustment' as const } },
    })

    const result = await createLedgerAdjustment(
      ORGANISATION_ID,
      {
        targetEventId: 'event-1',
        idempotencyKey: 'key-1',
        energyKwh: -0.5,
        estimatedCreditInr: -2.75,
        reason: 'Meter correction',
      },
      { client },
    )
    expect(result.alreadyApplied).toBe(true)
  })
})
