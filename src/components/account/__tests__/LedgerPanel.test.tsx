// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import LedgerPanel from '../LedgerPanel'
import { useLedgerStore } from '../../../store/useLedgerStore'
import { useOrganisationStore } from '../../../store/useOrganisationStore'
import { useSimulationStore } from '../../../store/useSimulationStore'
import { ApiError } from '../../../api/errors'
import type { LedgerEvent, LedgerPage } from '../../../api/ledger'
import type { SimulationRun } from '../../../api/simulations'
import type { MembershipRole } from '../../../lib/permissions'

const { listMock, settleMock, adjustMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  settleMock: vi.fn(),
  adjustMock: vi.fn(),
}))

vi.mock('../../../api/ledger', () => ({
  listLedgerEvents: listMock,
  settleSimulationRun: settleMock,
  createLedgerAdjustment: adjustMock,
}))

vi.mock('../../../api/organisations', () => ({
  listOrganisations: vi.fn(async () => []),
  createOrganisation: vi.fn(),
  archiveOrganisation: vi.fn(),
}))

const ORG_ID = 'org-a'

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

function completedRun(id: string): SimulationRun {
  return {
    id,
    organisationId: ORG_ID,
    requestedByUserId: 'user-1',
    seed: `seed-${id}`,
    modelVersion: 'monte-carlo-1',
    status: 'completed',
    inputDigest: 'digest',
    resultDigest: 'result-digest',
    errorCode: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    startedAt: null,
    completedAt: '2026-08-01T01:00:00.000Z',
  }
}

const pristineLedger = useLedgerStore.getState()
const pristineOrganisations = useOrganisationStore.getState()
const pristineSimulations = useSimulationStore.getState()

function selectAs(role: MembershipRole): void {
  useOrganisationStore.setState({
    status: 'ready',
    organisations: [
      {
        id: ORG_ID,
        name: 'Nolambur Microgrid',
        slug: 'nolambur-microgrid',
        role,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ],
    selectedId: ORG_ID,
  })
}

beforeEach(() => {
  useLedgerStore.setState(pristineLedger, true)
  useOrganisationStore.setState(pristineOrganisations, true)
  useSimulationStore.setState(pristineSimulations, true)
  listMock.mockReset()
  settleMock.mockReset()
  adjustMock.mockReset()
  listMock.mockResolvedValue(page([event(1)]))
  useSimulationStore.setState({
    organisationId: ORG_ID,
    status: 'ready',
    runs: [completedRun('run-1')],
  })
})

afterEach(() => {
  cleanup()
})

async function renderAs(role: MembershipRole): Promise<void> {
  selectAs(role)
  render(<LedgerPanel />)
  await waitFor(() => expect(useLedgerStore.getState().status).toBe('ready'))
}

describe('LedgerPanel', () => {
  it('renders nothing without a selected organisation', () => {
    const { container } = render(<LedgerPanel />)
    expect(container.textContent).toBe('')
    expect(listMock).not.toHaveBeenCalled()
  })

  it('states that events are immutable and the energy synthetic', async () => {
    await renderAs('owner')
    const note = screen.getByText(/Immutable, hash-linked events/i)
    expect(note.textContent).toMatch(/not a meter reading/i)
    expect(note.textContent).toMatch(/appended, never edited/i)
  })

  it('shows each event with its seal', async () => {
    await renderAs('viewer')
    expect(screen.getByText('#1')).toBeTruthy()
    expect(screen.getByText(/SEAL seal-1/)).toBeTruthy()
    expect(screen.getByText('4.75 kWh')).toBeTruthy()
  })

  it('reports a verified chain', async () => {
    await renderAs('viewer')
    expect(screen.getByText(/CHAIN VERIFIED/).textContent).toMatch(/1 events checked/)
  })

  it('raises an alert when the server reports broken integrity', async () => {
    listMock.mockResolvedValue(page([event(1)], false))
    await renderAs('viewer')

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/INTEGRITY VOID/)
  })

  it('offers a retry when the ledger fails to load', async () => {
    listMock.mockReset()
    listMock.mockRejectedValueOnce(
      new ApiError({ message: 'Organisation access denied', status: 403, code: 'ORGANISATION_ACCESS_DENIED' }),
    )
    selectAs('viewer')
    render(<LedgerPanel />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Organisation access denied/i)

    listMock.mockResolvedValueOnce(page([]))
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(useLedgerStore.getState().status).toBe('ready'))
  })

  it('shows an empty chain plainly', async () => {
    listMock.mockResolvedValue(page([]))
    await renderAs('viewer')
    expect(screen.getByText(/no settlements have been accepted yet/i)).toBeTruthy()
  })
})

describe('LedgerPanel permissions', () => {
  it('gives an operator no settlement or correction controls', async () => {
    await renderAs('operator')
    expect(screen.queryByRole('button', { name: /accept settlement/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /append correction/i })).toBeNull()
  })

  it('gives a viewer no settlement or correction controls', async () => {
    await renderAs('viewer')
    expect(screen.queryByRole('button', { name: /accept settlement/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /append correction/i })).toBeNull()
  })

  it('gives an admin both', async () => {
    await renderAs('admin')
    expect(screen.getByRole('button', { name: /accept settlement/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /append correction/i })).toBeTruthy()
  })
})

describe('LedgerPanel settlement', () => {
  it('needs a completed run before it offers acceptance', async () => {
    useSimulationStore.setState({ runs: [] })
    await renderAs('owner')

    expect(screen.queryByRole('button', { name: /accept settlement/i })).toBeNull()
    expect(screen.getByText(/needs a completed simulation run/i)).toBeTruthy()
  })

  it('accepts the chosen outcome', async () => {
    await renderAs('owner')
    settleMock.mockResolvedValue({
      runId: 'run-1',
      resultDigest: 'result-digest',
      outcome: 'p90',
      alreadySettled: false,
      events: [event(1), event(2)],
    })

    fireEvent.change(screen.getByLabelText(/outcome/i), { target: { value: 'p90' } })
    fireEvent.click(screen.getByRole('button', { name: /accept settlement/i }))

    await waitFor(() => expect(settleMock).toHaveBeenCalledWith(ORG_ID, 'run-1', 'p90'))
    const status = await screen.findByRole('status')
    expect(status.textContent).toMatch(/Accepted 2 settlement events/)
  })

  it('says plainly when nothing was appended because it was already settled', async () => {
    await renderAs('owner')
    settleMock.mockResolvedValue({
      runId: 'run-1',
      resultDigest: 'result-digest',
      outcome: 'selected',
      alreadySettled: true,
      events: [event(1)],
    })

    fireEvent.click(screen.getByRole('button', { name: /accept settlement/i }))

    const status = await screen.findByRole('status')
    expect(status.textContent).toMatch(/already settled/i)
  })

  it('reports a refused change of outcome', async () => {
    await renderAs('owner')
    settleMock.mockRejectedValue(
      new ApiError({
        message: 'Simulation run cannot be settled with this request',
        status: 409,
        code: 'SIMULATION_ALREADY_SETTLED_DIFFERENT_OUTCOME',
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: /accept settlement/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/cannot be settled/i)
  })
})

describe('LedgerPanel corrections', () => {
  async function openAdjustment(): Promise<void> {
    await renderAs('owner')
    fireEvent.click(screen.getByRole('button', { name: /append correction/i }))
  }

  it('states that the target event is not modified', async () => {
    await openAdjustment()
    expect(screen.getByText(/never modified/i)).toBeTruthy()
  })

  it('refuses a delta that changes nothing', async () => {
    await openAdjustment()
    fireEvent.click(screen.getByRole('button', { name: /^append correction…?$/i }))

    expect(adjustMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/must change energy or estimated credit/i)
  })

  it('requires a reason', async () => {
    await openAdjustment()
    fireEvent.change(screen.getByLabelText(/energy delta/i), { target: { value: '-0.5' } })
    fireEvent.click(screen.getByRole('button', { name: /^append correction…?$/i }))

    expect(adjustMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/reason/i)
  })

  it('requires an idempotency key', async () => {
    await openAdjustment()
    fireEvent.change(screen.getByLabelText(/energy delta/i), { target: { value: '-0.5' } })
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Meter correction' } })
    fireEvent.click(screen.getByRole('button', { name: /^append correction…?$/i }))

    expect(adjustMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/idempotency key/i)
  })

  it('appends a valid correction', async () => {
    await openAdjustment()
    adjustMock.mockResolvedValue({
      alreadyApplied: false,
      event: event(2, { eventType: 'adjustment', adjustmentTargetEventId: 'event-1' }),
    })

    fireEvent.change(screen.getByLabelText(/energy delta/i), { target: { value: '-0.5' } })
    fireEvent.change(screen.getByLabelText(/credit delta/i), { target: { value: '-2.75' } })
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Meter correction' } })
    fireEvent.change(screen.getByLabelText(/idempotency key/i), { target: { value: 'key-1' } })
    fireEvent.click(screen.getByRole('button', { name: /^append correction…?$/i }))

    await waitFor(() =>
      expect(adjustMock).toHaveBeenCalledWith(ORG_ID, {
        targetEventId: 'event-1',
        idempotencyKey: 'key-1',
        energyKwh: -0.5,
        estimatedCreditInr: -2.75,
        reason: 'Meter correction',
      }),
    )
  })

  it('reports a reused idempotency key', async () => {
    await openAdjustment()
    adjustMock.mockRejectedValue(
      new ApiError({
        message: 'Ledger adjustment cannot be applied',
        status: 409,
        code: 'LEDGER_IDEMPOTENCY_CONFLICT',
      }),
    )

    fireEvent.change(screen.getByLabelText(/energy delta/i), { target: { value: '-0.5' } })
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Meter correction' } })
    fireEvent.change(screen.getByLabelText(/idempotency key/i), { target: { value: 'key-1' } })
    fireEvent.click(screen.getByRole('button', { name: /^append correction…?$/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/cannot be applied/i)
  })

  it('offers no correction control against an adjustment event', async () => {
    listMock.mockResolvedValue(
      page([event(1, { eventType: 'adjustment', adjustmentReason: 'Earlier correction' })]),
    )
    await renderAs('owner')

    expect(screen.queryByRole('button', { name: /append correction/i })).toBeNull()
    expect(screen.getByText(/Correction: Earlier correction/)).toBeTruthy()
  })
})
