import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/errors'

const recordDemoTrades = vi.fn()
const recordDemoDay = vi.fn()

vi.mock('../../api/demoLedger', () => ({
  recordDemoTrades: (...args: unknown[]) => recordDemoTrades(...args),
  recordDemoDay: (...args: unknown[]) => recordDemoDay(...args),
}))

const {
  beginDemoRun,
  closeDemoDay,
  demoSyncSnapshot,
  flushDemoTrades,
  isDemoSyncEnabled,
  recordDemoTrade,
  resetDemoSync,
} = await import('../demoSync')

/**
 * The bridge between the running simulation and the ledger store.
 *
 * Everything asserted here is a promise made to the simulation rather than to
 * the server: that a visitor with no network still gets their demo, that a tab
 * left running does not grow without bound, and that a batch the server will
 * never accept cannot wedge the queue behind it.
 */

const RUN = { runId: 'run-1', dayType: 'sunny-weekday' as const, startHour: 8, simSpeed: 4 }

function trade(blockId: number, simDay = 1) {
  return {
    simDay,
    blockId,
    clock: '14:20',
    fromName: 'Pranav P',
    toName: 'Abivan',
    kwh: 1,
    credit: 5.5,
    rate: 5.5,
    clientSeal: `seal-${blockId}`,
    clientPreviousSeal: `seal-${blockId - 1}`,
  }
}

function ok() {
  return { recorded: 1, duplicates: 0, rejected: 0, sealMismatches: 0 }
}

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000')
  recordDemoTrades.mockReset().mockResolvedValue(ok())
  recordDemoDay.mockReset().mockResolvedValue({
    recorded: true,
    households: 0,
    totalsMatchClient: true,
  })
  resetDemoSync()
})

afterEach(() => {
  resetDemoSync()
  vi.unstubAllEnvs()
})

describe('with no API configured', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', '')
  })

  it('is inert, so the browser-only build behaves as it always did', async () => {
    beginDemoRun(RUN)
    recordDemoTrade(trade(1))
    await flushDemoTrades()

    expect(isDemoSyncEnabled()).toBe(false)
    expect(recordDemoTrades).not.toHaveBeenCalled()
    expect(demoSyncSnapshot().pending).toBe(0)
  })

  it('closes a day without reaching for the network', async () => {
    beginDemoRun(RUN)
    await closeDemoDay({
      simDay: 1,
      dayType: 'sunny-weekday',
      totalKwh: 1,
      totalCredit: 5.5,
      tradeCount: 1,
      closingRate: 5.5,
      compromised: false,
      invalidCount: 0,
      households: [],
    })

    expect(recordDemoDay).not.toHaveBeenCalled()
  })
})

describe('buffering', () => {
  it('holds trades rather than posting each one', () => {
    beginDemoRun(RUN)
    recordDemoTrade(trade(1))
    recordDemoTrade(trade(2))

    expect(recordDemoTrades).not.toHaveBeenCalled()
    expect(demoSyncSnapshot().pending).toBe(2)
  })

  it('flushes once enough have gathered', async () => {
    beginDemoRun(RUN)
    for (let blockId = 1; blockId <= 25; blockId++) recordDemoTrade(trade(blockId))
    await vi.waitFor(() => expect(recordDemoTrades).toHaveBeenCalled())

    expect(demoSyncSnapshot().pending).toBe(0)
  })

  it('ignores trades when no run is open', () => {
    recordDemoTrade(trade(1))
    expect(demoSyncSnapshot().pending).toBe(0)
  })

  it('abandons the previous run’s queue when the scenario resets', () => {
    beginDemoRun(RUN)
    recordDemoTrade(trade(1))
    beginDemoRun({ ...RUN, runId: 'run-2' })

    // Those trades were sealed against a chain that no longer exists.
    expect(demoSyncSnapshot().pending).toBe(0)
    expect(demoSyncSnapshot().runId).toBe('run-2')
  })

  it('will not close a day whose trades it had to drop', async () => {
    recordDemoTrades.mockRejectedValue(
      new ApiError({ message: 'offline', status: 0, code: 'NETWORK_ERROR' }),
    )
    beginDemoRun(RUN)
    for (let blockId = 1; blockId <= 1_200; blockId++) recordDemoTrade(trade(blockId))

    expect(demoSyncSnapshot().droppedWhileOffline).toBeGreaterThan(0)
    expect(demoSyncSnapshot().spoiledDays).toBe(1)

    recordDemoTrades.mockResolvedValue(ok())
    await closeDemoDay({
      simDay: 1,
      dayType: 'sunny-weekday',
      totalKwh: 1,
      totalCredit: 5.5,
      tradeCount: 1,
      closingRate: 5.5,
      compromised: false,
      invalidCount: 0,
      households: [],
    })

    // Those blocks are gone for good; the day can never be stored whole.
    expect(recordDemoDay).not.toHaveBeenCalled()
  })

  it('drops the oldest rather than growing without bound while offline', async () => {
    recordDemoTrades.mockRejectedValue(new ApiError({ message: 'offline', status: 0, code: 'NETWORK_ERROR' }))
    beginDemoRun(RUN)

    for (let blockId = 1; blockId <= 1_200; blockId++) recordDemoTrade(trade(blockId))
    await vi.waitFor(() => expect(recordDemoTrades).toHaveBeenCalled())

    expect(demoSyncSnapshot().pending).toBeLessThanOrEqual(1_000)
    expect(demoSyncSnapshot().droppedWhileOffline).toBeGreaterThan(0)
  })
})

describe('flushing', () => {
  it('sends trades in block order', async () => {
    beginDemoRun(RUN)
    recordDemoTrade(trade(3))
    recordDemoTrade(trade(1))
    recordDemoTrade(trade(2))
    await flushDemoTrades()

    const sent = recordDemoTrades.mock.calls[0][1].trades as Array<{ blockId: number }>
    expect(sent.map((entry) => entry.blockId)).toEqual([1, 2, 3])
  })

  it('strips the simulated day from each trade, sending it once for the batch', async () => {
    beginDemoRun(RUN)
    recordDemoTrade(trade(1, 4))
    await flushDemoTrades()

    const body = recordDemoTrades.mock.calls[0][1]
    expect(body.simDay).toBe(4)
    expect(body.trades[0].simDay).toBeUndefined()
  })

  it('sends one request per simulated day, oldest first', async () => {
    beginDemoRun(RUN)
    recordDemoTrade(trade(1, 1))
    recordDemoTrade(trade(1, 2))
    await flushDemoTrades()

    expect(recordDemoTrades).toHaveBeenCalledTimes(2)
    expect(recordDemoTrades.mock.calls[0][1].simDay).toBe(1)
    expect(recordDemoTrades.mock.calls[1][1].simDay).toBe(2)
  })

  it('does nothing when there is nothing queued', async () => {
    beginDemoRun(RUN)
    await flushDemoTrades()
    expect(recordDemoTrades).not.toHaveBeenCalled()
  })

  it('keeps a batch queued when the request fails for a transient reason', async () => {
    recordDemoTrades.mockRejectedValue(new ApiError({ message: 'offline', status: 0, code: 'NETWORK_ERROR' }))
    beginDemoRun(RUN)
    recordDemoTrade(trade(1))
    await flushDemoTrades()

    expect(demoSyncSnapshot().pending).toBe(1)
  })

  it('retries a queued batch on the next flush', async () => {
    recordDemoTrades.mockRejectedValueOnce(
      new ApiError({ message: 'offline', status: 0, code: 'NETWORK_ERROR' }),
    )
    beginDemoRun(RUN)
    recordDemoTrade(trade(1))

    await flushDemoTrades()
    expect(demoSyncSnapshot().pending).toBe(1)

    await flushDemoTrades()
    expect(demoSyncSnapshot().pending).toBe(0)
  })

  it('drops a batch the server will never accept, so the queue can move', async () => {
    recordDemoTrades.mockRejectedValueOnce(
      new ApiError({ message: 'closed', status: 409, code: 'DEMO_DAY_CLOSED' }),
    )
    beginDemoRun(RUN)
    recordDemoTrade(trade(1, 1))
    recordDemoTrade(trade(1, 2))
    await flushDemoTrades()

    // The refused day is discarded and the day behind it still goes.
    expect(demoSyncSnapshot().pending).toBe(0)
    expect(recordDemoTrades).toHaveBeenCalledTimes(2)
  })

  it('stops asking when the database cannot store anything', async () => {
    // A deployment without transactions will not gain them while the tab is
    // open, so this is as permanent as an operator switching persistence off.
    recordDemoTrades.mockRejectedValue(
      new ApiError({
        message: 'needs a replica set',
        status: 503,
        code: 'DEMO_PERSISTENCE_UNAVAILABLE',
      }),
    )
    beginDemoRun(RUN)
    recordDemoTrade(trade(1))
    await flushDemoTrades()

    expect(isDemoSyncEnabled()).toBe(false)
    expect(demoSyncSnapshot().pending).toBe(0)
  })

  it('stops asking once the server says persistence is off', async () => {
    recordDemoTrades.mockRejectedValue(
      new ApiError({ message: 'off', status: 503, code: 'DEMO_PERSISTENCE_DISABLED' }),
    )
    beginDemoRun(RUN)
    recordDemoTrade(trade(1))
    await flushDemoTrades()

    expect(isDemoSyncEnabled()).toBe(false)
    expect(demoSyncSnapshot().disabled).toBe(true)

    recordDemoTrade(trade(2))
    await flushDemoTrades()
    expect(recordDemoTrades).toHaveBeenCalledTimes(1)
  })

  it('keeps trying after a 503 the API did not explain', async () => {
    // A proxy, a rolling restart or a moment of overload all answer 503 without
    // a demo code. Treating those as final would discard trades a retry would
    // have stored.
    recordDemoTrades.mockRejectedValueOnce(
      new ApiError({ message: 'bad gateway', status: 503, code: 'UNKNOWN' }),
    )
    beginDemoRun(RUN)
    recordDemoTrade(trade(1))
    await flushDemoTrades()

    expect(isDemoSyncEnabled()).toBe(true)
    expect(demoSyncSnapshot().pending).toBe(1)

    await flushDemoTrades()
    expect(demoSyncSnapshot().pending).toBe(0)
  })

  it('never rejects, whatever the network does', async () => {
    recordDemoTrades.mockRejectedValue(new Error('something entirely unexpected'))
    beginDemoRun(RUN)
    recordDemoTrade(trade(1))

    await expect(flushDemoTrades()).resolves.toBeUndefined()
  })
})

describe('when a scenario resets mid-flight', () => {
  it('never posts the new run’s trades under the abandoned run', async () => {
    let release: (() => void) | undefined
    recordDemoTrades.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return ok()
    })

    beginDemoRun(RUN)
    recordDemoTrade(trade(1))
    const flushing = flushDemoTrades()
    await vi.waitFor(() => expect(release).toBeDefined())

    // The visitor changes the day type while that request is still open.
    beginDemoRun({ ...RUN, runId: 'run-2' })
    recordDemoTrade(trade(1))
    release?.()
    await flushing

    // The in-flight flush belonged to run-1 and must not carry run-2's trade.
    expect(recordDemoTrades).toHaveBeenCalledTimes(1)
    expect(recordDemoTrades.mock.calls[0][1].runId).toBe('run-1')
    expect(demoSyncSnapshot().pending).toBe(1)
  })

  it('leaves the new run’s queue intact', async () => {
    let release: (() => void) | undefined
    recordDemoTrades.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return ok()
    })

    beginDemoRun(RUN)
    recordDemoTrade(trade(1))
    const flushing = flushDemoTrades()
    await vi.waitFor(() => expect(release).toBeDefined())

    beginDemoRun({ ...RUN, runId: 'run-2' })
    recordDemoTrade(trade(7))
    release?.()
    await flushing

    // The abandoned flush must not consume rows it never sent.
    expect(demoSyncSnapshot().runId).toBe('run-2')
    expect(demoSyncSnapshot().pending).toBe(1)
  })
})

describe('when the store refuses part of a batch', () => {
  it('does not close a day whose blocks the store would not take', async () => {
    // A refusal means the local chain and the stored one have parted company.
    // Closing would settle a day over trades the store never accepted.
    recordDemoTrades.mockResolvedValue({
      recorded: 0,
      duplicates: 0,
      rejected: 1,
      sealMismatches: 0,
    })

    beginDemoRun(RUN)
    recordDemoTrade(trade(1))
    await flushDemoTrades()
    expect(demoSyncSnapshot().spoiledDays).toBe(1)

    await closeDemoDay({
      simDay: 1,
      dayType: 'sunny-weekday',
      totalKwh: 1,
      totalCredit: 5.5,
      tradeCount: 1,
      closingRate: 5.5,
      compromised: false,
      invalidCount: 0,
      households: [],
    })

    expect(recordDemoDay).not.toHaveBeenCalled()
  })

  it('leaves other simulated days closable', async () => {
    recordDemoTrades.mockResolvedValueOnce({
      recorded: 0,
      duplicates: 0,
      rejected: 1,
      sealMismatches: 0,
    })

    beginDemoRun(RUN)
    recordDemoTrade(trade(1, 1))
    recordDemoTrade(trade(1, 2))
    await flushDemoTrades()

    await closeDemoDay({
      simDay: 2,
      dayType: 'sunny-weekday',
      totalKwh: 1,
      totalCredit: 5.5,
      tradeCount: 1,
      closingRate: 5.5,
      compromised: false,
      invalidCount: 0,
      households: [],
    })

    expect(recordDemoDay).toHaveBeenCalledTimes(1)
    expect(recordDemoDay.mock.calls[0][1].simDay).toBe(2)
  })
})

describe('closing a day', () => {
  const close = {
    simDay: 1,
    dayType: 'sunny-weekday' as const,
    totalKwh: 1,
    totalCredit: 5.5,
    tradeCount: 1,
    closingRate: 5.5,
    compromised: false,
    invalidCount: 0,
    households: [],
  }

  it('sends the queued trades before closing, so the totals are complete', async () => {
    const order: string[] = []
    recordDemoTrades.mockImplementation(async () => {
      order.push('trades')
      return ok()
    })
    recordDemoDay.mockImplementation(async () => {
      order.push('day')
      return { recorded: true, households: 0, totalsMatchClient: true }
    })

    beginDemoRun(RUN)
    recordDemoTrade(trade(1))
    await closeDemoDay(close)

    expect(order).toEqual(['trades', 'day'])
  })

  it('carries the run identifier the trades were recorded under', async () => {
    beginDemoRun(RUN)
    await closeDemoDay(close)

    expect(recordDemoDay.mock.calls[0][1].runId).toBe('run-1')
  })

  it('leaves the day open when its trades could not be stored', async () => {
    recordDemoTrades.mockRejectedValue(
      new ApiError({ message: 'offline', status: 0, code: 'NETWORK_ERROR' }),
    )
    beginDemoRun(RUN)
    recordDemoTrade(trade(1))
    await closeDemoDay(close)

    // Closing over an undrained queue would settle the day against figures its
    // own trades contradict, and strand those trades behind a closed day.
    expect(recordDemoDay).not.toHaveBeenCalled()
    expect(demoSyncSnapshot().pending).toBe(1)
  })

  it('closes once the queue has drained', async () => {
    beginDemoRun(RUN)
    recordDemoTrade(trade(1))
    await closeDemoDay(close)

    expect(recordDemoDay).toHaveBeenCalledTimes(1)
    expect(demoSyncSnapshot().pending).toBe(0)
  })

  it('waits for a flush already running rather than closing past it', async () => {
    let release: (() => void) | undefined
    const order: string[] = []
    recordDemoTrades.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      order.push('trades')
      return ok()
    })
    recordDemoDay.mockImplementation(async () => {
      order.push('day')
      return { recorded: true, households: 0, totalsMatchClient: true }
    })

    beginDemoRun(RUN)
    recordDemoTrade(trade(1))
    void flushDemoTrades()
    await vi.waitFor(() => expect(release).toBeDefined())

    const closing = closeDemoDay(close)
    release?.()
    await closing

    expect(order).toEqual(['trades', 'day'])
  })

  it('still closes a day that settled nothing', async () => {
    beginDemoRun(RUN)
    await closeDemoDay(close)

    expect(recordDemoDay).toHaveBeenCalledTimes(1)
  })

  it('never rejects when the close itself fails', async () => {
    recordDemoDay.mockRejectedValue(new Error('gone'))
    beginDemoRun(RUN)

    await expect(closeDemoDay(close)).resolves.toBeUndefined()
  })

it('keeps a rollup through an outage and sends it once the store returns', async () => {
    recordDemoDay.mockRejectedValue(
      new ApiError({ message: 'offline', status: 0, code: 'NETWORK_ERROR' }),
    )
    beginDemoRun(RUN)
    await closeDemoDay(close)

    // A day's conditions and closing rate cannot be recovered once lost, so a
    // rollover during an outage keeps the rollup rather than dropping it.
    expect(demoSyncSnapshot().pendingCloses).toBe(1)

    recordDemoDay.mockResolvedValue({ recorded: true, households: 0, totalsMatchClient: true })
    await flushDemoTrades()

    expect(demoSyncSnapshot().pendingCloses).toBe(0)
  })

it('holds the close until its own trades have been stored', async () => {
    recordDemoTrades.mockRejectedValue(
      new ApiError({ message: 'offline', status: 0, code: 'NETWORK_ERROR' }),
    )
    beginDemoRun(RUN)
    recordDemoTrade(trade(1))
    await closeDemoDay(close)

    // Closing now would settle the day and then have the store refuse the trade
    // still queued behind it. The rollup waits instead of being lost.
    expect(recordDemoDay).not.toHaveBeenCalled()
    expect(demoSyncSnapshot().pendingCloses).toBe(1)
    expect(demoSyncSnapshot().pending).toBe(1)

    recordDemoTrades.mockResolvedValue(ok())
    await flushDemoTrades()

    expect(recordDemoDay).toHaveBeenCalledTimes(1)
    expect(demoSyncSnapshot().pending).toBe(0)
    expect(demoSyncSnapshot().pendingCloses).toBe(0)
  })

  it('drops a rollup the store will never accept', async () => {
    recordDemoDay.mockRejectedValue(
      new ApiError({ message: 'closed', status: 409, code: 'DEMO_DAY_CLOSED' }),
    )
    beginDemoRun(RUN)
    await closeDemoDay(close)

    expect(demoSyncSnapshot().pendingCloses).toBe(0)
  })

  it('does nothing when no run is open', async () => {
    await closeDemoDay(close)
    expect(recordDemoDay).not.toHaveBeenCalled()
  })
})
