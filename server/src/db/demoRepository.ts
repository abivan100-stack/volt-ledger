import { randomUUID } from 'node:crypto'
import type { ClientSession, MongoClient } from 'mongodb'
import { env } from '../config/env.js'
import type { VoltCollections } from './collections.js'
import type {
  DemoDayType,
  DemoHouseholdDayDocument,
  DemoTradeDocument,
} from './models.js'
import { GENESIS_SEAL, sealDemoTrades } from '../demo/seal.js'
import { DEMO_EXPORT_TRADE_LIMIT, TIMEFRAME_DAY_SPAN, type DemoTimeframe } from '../demo/limits.js'

/**
 * Storage for the anonymous browser demo.
 *
 * Four rules shape everything here:
 *
 *  - **The server recomputes, the client only claims.** Seals are rebuilt from
 *    the payload and day totals are summed from the trades actually stored.
 *    What the browser asserted is kept beside them for comparison, never used
 *    in its place. On a public, unauthenticated endpoint anything else would
 *    make "tamper-evident" a decoration.
 *  - **Trades are insert-only.** Nothing here updates a stored trade. Running
 *    the tamper demo changes the browser's copy and leaves the stored rows
 *    intact; the day rollup records that it happened.
 *  - **Every write is idempotent and atomic.** A flush may be retried after a
 *    dropped connection, so replaying a batch is a no-op. Writes that must agree
 *    with each other share one transaction.
 *  - **Everything expires.** `expiresAt` is set on every document, for the TTL
 *    indexes declared in `collections.ts`.
 */

/** Largest difference between a claimed and a recomputed total still called equal. */
const TOTAL_MATCH_TOLERANCE = 0.005

export interface DemoTradeInput {
  blockId: number
  clock: string
  fromName: string
  toName: string
  kwh: number
  credit: number
  rate: number
  clientSeal: string
  clientPreviousSeal: string
}

export interface RecordDemoTradesInput {
  sessionId: string
  runId: string
  dayType: DemoDayType
  startHour: number
  simSpeed: number
  simDay: number
  trades: DemoTradeInput[]
}

export interface RecordDemoTradesResult {
  recorded: number
  /** Blocks at or below the stored head; a replayed flush reports these. */
  duplicates: number
  /** Blocks refused because storing them would leave a hole in the chain. */
  rejected: number
  /** Trades whose recomputed seal disagreed with the one the browser claimed. */
  sealMismatches: number
}

export interface DemoHouseholdDayInput {
  householdId: number
  householdName: string
  generatedKwh: number
  consumedKwh: number
  exportedKwh: number
  importedKwh: number
  earnedInr: number
  spentInr: number
  tradeCount: number
  balanceInr: number
}

export interface RecordDemoDayInput {
  sessionId: string
  runId: string
  simDay: number
  dayType: DemoDayType
  totalKwh: number
  totalCredit: number
  tradeCount: number
  closingRate: number
  compromised: boolean
  invalidCount: number
  households: DemoHouseholdDayInput[]
}

export interface RecordDemoDayResult {
  /** False when this simulated day had already been closed and stored. */
  recorded: boolean
  households: number
  /** False when the browser's figures differed from the trades held at close. */
  totalsMatchClient: boolean
}

export interface DemoLedgerDay {
  runId: string
  simDay: number
  dayType: DemoDayType | null
  totalKwh: number
  totalCredit: number
  tradeCount: number
  closingRate: number | null
  compromised: boolean
  invalidCount: number
  /** True while the simulated day is still running and has no stored rollup. */
  open: boolean
  firstRecordedAt: Date
  lastRecordedAt: Date
}

export interface DemoLedgerSnapshot {
  timeframe: DemoTimeframe
  trades: DemoTradeDocument[]
  days: DemoLedgerDay[]
  totalKwh: number
  totalCredit: number
  tradeCount: number
  /** True when the timeframe held more trades than one export may read. */
  truncated: boolean
  sealMismatches: number
}

/**
 * Raised when a write names a run that belongs to a different demo session.
 *
 * Run identifiers travel in ledger responses, so one becoming known to somebody
 * else is a normal outcome rather than a breach. What must not follow from it is
 * the ability to append to, or close a day on, a run the caller does not own.
 */
export class DemoRunOwnershipError extends Error {
  constructor() {
    super('DEMO_RUN_BELONGS_TO_ANOTHER_SESSION')
    this.name = 'DemoRunOwnershipError'
  }
}

/**
 * Raised when the deployment cannot run the transaction these writes require.
 *
 * Every guarantee the demo ledger makes is a guarantee about several documents
 * agreeing: a trade and the session counter describing it, a rollup and its
 * household rows, a chain head that is still the head when the batch appending
 * to it commits. A standalone `mongod` cannot promise any of that, and no
 * amount of application code can synthesise it — a lock would have to live
 * somewhere, and the only somewhere available is the database that just said
 * no.
 *
 * So the feature declines rather than quietly offering weaker guarantees than
 * it documents. The browser treats the refusal exactly as it treats persistence
 * being switched off: it runs in memory, which it can already do perfectly well.
 */
export class DemoTransactionsUnavailableError extends Error {
  constructor() {
    super('DEMO_REQUIRES_TRANSACTIONS')
    this.name = 'DemoTransactionsUnavailableError'
  }
}

/**
 * True for the server's refusal to run a transaction outside a replica set.
 *
 * A standalone `mongod` rejects the very first transactional command with
 * IllegalOperation. Every real `MongoClient` exposes `startSession`, so the
 * shape of the client cannot answer this question; only trying can.
 */
export function isTransactionsUnsupported(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { code?: unknown; codeName?: unknown; message?: unknown }
  if (candidate.code === 20 || candidate.codeName === 'IllegalOperation') return true
  return (
    typeof candidate.message === 'string' &&
    candidate.message.includes('Transaction numbers are only allowed on a replica set member or mongos')
  )
}

/**
 * Raised when a flush arrives for a simulated day that has already been closed.
 *
 * The day rollup is written once and records the totals as they stood. Letting a
 * late trade land afterwards would leave that rollup permanently disagreeing
 * with the trades beneath it, so the trade is refused instead. The browser
 * flushes before it closes a day, so this is a retry arriving out of order
 * rather than anything it does in normal operation.
 */
export class DemoDayClosedError extends Error {
  constructor() {
    super('DEMO_DAY_ALREADY_CLOSED')
    this.name = 'DemoDayClosedError'
  }
}

export interface DemoRepository {
  recordTrades(input: RecordDemoTradesInput): Promise<RecordDemoTradesResult>
  recordDay(input: RecordDemoDayInput): Promise<RecordDemoDayResult>
  readLedger(sessionId: string, timeframe: DemoTimeframe): Promise<DemoLedgerSnapshot>
}

function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + env.DEMO_RETENTION_DAYS * 24 * 60 * 60 * 1000)
}

function roundToPaise(value: number): number {
  return Math.round(value * 100) / 100
}

/** Whether a day-close request's own figures agree with what was stored. */
function matchesClient(
  totals: TradeTotals,
  claimed: { totalKwh: number; totalCredit: number; tradeCount: number },
): boolean {
  return (
    Math.abs(roundToPaise(totals.totalKwh) - claimed.totalKwh) <= TOTAL_MATCH_TOLERANCE &&
    Math.abs(roundToPaise(totals.totalCredit) - claimed.totalCredit) <= TOTAL_MATCH_TOLERANCE &&
    totals.tradeCount === claimed.tradeCount
  )
}

interface RunSettings {
  dayType: DemoDayType
  startHour: number
  simSpeed: number
}

interface TradeTotals {
  tradeCount: number
  totalKwh: number
  totalCredit: number
}

/** One simulated day's worth of trades, as the grouping stage reports it. */
interface DayGroup {
  _id: { runId: string; simDay: number }
  tradeCount: number
  totalKwh: number
  totalCredit: number
  sealMismatches: number
  firstRecordedAt: Date
  lastRecordedAt: Date
}

export function createDemoRepository(
  collections: VoltCollections,
  client: MongoClient,
): DemoRepository {
  const { demoSessions, demoRuns, demoTrades, demoDays, demoHouseholdDays } = collections

  // Learned on the first write and remembered: a deployment does not gain or
  // lose transaction support while the process is running.
  let transactional: boolean | null = null

  /**
   * Runs `work` inside a transaction, or refuses.
   *
   * Every demo write touches several collections that must agree, so a partial
   * commit would leave figures that never converge and a chain that cannot be
   * trusted. A replica set — any Atlas cluster — provides that. A standalone
   * server does not, and there is no honest halfway: rather than run these
   * writes without the atomicity their guarantees are stated in terms of, the
   * deployment is declined and the browser keeps its simulation in memory.
   *
   * Which case applies cannot be read off the client, since every real
   * `MongoClient` exposes `startSession` either way. It is learned by trying
   * once, and remembered.
   */
  async function inTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    if (transactional === false || typeof client?.startSession !== 'function') {
      throw new DemoTransactionsUnavailableError()
    }

    const session = client.startSession()
    try {
      let result: T | undefined
      await session.withTransaction(async () => {
        result = await work(session)
      })
      transactional = true
      return result as T
    } catch (error) {
      if (!isTransactionsUnsupported(error)) throw error
      transactional = false
      throw new DemoTransactionsUnavailableError()
    } finally {
      await session.endSession()
    }
  }

  /**
   * Refuses a write whose run belongs to somebody else.
   *
   * Checked before anything is read or written, so a caller naming another
   * session's run learns nothing about it beyond the refusal.
   */
  async function assertRunOwnership(
    sessionId: string,
    runId: string,
    session: ClientSession,
  ): Promise<void> {
    const run = await demoRuns.findOne({ _id: runId }, { projection: { sessionId: 1 }, session })
    if (run && run.sessionId !== sessionId) throw new DemoRunOwnershipError()
  }

  /**
   * Claims the run for this write, and is the point every write agrees on.
   *
   * Called first by both paths, before a trade is inserted or a day is closed.
   * That ordering is the whole purpose: appending to a run and closing a day on
   * it touch otherwise disjoint documents, and two transactions sharing no
   * document do not conflict — both could read the day as open and both commit.
   * Writing this one row first makes them contend, so one aborts and retries
   * against what the other actually committed.
   */
  async function claimRun(
    sessionId: string,
    runId: string,
    settings: RunSettings,
    now: Date,
    session: ClientSession,
  ): Promise<void> {
    await demoRuns.updateOne(
      { _id: runId, sessionId },
      {
        $setOnInsert: { startedAt: now },
        $set: { sessionId, ...settings, lastSeenAt: now, expiresAt: expiryFrom(now) },
      },
      { upsert: true, session },
    )
  }

  /**
   * Brings the session row up to date once the write has landed.
   *
   * The counters are counted rather than incremented. Incrementing is cheaper
   * but only correct while every increment lands exactly once, and on a
   * standalone server — where these writes cannot share a transaction — a
   * failure between storing rows and adjusting counters would leave a total that
   * never recovers, because the retry sees the rows as duplicates and adds
   * nothing. Counting from the rows themselves is right on both paths and
   * self-corrects if anything ever did go missing.
   */
  async function refreshSession(
    sessionId: string,
    now: Date,
    session: ClientSession,
  ): Promise<void> {
    const [runCount, tradeCount, dayCount] = await Promise.all([
      demoRuns.countDocuments({ sessionId }, { session }),
      demoTrades.countDocuments({ sessionId }, { session }),
      demoDays.countDocuments({ sessionId }, { session }),
    ])

    await demoSessions.updateOne(
      { _id: sessionId },
      {
        $setOnInsert: { createdAt: now },
        $set: { lastSeenAt: now, expiresAt: expiryFrom(now), runCount, tradeCount, dayCount },
      },
      { upsert: true, session },
    )
  }

  /** Sums what is actually stored for one simulated day. */
  async function storedTotals(
    sessionId: string,
    runId: string,
    simDay: number,
    session: ClientSession,
  ): Promise<TradeTotals> {
    const [totals] = await demoTrades
      .aggregate<TradeTotals>(
        [
          { $match: { sessionId, runId, simDay } },
          {
            $group: {
              _id: null,
              tradeCount: { $sum: 1 },
              totalKwh: { $sum: '$kwh' },
              totalCredit: { $sum: '$credit' },
            },
          },
          { $project: { _id: 0, tradeCount: 1, totalKwh: 1, totalCredit: 1 } },
        ],
        { session },
      )
      .toArray()

    return totals ?? { tradeCount: 0, totalKwh: 0, totalCredit: 0 }
  }

  return {
    async recordTrades(input) {
      return inTransaction(async (session) => {
        const now = new Date()
        await assertRunOwnership(input.sessionId, input.runId, session)

        const settings: RunSettings = {
          dayType: input.dayType,
          startHour: input.startHour,
          simSpeed: input.simSpeed,
        }
        // Claimed before the day is read, so a close racing this flush contends
        // on the run row rather than passing straight through beside it.
        await claimRun(input.sessionId, input.runId, settings, now, session)

        // A day whose rollup exists is settled, and settlement is once. The
        // rollup stores no totals to be stranded — the ledger sums the trades on
        // every read — but a day that closed and then kept growing is not a day
        // that closed.
        const closed = await demoDays.findOne(
          { sessionId: input.sessionId, runId: input.runId, simDay: input.simDay },
          { projection: { _id: 1 }, session },
        )
        if (closed) throw new DemoDayClosedError()

        const last = await demoTrades.findOne(
          { sessionId: input.sessionId, runId: input.runId, simDay: input.simDay },
          { sort: { blockId: -1 }, projection: { blockId: 1, serverSeal: 1 }, session },
        )
        const lastBlockId = last?.blockId ?? 0
        const previousSeal = last?.serverSeal ?? GENESIS_SEAL

        const ordered = [...input.trades].sort((a, b) => a.blockId - b.blockId)
        const ahead = ordered.filter((trade) => trade.blockId > lastBlockId)
        const duplicates = ordered.length - ahead.length

        // Only a run of blocks that continues the chain exactly is stored. A
        // batch starting past `lastBlockId + 1` would seal onto a predecessor
        // that is not its own, so it is refused rather than silently accepted
        // with a hole in it.
        const contiguous: DemoTradeInput[] = []
        let expected = lastBlockId + 1
        for (const trade of ahead) {
          if (trade.blockId !== expected) break
          contiguous.push(trade)
          expected += 1
        }
        const rejected = ahead.length - contiguous.length

        if (contiguous.length === 0) {
          await refreshSession(input.sessionId, now, session)
          return { recorded: 0, duplicates, rejected, sealMismatches: 0 }
        }

        const expiresAt = expiryFrom(now)
        const documents: DemoTradeDocument[] = sealDemoTrades(contiguous, previousSeal).map(
          ({ trade, previousSeal: prior, seal }) => ({
            _id: randomUUID(),
            sessionId: input.sessionId,
            runId: input.runId,
            simDay: input.simDay,
            blockId: trade.blockId,
            clock: trade.clock,
            fromName: trade.fromName,
            toName: trade.toName,
            kwh: trade.kwh,
            credit: trade.credit,
            rate: trade.rate,
            clientSeal: trade.clientSeal,
            clientPreviousSeal: trade.clientPreviousSeal,
            serverSeal: seal,
            serverPreviousSeal: prior,
            sealMatchesClient: trade.clientSeal === seal,
            recordedAt: now,
            expiresAt,
          }),
        )

        // Ordered, so a collision stops the batch at the offending block rather
        // than scattering rows around it. Inside a transaction the whole insert
        // rolls back and the retry re-reads the head.
        await demoTrades.insertMany(documents, { ordered: true, session })

        await refreshSession(input.sessionId, now, session)

        return {
          recorded: documents.length,
          duplicates,
          rejected,
          sealMismatches: documents.filter((document) => !document.sealMatchesClient).length,
        }
      })
    },

    async recordDay(input) {
      return inTransaction(async (session) => {
        const now = new Date()
        await assertRunOwnership(input.sessionId, input.runId, session)

        // Speed and start hour are not part of a day-close payload, so they are
        // read back rather than overwritten with placeholders.
        const run = await demoRuns.findOne(
          { _id: input.runId, sessionId: input.sessionId },
          { projection: { startHour: 1, simSpeed: 1 }, session },
        )
        // The same claim the trade path makes, for the same reason.
        await claimRun(
          input.sessionId,
          input.runId,
          {
            dayType: input.dayType,
            startHour: run?.startHour ?? 0,
            simSpeed: run?.simSpeed ?? 0,
          },
          now,
          session,
        )

        const expiresAt = expiryFrom(now)

        // A day is closed exactly once, and a repeat writes nothing at all —
        // not the rollup, and not household rows either. Storing a household on
        // a second close would let a caller keep appending to a settled day
        // through a payload the first close did not mention.
        //
        // This can be a plain check because the whole close is one transaction:
        // the rollup and its household rows land together or not at all, so
        // there is no half-written day for a retry to have to finish.
        const alreadyClosed = await demoDays.findOne(
          { sessionId: input.sessionId, runId: input.runId, simDay: input.simDay },
          { session },
        )
        if (alreadyClosed) {
          await refreshSession(input.sessionId, now, session)
          return {
            recorded: false,
            households: 0,
            totalsMatchClient: alreadyClosed.totalsMatchedClientAtClose,
          }
        }

        let households = 0
        if (input.households.length > 0) {
          const documents: DemoHouseholdDayDocument[] = input.households.map((household) => ({
            _id: randomUUID(),
            sessionId: input.sessionId,
            runId: input.runId,
            simDay: input.simDay,
            ...household,
            recordedAt: now,
            expiresAt,
          }))
          await demoHouseholdDays.insertMany(documents, { ordered: true, session })
          households = documents.length
        }

        // Compared, not stored. The comparison is the useful part — a browser
        // whose figures disagree with the ledger is worth knowing about — while
        // the totals themselves are summed from the trades on every read.
        const totals = await storedTotals(input.sessionId, input.runId, input.simDay, session)
        const totalsMatchClient = matchesClient(totals, input)

        // Still an upsert rather than an insert: two closes racing each other
        // both read no rollup, and the loser must report "already closed"
        // rather than fail on the unique index.
        const result = await demoDays.updateOne(
          { sessionId: input.sessionId, runId: input.runId, simDay: input.simDay },
          {
            $setOnInsert: {
              _id: randomUUID(),
              sessionId: input.sessionId,
              runId: input.runId,
              simDay: input.simDay,
              dayType: input.dayType,
              clientTotalKwh: input.totalKwh,
              clientTotalCredit: input.totalCredit,
              clientTradeCount: input.tradeCount,
              totalsMatchedClientAtClose: totalsMatchClient,
              closingRate: input.closingRate,
              compromised: input.compromised,
              invalidCount: input.invalidCount,
              closedAt: now,
              expiresAt,
            },
          },
          { upsert: true, session },
        )
        const recorded = result.upsertedCount === 1

        await refreshSession(input.sessionId, now, session)

        return { recorded, households, totalsMatchClient }
      })
    },

    async readLedger(sessionId, timeframe) {
      // Which simulated days the timeframe covers comes from both sides: the
      // trades, so a day still in progress counts before it has a rollup, and
      // the rollups, so a day that closed without a single eligible trade — a
      // run started overnight, say — is still a day that happened rather than
      // one the export silently skips.
      const span = TIMEFRAME_DAY_SPAN[timeframe]
      const grouped = await demoTrades
        .aggregate<DayGroup>([
          { $match: { sessionId } },
          {
            $group: {
              _id: { runId: '$runId', simDay: '$simDay' },
              tradeCount: { $sum: 1 },
              totalKwh: { $sum: '$kwh' },
              totalCredit: { $sum: '$credit' },
              // Counted here rather than over the returned page: an export that
              // hit the row limit would otherwise report fewer mismatches than
              // the timeframe actually holds, which is the one number nobody
              // should learn about only by reading every row.
              sealMismatches: {
                $sum: { $cond: [{ $eq: ['$sealMatchesClient', false] }, 1, 0] },
              },
              firstRecordedAt: { $min: '$recordedAt' },
              lastRecordedAt: { $max: '$recordedAt' },
            },
          },
        ])
        .toArray()

      const rollups = await demoDays.find({ sessionId }).toArray()
      const rollupByKey = new Map(
        rollups.map((rollup) => [`${rollup.runId}:${rollup.simDay}`, rollup]),
      )

      // Union of both, keyed by the simulated day, ordered by whichever record
      // of it is the most recent.
      const byKey = new Map<string, DayGroup>()
      for (const group of grouped) {
        byKey.set(`${group._id.runId}:${group._id.simDay}`, group)
      }
      for (const rollup of rollups) {
        const key = `${rollup.runId}:${rollup.simDay}`
        if (byKey.has(key)) continue
        byKey.set(key, {
          _id: { runId: rollup.runId, simDay: rollup.simDay },
          tradeCount: 0,
          totalKwh: 0,
          totalCredit: 0,
          sealMismatches: 0,
          firstRecordedAt: rollup.closedAt,
          lastRecordedAt: rollup.closedAt,
        })
      }

      const ordered = [...byKey.values()].sort(
        (a, b) => b.lastRecordedAt.getTime() - a.lastRecordedAt.getTime(),
      )
      const selected = span === null ? ordered : ordered.slice(0, span)

      if (selected.length === 0) {
        return {
          timeframe,
          trades: [],
          days: [],
          totalKwh: 0,
          totalCredit: 0,
          tradeCount: 0,
          truncated: false,
          sealMismatches: 0,
        }
      }

      const keys = selected.map((group) => ({ runId: group._id.runId, simDay: group._id.simDay }))
      const tradeCount = selected.reduce((total, group) => total + group.tradeCount, 0)

      const trades = await demoTrades
        .find({ sessionId, $or: keys })
        .sort({ recordedAt: 1, runId: 1, simDay: 1, blockId: 1 })
        .limit(DEMO_EXPORT_TRADE_LIMIT)
        .toArray()

      // Totals come from the grouped trades in every case. A stored rollup adds
      // the things trades cannot show — the day type, the closing rate, whether
      // the visitor tampered — but never replaces a figure that can be summed.
      const days: DemoLedgerDay[] = selected
        .map((group) => {
          const rollup = rollupByKey.get(`${group._id.runId}:${group._id.simDay}`)
          return {
            runId: group._id.runId,
            simDay: group._id.simDay,
            dayType: rollup?.dayType ?? null,
            totalKwh: roundToPaise(group.totalKwh),
            totalCredit: roundToPaise(group.totalCredit),
            tradeCount: group.tradeCount,
            closingRate: rollup?.closingRate ?? null,
            compromised: rollup?.compromised ?? false,
            invalidCount: rollup?.invalidCount ?? 0,
            open: rollup === undefined,
            firstRecordedAt: group.firstRecordedAt,
            lastRecordedAt: group.lastRecordedAt,
          }
        })
        .sort((a, b) => a.lastRecordedAt.getTime() - b.lastRecordedAt.getTime())

      return {
        timeframe,
        trades,
        days,
        totalKwh: roundToPaise(days.reduce((total, day) => total + day.totalKwh, 0)),
        totalCredit: roundToPaise(days.reduce((total, day) => total + day.totalCredit, 0)),
        tradeCount,
        truncated: tradeCount > trades.length,
        sealMismatches: selected.reduce((total, group) => total + group.sealMismatches, 0),
      }
    },
  }
}
