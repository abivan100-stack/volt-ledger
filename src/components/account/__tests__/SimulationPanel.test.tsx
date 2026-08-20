// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SimulationPanel from '../SimulationPanel'
import { useOrganisationStore } from '../../../store/useOrganisationStore'
import { useSimulationStore } from '../../../store/useSimulationStore'
import { ApiError } from '../../../api/errors'
import type { SimulationQuota, SimulationRun, SimulationSummary } from '../../../api/simulations'
import type { MembershipRole } from '../../../lib/permissions'

const { createMock, listMock, getRunMock, resultsMock, quotaMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  listMock: vi.fn(),
  getRunMock: vi.fn(),
  resultsMock: vi.fn(),
  quotaMock: vi.fn(),
}))

vi.mock('../../../api/simulations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/simulations')>()),
  createSimulationRun: createMock,
  listSimulationRuns: listMock,
  getSimulationRun: getRunMock,
  getSimulationResults: resultsMock,
  getSimulationQuota: quotaMock,
}))

vi.mock('../../../api/organisations', () => ({
  listOrganisations: vi.fn(async () => []),
  createOrganisation: vi.fn(),
  archiveOrganisation: vi.fn(),
}))

const ORG_ID = 'org-a'

function run(id: string, status: SimulationRun['status'] = 'queued'): SimulationRun {
  return {
    id,
    organisationId: ORG_ID,
    requestedByUserId: 'user-1',
    seed: `seed-${id}`,
    modelVersion: 'monte-carlo-1',
    status,
    inputDigest: 'digest',
    resultDigest: status === 'completed' ? 'result-digest' : null,
    errorCode: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
  }
}

const QUOTA: SimulationQuota = {
  usageDate: '2026-08-01',
  used: 3,
  limit: 100,
  remaining: 97,
  resetsAt: '2026-08-02T00:00:00.000Z',
}

function summary(householdId: string): SimulationSummary {
  return {
    id: `summary-${householdId}`,
    householdId,
    outcome: 'p50',
    intervalCount: 24,
    generatedKwh: 12.5,
    consumedKwh: 9,
    importedKwh: 1.25,
    exportedKwh: 4.75,
    estimatedCreditInr: 26.125,
    createdAt: '2026-08-01T00:00:00.000Z',
  }
}

const pristineSimulations = useSimulationStore.getState()
const pristineOrganisations = useOrganisationStore.getState()

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
  useSimulationStore.setState(pristineSimulations, true)
  useOrganisationStore.setState(pristineOrganisations, true)
  createMock.mockReset()
  listMock.mockReset()
  getRunMock.mockReset()
  resultsMock.mockReset()
  quotaMock.mockReset()
  listMock.mockResolvedValue([run('run-1', 'completed')])
  quotaMock.mockResolvedValue(QUOTA)
})

afterEach(() => {
  cleanup()
})

async function renderAs(role: MembershipRole): Promise<void> {
  selectAs(role)
  render(<SimulationPanel />)
  await waitFor(() => expect(useSimulationStore.getState().status).toBe('ready'))
}

function fillForm(seed = 'seed-new', date = '2026-08-01'): void {
  fireEvent.change(screen.getByLabelText(/^seed/i), { target: { value: seed } })
  fireEvent.change(screen.getByLabelText(/simulation date/i), { target: { value: date } })
}

describe('SimulationPanel', () => {
  it('renders nothing without a selected organisation', () => {
    const { container } = render(<SimulationPanel />)
    expect(container.textContent).toBe('')
    expect(listMock).not.toHaveBeenCalled()
  })

  it('states plainly that the data is synthetic', async () => {
    await renderAs('owner')
    expect(screen.getByText(/synthetic scenarios only/i)).toBeTruthy()
  })

  it('shows the daily allowance', async () => {
    await renderAs('owner')
    const quota = screen.getByText(/DAILY RUNS 3\/100/)
    expect(quota.textContent).toMatch(/97 remaining today/)
  })

  it('offers a retry when the list fails', async () => {
    listMock.mockReset()
    listMock.mockRejectedValueOnce(
      new ApiError({ message: 'Organisation access denied', status: 403, code: 'ORGANISATION_ACCESS_DENIED' }),
    )
    selectAs('owner')
    render(<SimulationPanel />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Organisation access denied/i)

    listMock.mockResolvedValueOnce([])
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(useSimulationStore.getState().status).toBe('ready'))
  })
})

describe('SimulationPanel permissions', () => {
  it('gives a viewer no submission form', async () => {
    await renderAs('viewer')
    expect(screen.queryByLabelText(/^seed/i)).toBeNull()
    expect(screen.getByText(/view simulation runs but not start them/i)).toBeTruthy()
  })

  it('lets an operator submit', async () => {
    await renderAs('operator')
    expect(screen.getByLabelText(/^seed/i)).toBeTruthy()
  })
})

describe('SimulationPanel submission', () => {
  it('queues a run from the entered inputs', async () => {
    await renderAs('owner')
    createMock.mockResolvedValue(run('run-new'))

    fillForm()
    fireEvent.click(screen.getByRole('button', { name: /queue simulation/i }))

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    const [organisationId, input] = createMock.mock.calls[0] as [string, { seed: string; dayType: string; households: unknown[] }]
    expect(organisationId).toBe(ORG_ID)
    expect(input.seed).toBe('seed-new')
    expect(input.dayType).toBe('sunny-weekday')
    expect(input.households).toHaveLength(10)
  })

  it('requires a seed', async () => {
    await renderAs('owner')
    fireEvent.change(screen.getByLabelText(/simulation date/i), { target: { value: '2026-08-01' } })
    fireEvent.click(screen.getByRole('button', { name: /queue simulation/i }))

    expect(createMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/seed/i)
  })

  it('requires a simulation date', async () => {
    await renderAs('owner')
    fireEvent.change(screen.getByLabelText(/^seed/i), { target: { value: 'seed-new' } })
    fireEvent.click(screen.getByRole('button', { name: /queue simulation/i }))

    expect(createMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/YYYY-MM-DD/)
  })

  it('reports an exhausted quota', async () => {
    await renderAs('owner')
    createMock.mockRejectedValue(
      new ApiError({
        message: 'Daily simulation quota exceeded',
        status: 429,
        code: 'SIMULATION_QUOTA_EXCEEDED',
        retryAfterSeconds: 3600,
      }),
    )

    fillForm()
    fireEvent.click(screen.getByRole('button', { name: /queue simulation/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/quota exceeded/i)
  })

  it('disables submission when the allowance is already spent', async () => {
    quotaMock.mockResolvedValue({ ...QUOTA, used: 100, remaining: 0 })
    await renderAs('owner')

    const submit = screen.getByRole('button', { name: /queue simulation/i }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    expect(screen.getByText(/DAILY RUNS 100\/100/).textContent).toMatch(/exhausted/i)
  })
})

describe('SimulationPanel results', () => {
  it('loads results for a selected run', async () => {
    await renderAs('owner')
    resultsMock.mockResolvedValue({
      run: run('run-1', 'completed'),
      intervals: [],
      summaries: [summary('h1')],
    })

    fireEvent.click(screen.getByRole('button', { name: /seed-run-1/i }))

    await waitFor(() => expect(useSimulationStore.getState().resultsStatus).toBe('ready'))
    expect(screen.getByText('h1')).toBeTruthy()
    expect(screen.getByText('4.75')).toBeTruthy()
    expect(screen.getByText(/RESULT DIGEST result-digest/)).toBeTruthy()
  })

  it('explains that an unfinished run has no results yet', async () => {
    listMock.mockResolvedValue([run('run-2', 'queued')])
    await renderAs('owner')

    resultsMock.mockRejectedValue(
      new ApiError({
        message: 'Simulation results are not available yet',
        status: 409,
        code: 'SIMULATION_NOT_COMPLETE',
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: /seed-run-2/i }))

    await waitFor(() => expect(useSimulationStore.getState().resultsStatus).toBe('pending'))
    expect(screen.getByText(/has not finished yet/i)).toBeTruthy()
  })

  it('reports a results failure', async () => {
    await renderAs('owner')
    resultsMock.mockRejectedValue(
      new ApiError({ message: 'Simulation run not found', status: 404, code: 'SIMULATION_NOT_FOUND' }),
    )

    fireEvent.click(screen.getByRole('button', { name: /seed-run-1/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Simulation run not found/i)
  })

  it('shows an empty run list plainly', async () => {
    listMock.mockResolvedValue([])
    await renderAs('owner')
    expect(screen.getByText(/no simulation runs yet/i)).toBeTruthy()
  })
})
