import { expect, it } from 'vitest'
import { GENESIS_SEAL, sealDemoTrade } from '../../demo/seal.js'
import { DemoDayClosedError, DemoRunOwnershipError } from '../demoRepository.js'
import type { DemoTradeInput, RecordDemoTradesInput } from '../demoRepository.js'
import { describeIntegration } from './runner.js'

/**
 * The demo ledger against a real MongoDB.
 *
 * These cases exist here rather than as unit tests on purpose. The behaviour
 * worth guarding — a unique index refusing a replay, a transaction aborting a
 * flush that raced another, an aggregation summing what was really stored — is
 * behaviour of the database. A collection double would agree with whatever the
 * repository asked it to believe and prove nothing.
 */

const SESSION = 'session-11111111-1111-4111-8111-111111111111'
const RUN = 'run-22222222-2222-4222-8222-222222222222'

function tradeInput(blockId: number, overrides: Partial<DemoTradeInput> = {}): DemoTradeInput {
  return {
    blockId,
    clock: `1${blockId}:00`,
    fromName: 'Pranav P',
    toName: 'Abivan',
    kwh: 1.0,
    credit: 5.5,
    rate: 5.5,
    clientSeal: 'unverified',
    clientPreviousSeal: 'unverified',
    ...overrides,
  }
}

function batch(trades: DemoTradeInput[], overrides: Partial<RecordDemoTradesInput> = {}): RecordDemoTradesInput {
  return {
    sessionId: SESSION,
    runId: RUN,
    dayType: 'sunny-weekday',
    startHour: 8,
    simSpeed: 4,
    simDay: 1,
    trades,
    ...overrides,
  }
}

/** Re-derives the whole stored chain and reports where it first breaks. */
function verifyChain(
  trades: Array<{ blockId: number; clock: string; fromName: string; toName: string; kwh: number; credit: number; serverSeal: string; serverPreviousSeal: string }>,
): { contiguous: boolean; linked: boolean } {
  let previous = GENESIS_SEAL
  let contiguous = true
  let linked = true

  trades.forEach((trade, index) => {
    if (trade.blockId !== index + 1) contiguous = false
    if (trade.serverPreviousSeal !== previous) linked = false
    if (trade.serverSeal !== sealDemoTrade(previous, trade)) linked = false
    previous = trade.serverSeal
  })

  return { contiguous, linked }
}

describeIntegration('demo ledger', (suite) => {
  async function storedTrades(runId = RUN, simDay = 1) {
    return suite.collections().demoTrades.find({ runId, simDay }).sort({ blockId: 1 }).toArray()
  }

  it('seals a batch from the genesis root and links each trade to the one before', async () => {
    const result = await suite.repositories().demo.recordTrades(
      batch([tradeInput(1), tradeInput(2), tradeInput(3)]),
    )

    expect(result.recorded).toBe(3)
    expect(result.rejected).toBe(0)
    expect(result.duplicates).toBe(0)

    const trades = await storedTrades()
    expect(trades).toHaveLength(3)
    expect(trades[0].serverPreviousSeal).toBe(GENESIS_SEAL)
    expect(verifyChain(trades)).toEqual({ contiguous: true, linked: true })
  })

  it('continues the chain across separate flushes instead of restarting it', async () => {
    await suite.repositories().demo.recordTrades(batch([tradeInput(1), tradeInput(2)]))
    await suite.repositories().demo.recordTrades(batch([tradeInput(3), tradeInput(4)]))

    const trades = await storedTrades()
    expect(trades).toHaveLength(4)
    expect(trades[2].serverPreviousSeal).toBe(trades[1].serverSeal)
    expect(verifyChain(trades)).toEqual({ contiguous: true, linked: true })
  })

  it('records whether the stored seal agreed with the one the browser claimed', async () => {
    const honest = tradeInput(1)
    const honestSeal = sealDemoTrade(GENESIS_SEAL, honest)

    await suite.repositories().demo.recordTrades(
      batch([
        { ...honest, clientSeal: honestSeal, clientPreviousSeal: GENESIS_SEAL },
        tradeInput(2, { clientSeal: 'a-seal-the-server-will-not-agree-with' }),
      ]),
    )

    const trades = await storedTrades()
    expect(trades[0].sealMatchesClient).toBe(true)
    expect(trades[1].sealMatchesClient).toBe(false)
    // The mismatch is recorded, not corrected: the stored chain stays valid.
    expect(verifyChain(trades)).toEqual({ contiguous: true, linked: true })
  })

  it('treats a replayed flush as a no-op rather than a duplicate row', async () => {
    const first = batch([tradeInput(1), tradeInput(2)])
    await suite.repositories().demo.recordTrades(first)
    const replay = await suite.repositories().demo.recordTrades(first)

    expect(replay.recorded).toBe(0)
    expect(replay.duplicates).toBe(2)
    expect(await storedTrades()).toHaveLength(2)
  })

  it('refuses a batch that would leave a hole in the chain', async () => {
    await suite.repositories().demo.recordTrades(batch([tradeInput(1)]))
    const result = await suite.repositories().demo.recordTrades(
      batch([tradeInput(5), tradeInput(6)]),
    )

    expect(result.recorded).toBe(0)
    expect(result.rejected).toBe(2)
    expect(await storedTrades()).toHaveLength(1)
  })

  it('stores the contiguous run of a batch and refuses the rest', async () => {
    const result = await suite.repositories().demo.recordTrades(
      batch([tradeInput(1), tradeInput(2), tradeInput(7)]),
    )

    expect(result.recorded).toBe(2)
    expect(result.rejected).toBe(1)
    expect(verifyChain(await storedTrades())).toEqual({ contiguous: true, linked: true })
  })

  it('keeps the chain intact when two flushes race', async () => {
    if (!suite.supportsTransactions()) return

    // Both batches read the same head and claim the same block numbers. One must
    // win outright; a partial interleave would leave two trades sealed onto the
    // same predecessor.
    const results = await Promise.allSettled([
      suite.repositories().demo.recordTrades(batch([tradeInput(1), tradeInput(2)])),
      suite.repositories().demo.recordTrades(batch([tradeInput(1), tradeInput(2)])),
    ])

    const trades = await storedTrades()
    expect(trades).toHaveLength(2)
    expect(verifyChain(trades)).toEqual({ contiguous: true, linked: true })
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true)
  })

  it('reports totals summed from the trades, not the ones the request claimed', async () => {
    await suite.repositories().demo.recordTrades(
      batch([
        tradeInput(1, { kwh: 1.0, credit: 5.5 }),
        tradeInput(2, { kwh: 0.5, credit: 2.75 }),
      ]),
    )

    const result = await suite.repositories().demo.recordDay({
      sessionId: SESSION,
      runId: RUN,
      simDay: 1,
      dayType: 'sunny-weekday',
      totalKwh: 999,
      totalCredit: 999,
      tradeCount: 999,
      closingRate: 5.5,
      compromised: false,
      invalidCount: 0,
      households: [],
    })

    expect(result.recorded).toBe(true)
    expect(result.totalsMatchClient).toBe(false)

    // The rollup keeps no totals of its own — there is no second copy that
    // could ever disagree with the trades. What it keeps is the claim, and the
    // verdict on it at the moment the day closed.
    const day = await suite.collections().demoDays.findOne({ runId: RUN, simDay: 1 })
    expect(day?.clientTotalKwh).toBe(999)
    expect(day?.totalsMatchedClientAtClose).toBe(false)

    // The figures an export actually reads are summed from the trades.
    const snapshot = await suite.repositories().demo.readLedger(SESSION, 'all')
    expect(snapshot.days[0].totalKwh).toBe(1.5)
    expect(snapshot.days[0].totalCredit).toBe(8.25)
    expect(snapshot.days[0].tradeCount).toBe(2)
  })

  it('counts a trade that lands while a day is closing', async () => {
    // The one ordering a stored total could not survive: the day closes, and a
    // flush already in flight commits behind it. Nothing is stale, because
    // nothing was stored to go stale — the ledger sums the trades on every read.
    await suite.repositories().demo.recordTrades(batch([tradeInput(1, { kwh: 1, credit: 5 })]))
    await suite.repositories().demo.recordDay({
      sessionId: SESSION,
      runId: RUN,
      simDay: 1,
      dayType: 'sunny-weekday',
      totalKwh: 1,
      totalCredit: 5,
      tradeCount: 1,
      closingRate: 5,
      compromised: false,
      invalidCount: 0,
      households: [],
    })

    // Simulating the late arrival directly, since the repository now refuses it.
    await suite.collections().demoTrades.insertOne({
      _id: 'late-trade',
      sessionId: SESSION,
      runId: RUN,
      simDay: 1,
      blockId: 2,
      clock: '15:00',
      fromName: 'Pranav P',
      toName: 'Abivan',
      kwh: 2,
      credit: 10,
      rate: 5,
      clientSeal: 'x',
      clientPreviousSeal: 'y',
      serverSeal: 'z',
      serverPreviousSeal: 'y',
      sealMatchesClient: false,
      recordedAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
    })

    const snapshot = await suite.repositories().demo.readLedger(SESSION, 'all')
    expect(snapshot.days[0].tradeCount).toBe(2)
    expect(snapshot.days[0].totalKwh).toBe(3)
    expect(snapshot.totalCredit).toBe(15)
  })

  it('accepts totals that agree with the stored trades', async () => {
    await suite.repositories().demo.recordTrades(batch([tradeInput(1, { kwh: 1.25, credit: 6.5 })]))

    const result = await suite.repositories().demo.recordDay({
      sessionId: SESSION,
      runId: RUN,
      simDay: 1,
      dayType: 'sunny-weekday',
      totalKwh: 1.25,
      totalCredit: 6.5,
      tradeCount: 1,
      closingRate: 5.2,
      compromised: false,
      invalidCount: 0,
      households: [],
    })

    expect(result.totalsMatchClient).toBe(true)
  })

  it('never strands household rows when a day close is repeated', async () => {
    const households = [
      {
        householdId: 0,
        householdName: 'Nikil Sundaram',
        generatedKwh: 12.5,
        consumedKwh: 8.25,
        exportedKwh: 4.25,
        importedKwh: 0,
        earnedInr: 23.4,
        spentInr: 0,
        tradeCount: 3,
        balanceInr: 1263.8,
      },
    ]
    const close = {
      sessionId: SESSION,
      runId: RUN,
      simDay: 1,
      dayType: 'sunny-weekday' as const,
      totalKwh: 0,
      totalCredit: 0,
      tradeCount: 0,
      closingRate: 5.5,
      compromised: false,
      invalidCount: 0,
      households,
    }

    const first = await suite.repositories().demo.recordDay(close)
    const second = await suite.repositories().demo.recordDay(close)

    expect(first.recorded).toBe(true)
    expect(first.households).toBe(1)
    // The rollup is written once; the household rows are not lost to the retry.
    expect(second.recorded).toBe(false)
    expect(second.households).toBe(0)
    expect(await suite.collections().demoHouseholdDays.countDocuments({ runId: RUN })).toBe(1)
  })

  it('writes nothing at all when a closed day is closed again', async () => {
    const close = {
      sessionId: SESSION,
      runId: RUN,
      simDay: 1,
      dayType: 'sunny-weekday' as const,
      totalKwh: 0,
      totalCredit: 0,
      tradeCount: 0,
      closingRate: 5.5,
      compromised: false,
      invalidCount: 0,
      households: [
        {
          householdId: 0,
          householdName: 'Nikil Sundaram',
          generatedKwh: 1,
          consumedKwh: 1,
          exportedKwh: 0,
          importedKwh: 0,
          earnedInr: 0,
          spentInr: 0,
          tradeCount: 0,
          balanceInr: 0,
        },
      ],
    }

    await suite.repositories().demo.recordDay(close)

    // A second close naming a household the first never mentioned must not be
    // able to append to a settled day through the back door.
    const second = await suite.repositories().demo.recordDay({
      ...close,
      households: [{ ...close.households[0], householdId: 7, householdName: 'Someone new' }],
    })

    expect(second.recorded).toBe(false)
    expect(second.households).toBe(0)
    const stored = await suite.collections().demoHouseholdDays.find({ runId: RUN }).toArray()
    expect(stored).toHaveLength(1)
    expect(stored[0].householdId).toBe(0)
  })

  it('records the tamper flags a day close reports without touching the stored trades', async () => {
    await suite.repositories().demo.recordTrades(batch([tradeInput(1)]))
    const before = await storedTrades()

    await suite.repositories().demo.recordDay({
      sessionId: SESSION,
      runId: RUN,
      simDay: 1,
      dayType: 'sunny-weekday',
      totalKwh: 1,
      totalCredit: 5.5,
      tradeCount: 1,
      closingRate: 5.5,
      compromised: true,
      invalidCount: 1,
      households: [],
    })

    const day = await suite.collections().demoDays.findOne({ runId: RUN, simDay: 1 })
    expect(day?.compromised).toBe(true)
    expect(day?.invalidCount).toBe(1)
    expect(await storedTrades()).toEqual(before)
  })

  it('counts runs, days and trades on the session as they are stored', async () => {
    await suite.repositories().demo.recordTrades(batch([tradeInput(1), tradeInput(2)]))
    await suite.repositories().demo.recordDay({
      sessionId: SESSION,
      runId: RUN,
      simDay: 1,
      dayType: 'sunny-weekday',
      totalKwh: 1.5,
      totalCredit: 11,
      tradeCount: 2,
      closingRate: 5.5,
      compromised: false,
      invalidCount: 0,
      households: [],
    })

    const session = await suite.collections().demoSessions.findOne({ _id: SESSION })
    expect(session?.runCount).toBe(1)
    expect(session?.tradeCount).toBe(2)
    expect(session?.dayCount).toBe(1)
  })

  it('selects simulated days by timeframe, newest first', async () => {
    // Three simulated days, recorded in order.
    for (const simDay of [1, 2, 3]) {
      await suite.repositories().demo.recordTrades(
        batch([tradeInput(1, { kwh: simDay, credit: simDay })], { simDay }),
      )
    }

    const today = await suite.repositories().demo.readLedger(SESSION, 'today')
    expect(today.days.map((day) => day.simDay)).toEqual([3])
    expect(today.totalKwh).toBe(3)

    const all = await suite.repositories().demo.readLedger(SESSION, 'all')
    expect(all.days.map((day) => day.simDay)).toEqual([1, 2, 3])
    expect(all.totalKwh).toBe(6)
    expect(all.tradeCount).toBe(3)
    expect(all.truncated).toBe(false)
  })

  it('marks a simulated day still in progress as open', async () => {
    await suite.repositories().demo.recordTrades(batch([tradeInput(1)]))

    const open = await suite.repositories().demo.readLedger(SESSION, 'all')
    expect(open.days[0].open).toBe(true)
    expect(open.days[0].dayType).toBeNull()

    await suite.repositories().demo.recordDay({
      sessionId: SESSION,
      runId: RUN,
      simDay: 1,
      dayType: 'heatwave',
      totalKwh: 1,
      totalCredit: 5.5,
      tradeCount: 1,
      closingRate: 6.1,
      compromised: false,
      invalidCount: 0,
      households: [],
    })

    const closed = await suite.repositories().demo.readLedger(SESSION, 'all')
    expect(closed.days[0].open).toBe(false)
    expect(closed.days[0].dayType).toBe('heatwave')
    expect(closed.days[0].closingRate).toBe(6.1)
  })

  it('includes a simulated day that closed without a single trade', async () => {
    // A run started overnight settles nothing. The day still happened, and an
    // export that skipped it would misreport how long the neighbourhood ran.
    await suite.repositories().demo.recordDay({
      sessionId: SESSION,
      runId: RUN,
      simDay: 1,
      dayType: 'cloudy',
      totalKwh: 0,
      totalCredit: 0,
      tradeCount: 0,
      closingRate: 5.5,
      compromised: false,
      invalidCount: 0,
      households: [],
    })

    const snapshot = await suite.repositories().demo.readLedger(SESSION, 'all')
    expect(snapshot.days).toHaveLength(1)
    expect(snapshot.days[0].simDay).toBe(1)
    expect(snapshot.days[0].dayType).toBe('cloudy')
    expect(snapshot.days[0].tradeCount).toBe(0)
    expect(snapshot.days[0].open).toBe(false)
    expect(snapshot.trades).toEqual([])
  })

  it('counts a tradeless closed day against the timeframe', async () => {
    await suite.repositories().demo.recordDay({
      sessionId: SESSION,
      runId: RUN,
      simDay: 1,
      dayType: 'cloudy',
      totalKwh: 0,
      totalCredit: 0,
      tradeCount: 0,
      closingRate: 5.5,
      compromised: false,
      invalidCount: 0,
      households: [],
    })
    await suite.repositories().demo.recordTrades(batch([tradeInput(1)], { simDay: 2 }))

    // Two days exist; "today" must resolve to the later one, not step over the
    // tradeless day as though it were not there.
    const today = await suite.repositories().demo.readLedger(SESSION, 'today')
    expect(today.days.map((day) => day.simDay)).toEqual([2])

    const all = await suite.repositories().demo.readLedger(SESSION, 'all')
    expect(all.days.map((day) => day.simDay)).toEqual([1, 2])
  })

  it('returns an empty snapshot for a session that has never written', async () => {
    const snapshot = await suite.repositories().demo.readLedger('session-unknown', 'all')

    expect(snapshot.trades).toEqual([])
    expect(snapshot.days).toEqual([])
    expect(snapshot.tradeCount).toBe(0)
    expect(snapshot.truncated).toBe(false)
  })

  it('refuses a trade that arrives after its simulated day was closed', async () => {
    await suite.repositories().demo.recordTrades(batch([tradeInput(1)]))
    await suite.repositories().demo.recordDay({
      sessionId: SESSION,
      runId: RUN,
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

    // The rollup recorded one trade. A second landing now would leave it
    // permanently disagreeing with what sits underneath it.
    await expect(
      suite.repositories().demo.recordTrades(batch([tradeInput(2)])),
    ).rejects.toBeInstanceOf(DemoDayClosedError)

    expect(await storedTrades()).toHaveLength(1)
  })

  it('refuses to append to a run owned by another session', async () => {
    await suite.repositories().demo.recordTrades(batch([tradeInput(1)]))

    // Run identifiers travel in ledger responses, so another session learning
    // one is ordinary. Being able to write to it would not be.
    await expect(
      suite.repositories().demo.recordTrades(
        batch([tradeInput(2)], { sessionId: 'session-99999999-9999-4999-8999-999999999999' }),
      ),
    ).rejects.toBeInstanceOf(DemoRunOwnershipError)

    expect(await storedTrades()).toHaveLength(1)
  })

  it('refuses to close a day on a run owned by another session', async () => {
    await suite.repositories().demo.recordTrades(batch([tradeInput(1)]))

    await expect(
      suite.repositories().demo.recordDay({
        sessionId: 'session-99999999-9999-4999-8999-999999999999',
        runId: RUN,
        simDay: 1,
        dayType: 'sunny-weekday',
        totalKwh: 1,
        totalCredit: 5.5,
        tradeCount: 1,
        closingRate: 5.5,
        compromised: true,
        invalidCount: 99,
        households: [],
      }),
    ).rejects.toBeInstanceOf(DemoRunOwnershipError)

    expect(await suite.collections().demoDays.countDocuments({ runId: RUN })).toBe(0)
  })

  it('keeps each session isolated from every other', async () => {
    await suite.repositories().demo.recordTrades(batch([tradeInput(1)]))
    await suite.repositories().demo.recordTrades(
      batch([tradeInput(1)], {
        sessionId: 'session-33333333-3333-4333-8333-333333333333',
        runId: 'run-44444444-4444-4444-8444-444444444444',
      }),
    )

    const mine = await suite.repositories().demo.readLedger(SESSION, 'all')
    expect(mine.tradeCount).toBe(1)
    expect(mine.trades.every((trade) => trade.sessionId === SESSION)).toBe(true)
  })
})
