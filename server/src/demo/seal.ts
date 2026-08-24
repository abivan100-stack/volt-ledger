import { createHash } from 'node:crypto'

/**
 * The server's own re-computation of the demo ledger's hash chain.
 *
 * The browser seals each trade in `src/lib/hashChain.ts` before sending it. If
 * the server simply stored the hash it was handed, "tamper-evident" would mean
 * nothing at the database layer: anyone posting to the public demo endpoint
 * could claim any seal. So the seal is recomputed here from the payload alone
 * and the client's value is kept only for comparison.
 *
 * The algorithm is a deliberate, verbatim port of `hashChain.ts` — same field
 * order, same two-decimal formatting, same `GENESIS` root — because a seal that
 * disagreed with the browser's for formatting reasons would flag every honest
 * trade as a mismatch. `hashChain.ts` is load-bearing and is not imported or
 * modified; `seal.test.ts` pins the two implementations to the same vectors.
 *
 * What the seal covers, precisely, so it is not read as covering more:
 *
 *  - The five fields below, which are the ones the browser chains and the ones
 *    a reader sees in the ledger. Altering any of them breaks verification from
 *    that trade onward.
 *  - `rate` is deliberately *not* hashed, because the browser does not hash it
 *    and a seal that disagreed with the browser's would be worthless. It is
 *    bound instead by arithmetic: `recordDemoTradesSchema` refuses a trade whose
 *    credit is not that rate applied to that energy, so a rate cannot be altered
 *    without altering a sealed field too.
 *  - The run and simulated day a trade belongs to are its address, not its
 *    content. They are enforced by contiguity, by one seal chain per day, and by
 *    a closed day refusing further trades — not by this hash.
 *
 * And what it does not claim at all: that the trade describes something real.
 * This is a synthetic demo whose caller generates its own data. The seal shows
 * that what was stored is what was sealed, not that what was sealed was true.
 */

export const GENESIS_SEAL = 'GENESIS'

export interface DemoTradePayload {
  clock: string
  fromName: string
  toName: string
  kwh: number
  credit: number
}

/** Mirrors `payloadString` in `src/lib/hashChain.ts`. */
export function demoPayloadString(payload: DemoTradePayload): string {
  return `${payload.clock}|${payload.fromName}|${payload.toName}|${payload.kwh.toFixed(2)}|${payload.credit.toFixed(2)}`
}

/** Mirrors `hashBlock` in `src/lib/hashChain.ts`. */
export function sealDemoTrade(previousSeal: string, payload: DemoTradePayload): string {
  return createHash('sha256').update(previousSeal + demoPayloadString(payload)).digest('hex')
}

export interface SealedDemoTrade<T extends DemoTradePayload> {
  trade: T
  previousSeal: string
  seal: string
}

/**
 * Seals a run of trades in order, continuing from `previousSeal`.
 *
 * Callers pass the seal of the last trade already stored for the same
 * (run, sim day), so a batched flush chains onto its predecessors rather than
 * restarting at `GENESIS` every request.
 */
export function sealDemoTrades<T extends DemoTradePayload>(
  trades: readonly T[],
  previousSeal: string = GENESIS_SEAL,
): Array<SealedDemoTrade<T>> {
  const sealed: Array<SealedDemoTrade<T>> = []
  let previous = previousSeal
  for (const trade of trades) {
    const seal = sealDemoTrade(previous, trade)
    sealed.push({ trade, previousSeal: previous, seal })
    previous = seal
  }
  return sealed
}
