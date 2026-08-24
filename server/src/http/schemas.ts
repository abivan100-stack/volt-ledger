import { z } from 'zod'
import { SIMULATION_DAY_TYPES } from '../simulations/monteCarlo.js'
import {
  DEMO_HOUSEHOLDS_PER_DAY_LIMIT,
  DEMO_TIMEFRAMES,
  DEMO_TRADES_PER_BATCH_LIMIT,
} from '../demo/limits.js'

/**
 * Every request schema for `/api/v1`, in one place.
 *
 * These objects are the single source of truth for the API contract: the route
 * handlers parse with them at runtime, and the OpenAPI document is generated
 * from the very same objects. A change here therefore cannot leave the published
 * contract behind.
 *
 * Validation deliberately stays inside the handlers rather than moving to
 * Fastify's `schema` option. Two things depend on it:
 *
 *  - Which part failed decides the error code (`INVALID_ORGANISATION_ID` versus
 *    `INVALID_MEMBERSHIP_ID` versus `INVALID_SIMULATION_ID`, …), and a single
 *    schema-level rejection cannot express that.
 *  - Zod semantics that JSON Schema and AJV cannot reproduce are load-bearing
 *    here: `.trim()` transforms, `z.coerce` on query strings, `.default()`,
 *    `.strict()` rejection of unknown keys, and the cross-field `.refine()` on
 *    adjustments.
 *
 * Where a rule cannot be expressed in JSON Schema, the OpenAPI document states
 * it in prose instead — see `openapi/document.ts`.
 */

/** Assignable membership roles. Owner is absent: it moves only by transfer. */
export const ASSIGNABLE_ROLES = ['admin', 'operator', 'viewer'] as const

export const SIMULATION_OUTCOMES = ['p10', 'p50', 'p90', 'selected'] as const

// ---------------------------------------------------------------- path params

export const organisationIdSchema = z.object({
  organisationId: z.string().uuid(),
})

export const membershipParamsSchema = z.object({
  organisationId: z.string().uuid(),
  userId: z.string().min(1).max(200),
})

export const invitationParamsSchema = z.object({
  organisationId: z.string().uuid(),
  invitationId: z.string().min(1).max(200),
})

export const simulationParamsSchema = z.object({
  organisationId: z.string().uuid(),
  runId: z.string().min(1).max(200),
})

// ------------------------------------------------------------------- requests

export const createOrganisationSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: z.string().trim().min(3).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict()

export const createSimulationSchema = z
  .object({
    seed: z.string().trim().min(1).max(128),
    simulationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dayType: z.enum(SIMULATION_DAY_TYPES),
    households: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(120),
            pvKw: z.number().finite().min(0).max(20),
            baseLoadKw: z.number().finite().gt(0).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    sampleCount: z.number().int().min(10).max(250).default(100),
    intervalMinutes: z.union([z.literal(10), z.literal(30), z.literal(60)]).default(60),
    rateInrPerKwh: z.number().finite().min(0).max(20).default(5.5),
  })
  .strict()

export const settleSimulationSchema = z.object({
  outcome: z.enum(SIMULATION_OUTCOMES).default('selected'),
}).strict()

export const createAdjustmentSchema = z.object({
  targetEventId: z.string().min(1).max(200),
  idempotencyKey: z.string().trim().min(1).max(128),
  energyKwh: z.number().finite().min(-100_000).max(100_000),
  estimatedCreditInr: z.number().finite().min(-1_000_000_000).max(1_000_000_000),
  reason: z.string().trim().min(3).max(500),
}).refine((value) => value.energyKwh !== 0 || value.estimatedCreditInr !== 0, {
  message: 'An adjustment must change energy or estimated credit',
  path: ['energyKwh'],
}).strict()

export const transferOwnershipSchema = z.object({
  newOwnerUserId: z.string().trim().min(1).max(200),
}).strict()

export const updateMembershipRoleSchema = z.object({
  role: z.enum(ASSIGNABLE_ROLES),
}).strict()

export const createInvitationBodySchema = z
  .object({
    email: z.string().trim().email().max(320),
    role: z.enum(ASSIGNABLE_ROLES),
  })
  .strict()

export const acceptInvitationBodySchema = z.object({
  token: z.string().min(1).max(256),
}).strict()

// -------------------------------------------------------------- query strings

export const simulationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const simulationResultsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10_000).default(1_000),
})

export const ledgerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

export const auditEventQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  action: z.string().trim().min(1).max(120).optional(),
  cursor: z.string().trim().min(1).max(512).optional(),
})

// ---------------------------------------------------------------- public demo

/**
 * The demo routes are the only unauthenticated writes in the API, so their
 * schemas are the whole of their input validation — there is no membership check
 * behind them to catch a malformed body. Every bound below is therefore
 * deliberate: identifiers are UUIDs so a caller cannot mint readable session
 * names, batches are capped so one request cannot carry an unbounded array, and
 * every quantity has a ceiling far above anything the simulation produces but
 * far below anything that would distort a stored total.
 */

export const demoSessionParamsSchema = z.object({
  sessionId: z.string().uuid(),
})

/** Slack allowed between a trade's credit and its energy times its rate. */
const RATE_CONSISTENCY_TOLERANCE = 0.01

const demoTradeSchema = z
  .object({
    /** Position within the simulated day; the browser chain restarts each day. */
    blockId: z.number().int().min(1).max(100_000),
    // Shape alone would accept 99:99 and store it as a time of day.
    clock: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    fromName: z.string().trim().min(1).max(120),
    toName: z.string().trim().min(1).max(120),
    // Positive, not merely non-negative: the simulation never settles a trade
    // of no energy, and a zero would leave the rate below unconstrained.
    kwh: z.number().positive().max(10_000),
    credit: z.number().nonnegative().max(10_000_000),
    rate: z.number().nonnegative().max(100_000),
    clientSeal: z.string().trim().min(1).max(128),
    clientPreviousSeal: z.string().trim().min(1).max(128),
  })
  .strict()
  // The seal covers the energy and the credit but not the rate, because the
  // browser's chain does not hash the rate and a seal that disagreed with the
  // browser's would report every honest trade as tampered. The rate is bound
  // here instead: it has to be the one that turns this energy into this credit,
  // so it cannot be altered on its own without breaking the seal as well.
  .refine((trade) => Math.abs(trade.credit - trade.kwh * trade.rate) <= RATE_CONSISTENCY_TOLERANCE, {
    message: 'credit must equal kwh multiplied by rate',
    path: ['rate'],
  })

export const recordDemoTradesSchema = z
  .object({
    runId: z.string().uuid(),
    dayType: z.enum(SIMULATION_DAY_TYPES),
    startHour: z.number().int().min(0).max(23),
    simSpeed: z.number().int().min(1).max(64),
    simDay: z.number().int().min(1).max(100_000),
    trades: z.array(demoTradeSchema).min(1).max(DEMO_TRADES_PER_BATCH_LIMIT),
  })
  .strict()

const demoHouseholdDaySchema = z
  .object({
    householdId: z.number().int().min(0).max(10_000),
    householdName: z.string().trim().min(1).max(120),
    generatedKwh: z.number().nonnegative().max(100_000),
    consumedKwh: z.number().nonnegative().max(100_000),
    exportedKwh: z.number().nonnegative().max(100_000),
    importedKwh: z.number().nonnegative().max(100_000),
    earnedInr: z.number().nonnegative().max(100_000_000),
    spentInr: z.number().nonnegative().max(100_000_000),
    tradeCount: z.number().int().min(0).max(100_000),
    /** Signed: a household that has drawn more than it supplied runs negative. */
    balanceInr: z.number().min(-100_000_000).max(100_000_000),
  })
  .strict()

export const recordDemoDaySchema = z
  .object({
    runId: z.string().uuid(),
    simDay: z.number().int().min(1).max(100_000),
    dayType: z.enum(SIMULATION_DAY_TYPES),
    // Reported for comparison only. The server sums the trades it stored and
    // writes its own figures; see `db/demoRepository.ts`.
    totalKwh: z.number().nonnegative().max(1_000_000),
    totalCredit: z.number().nonnegative().max(100_000_000),
    tradeCount: z.number().int().min(0).max(100_000),
    closingRate: z.number().nonnegative().max(100_000),
    compromised: z.boolean(),
    invalidCount: z.number().int().min(0).max(100_000),
    households: z.array(demoHouseholdDaySchema).max(DEMO_HOUSEHOLDS_PER_DAY_LIMIT),
  })
  .strict()
  // One row per household per simulated day is a uniqueness rule in the
  // database. Caught here it is a 400 the caller can act on; caught there it is
  // a storage failure, and because the day close is idempotent the caller would
  // retry the same rejected payload for as long as it kept trying.
  .refine(
    (value) =>
      new Set(value.households.map((household) => household.householdId)).size ===
      value.households.length,
    { message: 'households must not repeat a householdId', path: ['households'] },
  )

export const demoLedgerQuerySchema = z.object({
  timeframe: z.enum(DEMO_TIMEFRAMES).default('all'),
})
