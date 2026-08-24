/**
 * Bounds and vocabulary for the public demo endpoints.
 *
 * Deliberately dependency-free. The request schemas in `http/schemas.ts` read
 * these, and those schemas are what `openapi/document.ts` generates the
 * published contract from — a path that runs in CI with no database and no
 * environment file. Importing them from the repository instead would drag
 * `config/env.ts` into that path, and generating the contract would start
 * demanding a MongoDB URI.
 */

/** Trades one flush may carry. The browser settles roughly one every 3 seconds. */
export const DEMO_TRADES_PER_BATCH_LIMIT = 100

/** Households one day-close may report; the synthetic neighbourhood has ten. */
export const DEMO_HOUSEHOLDS_PER_DAY_LIMIT = 50

/** Ceiling on rows one export may read, so `all` cannot become unbounded. */
export const DEMO_EXPORT_TRADE_LIMIT = 10_000

export const DEMO_TIMEFRAMES = ['today', '7d', '30d', 'all'] as const
export type DemoTimeframe = (typeof DEMO_TIMEFRAMES)[number]

/**
 * How many simulated days each timeframe covers.
 *
 * The demo keeps its own clock: at the default speed a simulated day completes
 * in about three real minutes, so filtering on wall-clock time would put an
 * entire session inside "today" and leave every other option empty. A day here
 * therefore means a simulated day, counted back from the most recent one.
 */
export const TIMEFRAME_DAY_SPAN: Record<DemoTimeframe, number | null> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  all: null,
}
