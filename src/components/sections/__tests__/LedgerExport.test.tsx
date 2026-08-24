// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import LedgerExport from '../LedgerExport'
import { useEnergyStore } from '../../../store/useEnergyStore'
import { appendBlock, type ChainBlock } from '../../../lib/hashChain'

const fetchDemoLedger = vi.fn()
const downloadTextFile = vi.fn()
const downloadBlob = vi.fn()

vi.mock('../../../api/demoLedger', () => ({
  fetchDemoLedger: (...args: unknown[]) => fetchDemoLedger(...args),
}))

vi.mock('../../../utils/downloadFile', () => ({
  downloadTextFile: (...args: unknown[]) => downloadTextFile(...args),
  downloadBlob: (...args: unknown[]) => downloadBlob(...args),
}))

vi.mock('../../../lib/chainPdf', () => ({
  buildLedgerPdf: () => new Blob(['pdf'], { type: 'application/pdf' }),
}))

/**
 * Downloading the ledger over a timeframe.
 *
 * The behaviour that matters here is what happens when the store cannot be
 * reached. An export is the one moment a visitor is trying to take something
 * away with them, so an unreachable server has to degrade into a smaller export
 * that says so — never into an error, and never into a file that silently
 * claims to cover more than it does.
 */

function chainOf(count: number): ChainBlock[] {
  let chain: ChainBlock[] = []
  for (let i = 0; i < count; i++) {
    chain = [
      ...chain,
      appendBlock(chain, i + 1, {
        t: '14:20',
        from: 'Pranav P',
        to: 'Abivan',
        kwh: 1,
        credit: 5.5,
      }),
    ]
  }
  return chain
}

function seedStore(): void {
  useEnergyStore.setState({
    chain: chainOf(3),
    ledgerHistory: [
      {
        simDay: 1,
        dayType: 'cloudy',
        chain: chainOf(2),
        totalKwh: 2,
        totalCredit: 11,
        rate: 5.2,
        compromised: false,
        invalidCount: 0,
      },
    ],
    simDay: 2,
    dayType: 'sunny-weekday',
    rate: 5.5,
    totalKwhToday: 3,
    totalCreditToday: 16.5,
    compromised: false,
    invalidCount: 0,
  })
}

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', '')
  fetchDemoLedger.mockReset()
  downloadTextFile.mockReset()
  downloadBlob.mockReset()
  seedStore()
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('timeframe choice', () => {
  it('offers exactly the four timeframes', () => {
    render(<LedgerExport />)

    for (const label of ['TODAY', 'LAST 7 DAYS', 'LAST 30 DAYS', 'ALL TIME']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('starts on today', () => {
    render(<LedgerExport />)
    expect(screen.getByRole('button', { name: 'TODAY' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('moves the selection when another timeframe is chosen', () => {
    render(<LedgerExport />)
    fireEvent.click(screen.getByRole('button', { name: 'ALL TIME' }))

    expect(screen.getByRole('button', { name: 'ALL TIME' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'TODAY' }).getAttribute('aria-pressed')).toBe('false')
  })
})

describe('with no ledger store reachable', () => {
  it('exports CSV built from this session', async () => {
    render(<LedgerExport />)
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))

    await waitFor(() => expect(downloadTextFile).toHaveBeenCalled())
    expect(fetchDemoLedger).not.toHaveBeenCalled()
    const [name, content, mime] = downloadTextFile.mock.calls[0]
    expect(name).toBe('volt-ledger-today.csv')
    expect(mime).toBe('text/csv')
    expect(content.split('\n')).toHaveLength(4) // header plus the live day
  })

  it('says the build has no ledger store at all', async () => {
    render(<LedgerExport />)
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))

    const status = await screen.findByRole('status')
    expect(status.textContent).toMatch(/THIS BUILD HAS NO LEDGER STORE/i)
  })

  it('widens the export when a wider timeframe is chosen', async () => {
    render(<LedgerExport />)
    fireEvent.click(screen.getByRole('button', { name: 'ALL TIME' }))
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))

    await waitFor(() => expect(downloadTextFile).toHaveBeenCalled())
    // Both the archived day and the running one.
    expect(downloadTextFile.mock.calls[0][1].split('\n')).toHaveLength(6)
    expect(downloadTextFile.mock.calls[0][0]).toBe('volt-ledger-all.csv')
  })

  it('exports a PDF', async () => {
    render(<LedgerExport />)
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }))

    await waitFor(() => expect(downloadBlob).toHaveBeenCalled())
    expect(downloadBlob.mock.calls[0][0]).toBe('volt-ledger-today.pdf')
  })
})

describe('with a ledger store reachable', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000')
  })

  it('exports what the store holds rather than this session', async () => {
    fetchDemoLedger.mockResolvedValue({
      timeframe: 'today',
      trades: [
        {
          runId: 'run-1',
          simDay: 9,
          blockId: 1,
          clock: '09:15',
          fromName: 'Sanjay Murugan',
          toName: 'Rahul Natarajan',
          kwh: 2.5,
          credit: 13.75,
          seal: 'server-seal',
          previousSeal: 'GENESIS',
          sealMatchesClient: true,
        },
      ],
      days: [],
      totalKwh: 2.5,
      totalCredit: 13.75,
      tradeCount: 1,
      truncated: false,
      sealMismatches: 0,
    })

    render(<LedgerExport />)
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))

    await waitFor(() => expect(downloadTextFile).toHaveBeenCalled())
    const content = downloadTextFile.mock.calls[0][1]
    expect(content).toContain('server-seal')
    expect(content).toContain('run-1')
  })

  it('says so when the store could not be reached', async () => {
    fetchDemoLedger.mockRejectedValue(new Error('unreachable'))

    render(<LedgerExport />)
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))

    await waitFor(() => expect(downloadTextFile).toHaveBeenCalled())
    const status = await screen.findByRole('status')
    expect(status.textContent).toMatch(/COULD NOT BE REACHED/i)
  })

  it('falls back rather than exporting an empty file when the store has nothing', async () => {
    fetchDemoLedger.mockResolvedValue({
      timeframe: 'today',
      trades: [],
      days: [],
      totalKwh: 0,
      totalCredit: 0,
      tradeCount: 0,
      truncated: false,
      sealMismatches: 0,
    })

    render(<LedgerExport />)
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))

    await waitFor(() => expect(downloadTextFile).toHaveBeenCalled())
    expect(downloadTextFile.mock.calls[0][1].split('\n')).toHaveLength(4)

    // A store that answered and simply had nothing is not an unreachable one,
    // and saying so would send someone hunting a fault that is not there.
    const status = await screen.findByRole('status')
    expect(status.textContent).toMatch(/NOTHING FOR THIS TIMEFRAME YET/i)
    expect(status.textContent).not.toMatch(/COULD NOT BE REACHED/i)
  })

  it('says how much of a truncated timeframe it managed to read', async () => {
    fetchDemoLedger.mockResolvedValue({
      timeframe: 'today',
      trades: [
        {
          runId: 'run-1',
          simDay: 9,
          blockId: 1,
          clock: '09:15',
          fromName: 'A',
          toName: 'B',
          kwh: 1,
          credit: 5,
          seal: 's',
          previousSeal: 'GENESIS',
          sealMatchesClient: true,
        },
      ],
      days: [],
      totalKwh: 1,
      totalCredit: 5,
      tradeCount: 40_000,
      truncated: true,
      sealMismatches: 0,
    })

    render(<LedgerExport />)
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))

    const status = await screen.findByRole('status')
    expect(status.textContent).toMatch(/MOST RECENT 1 OF 40,000/i)
  })
})

describe('when an export fails outright', () => {
  it('reports it instead of failing silently', async () => {
    downloadTextFile.mockImplementation(() => {
      throw new Error('no filesystem')
    })

    render(<LedgerExport />)
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/CSV EXPORT FAILED/i)
  })

  it('leaves the buttons usable for another attempt', async () => {
    downloadTextFile.mockImplementation(() => {
      throw new Error('no filesystem')
    })

    render(<LedgerExport />)
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))

    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'CSV' }).getAttribute('disabled')).toBeNull()
  })
})
