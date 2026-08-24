import { describe, it, expect, vi } from 'vitest'
import {
  fetchDemoLedger,
  recordDemoDay,
  recordDemoTrades,
  type DemoLedgerSnapshot,
} from '../demoLedger'
import type { ApiClient, ApiRequestOptions } from '../client'

const SESSION_ID = '22222222-2222-4222-8222-222222222222'
const RUN_ID = '33333333-3333-4333-8333-333333333333'

// Typed so the assertions below can read back the path and options the resource
// module built, not just that it was called.
function stubClient(result: unknown) {
  const request = vi.fn(async (_path: string, _options: ApiRequestOptions = {}) => result)
  return { client: { request } as unknown as ApiClient, request }
}

const TRADE = {
  blockId: 1,
  clock: '14:20',
  fromName: 'Pranav P',
  toName: 'Abivan',
  kwh: 1.05,
  credit: 5.67,
  rate: 5.4,
  clientSeal: 'seal-1',
  clientPreviousSeal: 'GENESIS',
}

describe('recordDemoTrades', () => {
  it('posts the batch under the session in the path', async () => {
    const { client, request } = stubClient({
      recorded: 1,
      duplicates: 0,
      rejected: 0,
      sealMismatches: 0,
    })

    await recordDemoTrades(
      SESSION_ID,
      { runId: RUN_ID, dayType: 'sunny-weekday', startHour: 8, simSpeed: 4, simDay: 1, trades: [TRADE] },
      { client },
    )

    expect(request).toHaveBeenCalledWith(
      `/api/v1/demo/sessions/${SESSION_ID}/trades`,
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ runId: RUN_ID, simDay: 1 }),
      }),
    )
  })

  it('returns the counts the server reported', async () => {
    const { client } = stubClient({ recorded: 3, duplicates: 1, rejected: 2, sealMismatches: 1 })

    const result = await recordDemoTrades(
      SESSION_ID,
      { runId: RUN_ID, dayType: 'cloudy', startHour: 0, simSpeed: 1, simDay: 2, trades: [TRADE] },
      { client },
    )

    expect(result).toEqual({ recorded: 3, duplicates: 1, rejected: 2, sealMismatches: 1 })
  })

  it('escapes a session identifier rather than pasting it into the path', async () => {
    const { client, request } = stubClient({
      recorded: 0,
      duplicates: 0,
      rejected: 0,
      sealMismatches: 0,
    })

    await recordDemoTrades(
      '../../organisations',
      { runId: RUN_ID, dayType: 'weekend', startHour: 8, simSpeed: 4, simDay: 1, trades: [TRADE] },
      { client },
    )

    expect(request.mock.calls[0][0]).toBe('/api/v1/demo/sessions/..%2F..%2Forganisations/trades')
  })
})

describe('recordDemoDay', () => {
  it('posts the day close and returns the verdict on its totals', async () => {
    const { client, request } = stubClient({
      recorded: true,
      households: 10,
      totalsMatchClient: false,
    })

    const result = await recordDemoDay(
      SESSION_ID,
      {
        runId: RUN_ID,
        simDay: 3,
        dayType: 'heatwave',
        totalKwh: 12.5,
        totalCredit: 68.75,
        tradeCount: 11,
        closingRate: 5.5,
        compromised: false,
        invalidCount: 0,
        households: [],
      },
      { client },
    )

    expect(request.mock.calls[0][0]).toBe(`/api/v1/demo/sessions/${SESSION_ID}/days`)
    expect(result.totalsMatchClient).toBe(false)
    expect(result.households).toBe(10)
  })
})

describe('fetchDemoLedger', () => {
  const SNAPSHOT: DemoLedgerSnapshot = {
    timeframe: '7d',
    trades: [],
    days: [],
    totalKwh: 0,
    totalCredit: 0,
    tradeCount: 0,
    truncated: false,
    sealMismatches: 0,
  }

  it('sends the timeframe as a query parameter', async () => {
    const { client, request } = stubClient(SNAPSHOT)

    await fetchDemoLedger(SESSION_ID, '30d', { client })

    expect(request).toHaveBeenCalledWith(
      `/api/v1/demo/sessions/${SESSION_ID}/ledger`,
      expect.objectContaining({ query: { timeframe: '30d' } }),
    )
  })

  it('does not send a body on the read', async () => {
    const { client, request } = stubClient(SNAPSHOT)

    await fetchDemoLedger(SESSION_ID, 'all', { client })

    const [, options] = request.mock.calls[0]
    expect(options?.body).toBeUndefined()
    expect(options?.method).toBeUndefined()
  })

  it('returns the snapshot unchanged', async () => {
    const { client } = stubClient(SNAPSHOT)
    await expect(fetchDemoLedger(SESSION_ID, '7d', { client })).resolves.toEqual(SNAPSHOT)
  })
})
