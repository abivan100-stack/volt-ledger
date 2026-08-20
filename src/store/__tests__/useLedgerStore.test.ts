import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLedgerStore } from '../useLedgerStore'
import { useOrganisationStore } from '../useOrganisationStore'
import { useSessionStore } from '../useSessionStore'
import { ApiError } from '../../api/errors'
import type { LedgerEvent, LedgerPage } from '../../api/ledger'

const { listMock, settleMock, adjustMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  settleMock: vi.fn(),
  adjustMock: vi.fn(),
}))

vi.mock('../../api/ledger', () => ({
  listLedgerEvents: listMock,
  settleSimulationRun: settleMock,
  createLedgerAdjustment: adjustMock,
}))

vi.mock('../../api/organisations', () => ({
  listOrganisations: vi.fn(async () => []),
  createOrganisation: vi.fn(),
  archiveOrganisation: vi.fn(),
}))

const ORG_A = 'org-a'
const ORG_B = 'org-b'

function event(sequence: number, overrides: Partial<LedgerEvent> = {}): LedgerEvent {
  return {
    id: `event-${sequence}`,
    sequence,
    eventType: 'settlement',
    outcome: 'p50',
    actorUserId: 'user-1',
    householdId: 'h1',
    settlementDate: '2026-08-01',
    sourceRunId: 'run-1',
    simulationResultDigest: 'result-digest',
    energyKwh: 4.75,
    estimatedCreditInr: 26.13,
    previousSeal: sequence === 1 ? null : `seal-${sequence - 1}`,
    canonicalSeal: `seal-${sequence}`,
    adjustmentTargetEventId: null,
    adjustmentReason: null,
    idempotencyKey: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function page(events: LedgerEvent[], valid = true): LedgerPage {
  return {
    events,
    integrity: {
      valid,
      complete: events.length === 0 || events[0]?.sequence === 1,
      checkedEvents: events.length,
      firstSequence: events[0]?.sequence ?? null,
      lastSequence: events.at(-1)?.sequence ?? null,
    },
  }
}

const pristineLedger = useLedgerStore.getState()
const pristineOrganisations = useOrganisationStore.getState()
const pristineSession = useSessionStore.getState()

beforeEach(() => {
  useLedgerStore.setState(pristineLedger, true)
  useOrganisationStore.setState(pristineOrganisations, true)
  useSessionStore.setState(pristineSession, true)
  listMock.mockReset()
  settleMock.mockReset()
  adjustMock.mockReset()
})

describe('load', () => {
  it('stores the events and the server integrity verdict', async () => {
    listMock.mockResolvedValue(page([event(1)]))
    await useLedgerStore.getState().load(ORG_A)

    const state = useLedgerStore.getState()
    expect(state.status).toBe('ready')
    expect(state.events).toHaveLength(1)
    expect(state.integrity?.valid).toBe(true)
    expect(state.organisationId).toBe(ORG_A)
  })

  it('keeps a failed integrity verdict rather than hiding it', async () => {
    listMock.mockResolvedValue(page([event(1)], false))
    await useLedgerStore.getState().load(ORG_A)
    expect(useLedgerStore.getState().integrity?.valid).toBe(false)
  })

  it('records a failure and stays retryable', async () => {
    listMock.mockRejectedValueOnce(
      new ApiError({ message: 'Organisation access denied', status: 403, code: 'ORGANISATION_ACCESS_DENIED' }),
    )
    await useLedgerStore.getState().load(ORG_A)
    expect(useLedgerStore.getState().status).toBe('error')

    listMock.mockResolvedValueOnce(page([]))
    await useLedgerStore.getState().load(ORG_A)
    expect(useLedgerStore.getState().status).toBe('ready')
  })

  it('ignores a slow response for an organisation that is no longer selected', async () => {
    let release: (value: LedgerPage) => void = () => {}
    listMock.mockReturnValueOnce(
      new Promise<LedgerPage>((resolve) => {
        release = resolve
      }),
    )
    const slow = useLedgerStore.getState().load(ORG_A)

    listMock.mockResolvedValueOnce(page([event(5)]))
    await useLedgerStore.getState().load(ORG_B)

    release(page([event(1)]))
    await slow

    expect(useLedgerStore.getState().organisationId).toBe(ORG_B)
    expect(useLedgerStore.getState().events[0]?.sequence).toBe(5)
  })
})

describe('settle', () => {
  it('accepts an outcome and re-reads the chain', async () => {
    listMock.mockResolvedValue(page([]))
    await useLedgerStore.getState().load(ORG_A)

    const settlement = {
      runId: 'run-1',
      resultDigest: 'result-digest',
      outcome: 'p50' as const,
      alreadySettled: false,
      events: [event(1)],
    }
    settleMock.mockResolvedValue(settlement)
    listMock.mockResolvedValue(page([event(1)]))

    const result = await useLedgerStore.getState().settle('run-1', 'p50')

    expect(settleMock).toHaveBeenCalledWith(ORG_A, 'run-1', 'p50')
    expect(result).toEqual(settlement)
    // Re-read so the integrity verdict covers what is actually stored.
    expect(listMock).toHaveBeenCalledTimes(2)
    expect(useLedgerStore.getState().events).toHaveLength(1)
  })

  it('surfaces a repeated acceptance as already settled', async () => {
    listMock.mockResolvedValue(page([event(1)]))
    await useLedgerStore.getState().load(ORG_A)

    settleMock.mockResolvedValue({
      runId: 'run-1',
      resultDigest: 'result-digest',
      outcome: 'p50',
      alreadySettled: true,
      events: [event(1)],
    })

    const result = await useLedgerStore.getState().settle('run-1', 'p50')
    expect(result.alreadySettled).toBe(true)
  })

  it('propagates a refused outcome change without touching the chain', async () => {
    listMock.mockResolvedValue(page([event(1)]))
    await useLedgerStore.getState().load(ORG_A)
    listMock.mockClear()

    settleMock.mockRejectedValue(
      new ApiError({
        message: 'Simulation run cannot be settled with this request',
        status: 409,
        code: 'SIMULATION_ALREADY_SETTLED_DIFFERENT_OUTCOME',
      }),
    )

    await expect(useLedgerStore.getState().settle('run-1', 'p90')).rejects.toMatchObject({
      code: 'SIMULATION_ALREADY_SETTLED_DIFFERENT_OUTCOME',
    })
    expect(listMock).not.toHaveBeenCalled()
    expect(useLedgerStore.getState().events).toHaveLength(1)
  })

  it('refuses to act when no organisation is selected', async () => {
    await expect(useLedgerStore.getState().settle('run-1', 'p50')).rejects.toThrow(
      /No organisation is selected/,
    )
    expect(settleMock).not.toHaveBeenCalled()
  })
})

describe('adjust', () => {
  const INPUT = {
    targetEventId: 'event-1',
    idempotencyKey: 'key-1',
    energyKwh: -0.5,
    estimatedCreditInr: -2.75,
    reason: 'Correction',
  }

  it('appends an adjustment and re-reads the chain, leaving the target intact', async () => {
    const target = event(1)
    listMock.mockResolvedValue(page([target]))
    await useLedgerStore.getState().load(ORG_A)

    const adjustment = event(2, { eventType: 'adjustment', adjustmentTargetEventId: 'event-1' })
    adjustMock.mockResolvedValue({ alreadyApplied: false, event: adjustment })
    listMock.mockResolvedValue(page([target, adjustment]))

    await useLedgerStore.getState().adjust(INPUT)

    expect(adjustMock).toHaveBeenCalledWith(ORG_A, INPUT)
    const events = useLedgerStore.getState().events
    expect(events).toHaveLength(2)
    // The target event is unchanged; the correction is a new event.
    expect(events[0]).toEqual(target)
    expect(events[1]?.eventType).toBe('adjustment')
  })

  it('propagates an idempotency conflict without touching the chain', async () => {
    listMock.mockResolvedValue(page([event(1)]))
    await useLedgerStore.getState().load(ORG_A)
    listMock.mockClear()

    adjustMock.mockRejectedValue(
      new ApiError({
        message: 'Ledger adjustment cannot be applied',
        status: 409,
        code: 'LEDGER_IDEMPOTENCY_CONFLICT',
      }),
    )

    await expect(useLedgerStore.getState().adjust(INPUT)).rejects.toMatchObject({
      code: 'LEDGER_IDEMPOTENCY_CONFLICT',
    })
    expect(listMock).not.toHaveBeenCalled()
    expect(useLedgerStore.getState().events).toHaveLength(1)
  })
})

describe('scope changes', () => {
  it('clears the chain when the selected organisation changes', async () => {
    listMock.mockResolvedValue(page([event(1)]))
    await useLedgerStore.getState().load(ORG_A)

    useOrganisationStore.setState({ selectedId: ORG_B })

    expect(useLedgerStore.getState().events).toEqual([])
    expect(useLedgerStore.getState().integrity).toBeNull()
  })

  it('clears the chain when an authenticated session ends', async () => {
    useSessionStore.setState({ status: 'authenticated' })
    listMock.mockResolvedValue(page([event(1)]))
    await useLedgerStore.getState().load(ORG_A)

    useSessionStore.getState().expire()
    expect(useLedgerStore.getState().events).toEqual([])
  })
})
