import { isApiConfigured } from '../api/config'
import { ApiError } from '../api/errors'
import {
  recordDemoDay,
  recordDemoTrades,
  type DemoHouseholdDayInput,
  type DemoTradeInput,
} from '../api/demoLedger'
import { demoSessionId } from '../utils/demoIdentity'
import type { DayType } from '../lib/simulation'

/**
 * Streams the running demo into the ledger store.
 *
 * Two rules govern everything here, and both come from the same place: this is a
 * decoration on a simulation that has to keep running.
 *
 *  - **Nothing here may fail the simulation.** Every call is fire-and-forget and
 *    every rejection is swallowed. A visitor with no network, a blocked request,
 *    or a server that has switched persistence off sees exactly the demo they
 *    would have seen before any of this existed.
 *  - **Nothing here may flood the network.** Trades settle every few seconds;
 *    posting each one would be a request every three seconds per tab. They are
 *    buffered and flushed on a timer or when the batch fills, whichever is first.
 *
 * With no `VITE_API_BASE_URL` the whole module is inert, which is what keeps the
 * browser-only build — and every existing store test — behaving as it always did.
 */

/** Trades per request. The server refuses more than this in one batch. */
const BATCH_LIMIT = 100

/** Flush once this many are waiting, rather than holding them for the timer. */
const FLUSH_AT = 25

const FLUSH_INTERVAL_MS = 5_000

/**
 * Trades held while offline before the oldest are dropped.
 *
 * A tab left running with no server would otherwise grow this array forever. The
 * store is a convenience; the simulation's own memory remains the thing on screen.
 */
const MAX_BUFFERED = 1_000

export interface DemoRunContext {
  runId: string
  dayType: DayType
  startHour: number
  simSpeed: number
}

export interface DemoDayCloseInput {
  simDay: number
  dayType: DayType
  totalKwh: number
  totalCredit: number
  tradeCount: number
  closingRate: number
  compromised: boolean
  invalidCount: number
  households: DemoHouseholdDayInput[]
}

interface BufferedTrade extends DemoTradeInput {
  simDay: number
}

interface SyncState {
  context: DemoRunContext | null
  buffer: BufferedTrade[]
  /** Day closes waiting to be sent, oldest first. */
  pendingCloses: DemoDayCloseInput[]
  /**
   * Simulated days the store refused a trade for.
   *
   * Such a day can never be completed: the refusal means the local chain and the
   * stored one have parted company, and re-sending is refused for the same
   * reason. It must therefore not be closed either — a rollup would assert a
   * settled day over trades the store never accepted.
   */
  spoiledDays: Set<number>
  timer: ReturnType<typeof setInterval> | undefined
  /** The flush currently running, so a second caller can wait for it. */
  inFlight: Promise<void> | null
  /** Set when the server says persistence is off; stops all further attempts. */
  disabled: boolean
  droppedWhileOffline: number
}

const state: SyncState = {
  context: null,
  buffer: [],
  pendingCloses: [],
  spoiledDays: new Set(),
  timer: undefined,
  inFlight: null,
  disabled: false,
  droppedWhileOffline: 0,
}

/** Whether anything is listening. False for the browser-only build. */
export function isDemoSyncEnabled(): boolean {
  return isApiConfigured() && !state.disabled
}

/**
 * True for a refusal that will not change if the same request is sent again.
 *
 * A closed day and a run owned by somebody else are both permanent for these
 * rows; retrying them forever would keep a doomed request at the head of the
 * queue and block everything behind it. A 400 means the request itself is
 * malformed, which retrying cannot fix either.
 */
function isPermanentRejection(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 409 || error.status === 400)
}

/**
 * The two ways the API says it will not be storing anything this visit: an
 * operator switched persistence off, or the database cannot run the
 * transactions these writes need. Neither changes while the tab is open.
 */
const PERMANENT_REFUSALS = new Set(['DEMO_PERSISTENCE_DISABLED', 'DEMO_PERSISTENCE_UNAVAILABLE'])

/**
 * True only for a 503 the API itself explained.
 *
 * Deliberately not every 503. A proxy in front of the API, a rolling restart, or
 * a moment of overload all answer 503 without either of the codes above, and
 * treating those as final would throw away work that a retry seconds later would
 * have stored — the one outcome this module exists to avoid.
 */
function isPersistenceDisabled(error: unknown): boolean {
  return error instanceof ApiError && error.status === 503 && PERMANENT_REFUSALS.has(error.code)
}

function startTimer(): void {
  if (state.timer !== undefined || typeof setInterval !== 'function') return
  state.timer = setInterval(() => {
    void flushDemoTrades()
  }, FLUSH_INTERVAL_MS)
}

function stopTimer(): void {
  if (state.timer !== undefined) clearInterval(state.timer)
  state.timer = undefined
}

function switchOff(): void {
  state.disabled = true
  state.buffer = []
  state.pendingCloses = []
  stopTimer()
}

/**
 * Starts a new run.
 *
 * Anything still queued belonged to the previous scenario and is dropped: it was
 * sealed against a chain that no longer exists, and the run it belonged to has
 * been abandoned. Replacing the context object is also what tells a flush
 * already in flight to stop — see `drainTrades`.
 */
export function beginDemoRun(context: DemoRunContext): void {
  state.buffer = []
  state.pendingCloses = []
  state.spoiledDays = new Set()
  state.context = context
  state.droppedWhileOffline = 0
  if (!isDemoSyncEnabled()) return
  startTimer()
}

/** Queues one settled trade. Returns immediately; never throws. */
export function recordDemoTrade(trade: BufferedTrade): void {
  if (!isDemoSyncEnabled() || !state.context) return

  state.buffer.push(trade)
  if (state.buffer.length > MAX_BUFFERED) {
    const overflow = state.buffer.length - MAX_BUFFERED
    // The dropped blocks are gone for good, so the days they belonged to can
    // never be stored whole. Marking them here is what stops one of those days
    // being closed later as though nothing were missing — the store would
    // refuse the blocks after the gap anyway, but the close could get there
    // first.
    for (const lost of state.buffer.slice(0, overflow)) state.spoiledDays.add(lost.simDay)
    state.droppedWhileOffline += overflow
    state.buffer = state.buffer.slice(overflow)
  }
  if (state.buffer.length >= FLUSH_AT) void flushDemoTrades()
}

/**
 * Sends everything buffered, oldest first, one simulated day at a time.
 *
 * Batches are grouped by day because the server seals each day's chain
 * separately, and kept in block order because a batch that skips a block is
 * refused rather than sealed onto the wrong predecessor.
 *
 * The run is re-checked after every await. A scenario reset replaces the context
 * and empties the queue, and this loop must not carry on filling requests
 * stamped with a run that has been abandoned from a buffer that now belongs to
 * its successor.
 */
async function drainTrades(context: DemoRunContext): Promise<void> {
  while (state.buffer.length > 0) {
    if (state.context !== context || !isDemoSyncEnabled()) return

    const simDay = state.buffer[0].simDay
    const forDay = state.buffer.filter((trade) => trade.simDay === simDay).slice(0, BATCH_LIMIT)
    const sending = [...forDay].sort((left, right) => left.blockId - right.blockId)

    try {
      const result = await recordDemoTrades(demoSessionId(), {
        runId: context.runId,
        dayType: context.dayType,
        startHour: context.startHour,
        simSpeed: context.simSpeed,
        simDay,
        trades: sending.map(({ simDay: _simDay, ...trade }) => trade),
      })
      // A refused block means the stored chain and this one have parted company
      // for that day. Nothing can repair it — re-sending is refused for the same
      // reason — so the day is marked and will not be closed. Leaving it open is
      // the truthful outcome.
      if (result.rejected > 0) state.spoiledDays.add(simDay)
    } catch (error) {
      if (isPersistenceDisabled(error)) {
        switchOff()
        return
      }
      if (!isPermanentRejection(error)) {
        // Transient: leave the batch queued and try again on the next flush.
        return
      }
      // Permanent: these rows will never be accepted, so the day they belong to
      // cannot be completed either.
      state.spoiledDays.add(simDay)
    }

    // Re-checked because the run may have been replaced while the request was
    // in flight, in which case this buffer is no longer the one we drained from.
    if (state.context !== context) return
    const sent = new Set(sending)
    state.buffer = state.buffer.filter((trade) => !sent.has(trade))
  }
}

/**
 * Sends the day closes waiting, oldest first.
 *
 * A close is held back until its own trades have been stored. Sending it sooner
 * would settle the day and then have the store refuse the trades still queued
 * behind it, so the rollup waits rather than the day being lost — a transient
 * outage across a rollover costs nothing but time.
 */
async function drainCloses(context: DemoRunContext): Promise<void> {
  while (state.pendingCloses.length > 0) {
    if (state.context !== context || !isDemoSyncEnabled()) return

    const close = state.pendingCloses[0]

    // Its trades have not all landed yet. Leave it queued; the flush that
    // finishes them will come back to it.
    if (state.buffer.some((trade) => trade.simDay === close.simDay)) return

    // Nothing to close over any more.
    if (state.spoiledDays.has(close.simDay)) {
      state.pendingCloses = state.pendingCloses.filter((pending) => pending !== close)
      continue
    }

    try {
      await recordDemoDay(demoSessionId(), { runId: context.runId, ...close })
    } catch (error) {
      if (isPersistenceDisabled(error)) {
        switchOff()
        return
      }
      if (!isPermanentRejection(error)) {
        // Transient: a rollover during a brief outage keeps its rollup queued and
        // the next flush sends it, rather than losing the day's conditions and
        // closing rate for good.
        return
      }
      // Permanent: the day is already closed, or belongs to another run.
    }

    if (state.context !== context) return
    state.pendingCloses = state.pendingCloses.filter((pending) => pending !== close)
  }
}

/**
 * Sends what is queued, joining a flush already running rather than racing it.
 *
 * Callers can await this and know that the attempt finished — which is what lets
 * `closeDemoDay` decide whether the day really is complete.
 */
export function flushDemoTrades(): Promise<void> {
  if (state.inFlight) return state.inFlight
  if (!isDemoSyncEnabled() || !state.context) return Promise.resolve()
  if (state.buffer.length === 0 && state.pendingCloses.length === 0) return Promise.resolve()

  const context = state.context
  const promise = (async () => {
    await drainTrades(context)
    await drainCloses(context)
  })().finally(() => {
    if (state.inFlight === promise) state.inFlight = null
  })
  state.inFlight = promise
  return promise
}

/**
 * Closes a simulated day, but only once its trades are actually stored.
 *
 * A rollup is written once and shuts the day to further trades, so closing over
 * a queue that has not drained would settle a day against figures its own trades
 * contradict — and strand those trades, which the server would then refuse for
 * belonging to a closed day. Leaving the day open instead costs the export this
 * day's conditions and closing rate and nothing else: the ledger reads totals
 * from the trades themselves either way.
 *
 * Flushed twice on purpose. The first call may only join a flush that was
 * already running and therefore predates the last few trades; the second covers
 * whatever arrived while it ran.
 */
export async function closeDemoDay(input: DemoDayCloseInput): Promise<void> {
  const context = state.context
  if (!isDemoSyncEnabled() || !context) return

  if (state.spoiledDays.has(input.simDay)) return
  if (state.pendingCloses.some((pending) => pending.simDay === input.simDay)) return

  // Queued before flushing, not after. A flush that fails transiently leaves
  // this day's trades in the buffer, and returning here without queuing the
  // rollup would store those trades on the next attempt and never close the day
  // they belong to.
  state.pendingCloses.push(input)

  await flushDemoTrades()
  await flushDemoTrades()
}

/**
 * Settles what is queued and stops the timer, keeping the run.
 *
 * Called when the simulation pauses. Anything still waiting is sent rather than
 * dropped: a visitor who pauses to look at the ledger should find the ledger
 * complete, and the run is still theirs to resume.
 */
export function pauseDemoSync(): void {
  void flushDemoTrades()
  stopTimer()
}

/** Restarts the flush timer for a run already open. */
export function resumeDemoSync(): void {
  if (!isDemoSyncEnabled() || !state.context) return
  startTimer()
}

/** Full reset, including the disabled latch. Exported for tests. */
export function resetDemoSync(): void {
  stopTimer()
  state.context = null
  state.buffer = []
  state.pendingCloses = []
  state.spoiledDays = new Set()
  state.inFlight = null
  state.disabled = false
  state.droppedWhileOffline = 0
}

/** Inspection for tests and diagnostics; not used to render anything. */
export function demoSyncSnapshot(): {
  pending: number
  pendingCloses: number
  spoiledDays: number
  disabled: boolean
  droppedWhileOffline: number
  runId: string | null
} {
  return {
    pending: state.buffer.length,
    pendingCloses: state.pendingCloses.length,
    spoiledDays: state.spoiledDays.size,
    disabled: state.disabled,
    droppedWhileOffline: state.droppedWhileOffline,
    runId: state.context?.runId ?? null,
  }
}
