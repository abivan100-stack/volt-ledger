import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../auth/auth.js'
import {
  DemoDayClosedError,
  DemoRunOwnershipError,
  DemoTransactionsUnavailableError,
  type DemoRepository,
} from '../db/repositories.js'
import type { DemoTradeDocument } from '../db/models.js'
import { buildApp, type OrganisationRouteRepositories } from '../app.js'

/**
 * The public demo endpoints.
 *
 * Two things are worth proving at this layer, and neither is storage — that is
 * covered against a real database in `db/integration/demoLedger.integration.test.ts`.
 * The first is that these routes answer at all without a session, because every
 * other `/api/v1` route refuses to. The second is that their request schemas are
 * doing the whole job of input validation, since there is no membership check
 * behind them to catch anything they let through.
 */

const apps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
  vi.unstubAllEnvs()
})

const SESSION_ID = '22222222-2222-4222-8222-222222222222'
const RUN_ID = '33333333-3333-4333-8333-333333333333'

/** No session cookie and no session: the state every demo visitor is in. */
const anonymous: AuthService = {
  handle: async () => new Response(null, { status: 204 }),
  createVerificationCode: async () => '123456',
  getSession: async () => null,
}

function tradeBatch(overrides: Record<string, unknown> = {}) {
  return {
    runId: RUN_ID,
    dayType: 'sunny-weekday',
    startHour: 8,
    simSpeed: 4,
    simDay: 1,
    trades: [
      {
        blockId: 1,
        clock: '14:20',
        fromName: 'Pranav P',
        toName: 'Abivan',
        kwh: 1.05,
        credit: 5.67,
        rate: 5.4,
        clientSeal: 'seal-from-the-browser',
        clientPreviousSeal: 'GENESIS',
      },
    ],
    ...overrides,
  }
}

function dayClose(overrides: Record<string, unknown> = {}) {
  return {
    runId: RUN_ID,
    simDay: 1,
    dayType: 'sunny-weekday',
    totalKwh: 1.05,
    totalCredit: 5.67,
    tradeCount: 1,
    closingRate: 5.4,
    compromised: false,
    invalidCount: 0,
    households: [],
    ...overrides,
  }
}

function storedTrade(): DemoTradeDocument {
  return {
    _id: 'trade_1',
    sessionId: SESSION_ID,
    runId: RUN_ID,
    simDay: 1,
    blockId: 1,
    clock: '14:20',
    fromName: 'Pranav P',
    toName: 'Abivan',
    kwh: 1.05,
    credit: 5.67,
    rate: 5.4,
    clientSeal: 'seal-from-the-browser',
    clientPreviousSeal: 'GENESIS',
    serverSeal: 'seal-the-server-computed',
    serverPreviousSeal: 'GENESIS',
    sealMatchesClient: false,
    recordedAt: new Date('2030-01-01T00:00:00.000Z'),
    expiresAt: new Date('2030-01-31T00:00:00.000Z'),
  }
}

function createDemoDouble(overrides: Partial<DemoRepository> = {}): DemoRepository {
  return {
    recordTrades: async () => ({ recorded: 1, duplicates: 0, rejected: 0, sealMismatches: 0 }),
    recordDay: async () => ({ recorded: true, households: 0, totalsMatchClient: true }),
    readLedger: async (_sessionId, timeframe) => ({
      timeframe,
      trades: [storedTrade()],
      days: [],
      totalKwh: 1.05,
      totalCredit: 5.67,
      tradeCount: 1,
      truncated: false,
      sealMismatches: 1,
    }),
    ...overrides,
  }
}

async function startApp(demo?: DemoRepository): Promise<FastifyInstance> {
  const app = await buildApp({
    logger: false,
    auth: anonymous,
    repositories: { demo } as unknown as OrganisationRouteRepositories,
    databasePing: async () => undefined,
  })
  apps.push(app)
  await app.ready()
  return app
}

describe('recording demo trades', () => {
  it('accepts a batch with no session cookie', async () => {
    const app = await startApp(createDemoDouble())

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/trades`,
      payload: tradeBatch(),
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({
      recorded: 1,
      duplicates: 0,
      rejected: 0,
      sealMismatches: 0,
    })
  })

  it('passes the session identifier from the path, not the body', async () => {
    const recordTrades = vi.fn(async () => ({
      recorded: 1,
      duplicates: 0,
      rejected: 0,
      sealMismatches: 0,
    }))
    const app = await startApp(createDemoDouble({ recordTrades }))

    await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/trades`,
      // A body claiming a different session must not be able to redirect the write.
      payload: tradeBatch({ sessionId: 'somebody-elses-session' }),
    })

    // The extra key is rejected outright by the strict schema.
    expect(recordTrades).not.toHaveBeenCalled()
  })

  it('reports how many trades were refused for breaking the chain', async () => {
    const app = await startApp(
      createDemoDouble({
        recordTrades: async () => ({ recorded: 0, duplicates: 0, rejected: 2, sealMismatches: 0 }),
      }),
    )

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/trades`,
      payload: tradeBatch(),
    })

    expect(response.json().rejected).toBe(2)
  })

  it('refuses a session identifier that is not a UUID', async () => {
    const app = await startApp(createDemoDouble())

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/demo/sessions/not-a-uuid/trades',
      payload: tradeBatch(),
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('INVALID_DEMO_SESSION_ID')
  })

  it('refuses an empty batch', async () => {
    const app = await startApp(createDemoDouble())

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/trades`,
      payload: tradeBatch({ trades: [] }),
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('INVALID_REQUEST')
  })

  it('refuses a batch larger than one flush may carry', async () => {
    const app = await startApp(createDemoDouble())
    const trades = Array.from({ length: 101 }, (_unused, index) => ({
      ...tradeBatch().trades[0],
      blockId: index + 1,
    }))

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/trades`,
      payload: tradeBatch({ trades }),
    })

    expect(response.statusCode).toBe(400)
  })

  it('refuses a day type the simulation does not model', async () => {
    const app = await startApp(createDemoDouble())

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/trades`,
      payload: tradeBatch({ dayType: 'monsoon' }),
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().issues.length).toBeGreaterThan(0)
  })

  it.each(['99:99', '24:00', '7:30', '1430', '14:5'])(
    'refuses %s as a time of day',
    async (clock) => {
      const app = await startApp(createDemoDouble())

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/demo/sessions/${SESSION_ID}/trades`,
        payload: tradeBatch({ trades: [{ ...tradeBatch().trades[0], clock }] }),
      })

      expect(response.statusCode).toBe(400)
    },
  )

  it.each(['00:00', '09:05', '23:59'])('accepts %s as a time of day', async (clock) => {
    const app = await startApp(createDemoDouble())

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/trades`,
      payload: tradeBatch({ trades: [{ ...tradeBatch().trades[0], clock }] }),
    })

    expect(response.statusCode).toBe(201)
  })

  it('refuses a rate that does not turn the energy into the credit', async () => {
    const app = await startApp(createDemoDouble())

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/trades`,
      // The seal covers the energy and the credit but not the rate, so this is
      // the only thing standing between a stored rate and an arbitrary one.
      payload: tradeBatch({ trades: [{ ...tradeBatch().trades[0], rate: 999 }] }),
    })

    expect(response.statusCode).toBe(400)
    const issues = response.json().issues as Array<{ path: string; message: string }>
    expect(issues.some((issue) => issue.path === 'trades.0.rate')).toBe(true)
  })

  it('accepts a rate consistent with the energy and the credit', async () => {
    const app = await startApp(createDemoDouble())

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/trades`,
      payload: tradeBatch({
        trades: [{ ...tradeBatch().trades[0], kwh: 2, credit: 11, rate: 5.5 }],
      }),
    })

    expect(response.statusCode).toBe(201)
  })

  it('tolerates the rounding the browser applies to credit', async () => {
    const app = await startApp(createDemoDouble())

    // The browser rounds credit to paise, so kwh * rate rarely lands exactly.
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/trades`,
      payload: tradeBatch({
        trades: [{ ...tradeBatch().trades[0], kwh: 0.37, credit: 2.05, rate: 5.54 }],
      }),
    })

    expect(response.statusCode).toBe(201)
  })

  it('refuses a trade that settled no energy', async () => {
    const app = await startApp(createDemoDouble())

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/trades`,
      payload: tradeBatch({ trades: [{ ...tradeBatch().trades[0], kwh: 0, credit: 0 }] }),
    })

    expect(response.statusCode).toBe(400)
  })

  it('refuses a negative energy amount', async () => {
    const app = await startApp(createDemoDouble())

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/trades`,
      payload: tradeBatch({ trades: [{ ...tradeBatch().trades[0], kwh: -5 }] }),
    })

    expect(response.statusCode).toBe(400)
  })

  it('answers 503 when demo persistence is switched off', async () => {
    const app = await startApp(undefined)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/trades`,
      payload: tradeBatch(),
    })

    expect(response.statusCode).toBe(503)
    expect(response.json().code).toBe('DEMO_PERSISTENCE_DISABLED')
  })

  it('answers 409 when the run belongs to another session', async () => {
    const app = await startApp(
      createDemoDouble({
        recordTrades: async () => {
          throw new DemoRunOwnershipError()
        },
      }),
    )

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/trades`,
      payload: tradeBatch(),
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().code).toBe('DEMO_RUN_CONFLICT')
  })

  it('answers 409 when the simulated day has already been closed', async () => {
    const app = await startApp(
      createDemoDouble({
        recordTrades: async () => {
          throw new DemoDayClosedError()
        },
      }),
    )

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/trades`,
      payload: tradeBatch(),
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().code).toBe('DEMO_DAY_CLOSED')
  })

  it('answers 503 when the database cannot run the required transaction', async () => {
    const app = await startApp(
      createDemoDouble({
        recordTrades: async () => {
          throw new DemoTransactionsUnavailableError()
        },
      }),
    )

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/trades`,
      payload: tradeBatch(),
    })

    // Not a 500: the request is fine and would succeed against a replica set.
    // The browser treats this the same as persistence being switched off.
    expect(response.statusCode).toBe(503)
    expect(response.json().code).toBe('DEMO_PERSISTENCE_UNAVAILABLE')
  })

  it('answers 500 rather than leaking a storage failure', async () => {
    const app = await startApp(
      createDemoDouble({
        recordTrades: async () => {
          throw new Error('mongodb://user:password@host/volt is unreachable')
        },
      }),
    )

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/trades`,
      payload: tradeBatch(),
    })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      error: 'Demo trades could not be recorded',
      code: 'DEMO_INGEST_FAILED',
    })
  })
})

describe('closing a demo day', () => {
  it('accepts a day close with no session cookie', async () => {
    const app = await startApp(createDemoDouble())

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/days`,
      payload: dayClose(),
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({ recorded: true, households: 0, totalsMatchClient: true })
  })

  it('reports totals that disagreed with what was stored', async () => {
    const app = await startApp(
      createDemoDouble({
        recordDay: async () => ({ recorded: true, households: 10, totalsMatchClient: false }),
      }),
    )

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/days`,
      payload: dayClose({ totalKwh: 9999 }),
    })

    expect(response.json().totalsMatchClient).toBe(false)
  })

  it('accepts a household balance that has gone negative', async () => {
    const app = await startApp(createDemoDouble())

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/days`,
      payload: dayClose({
        households: [
          {
            householdId: 3,
            householdName: 'Abivan',
            generatedKwh: 0,
            consumedKwh: 9.4,
            exportedKwh: 0,
            importedKwh: 9.4,
            earnedInr: 0,
            spentInr: 51.7,
            tradeCount: 4,
            balanceInr: -484.2,
          },
        ],
      }),
    })

    expect(response.statusCode).toBe(201)
  })

  it('refuses a payload naming the same household twice', async () => {
    const app = await startApp(createDemoDouble())
    const household = {
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
    }

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/days`,
      payload: dayClose({ households: [household, { ...household, householdName: 'Someone else' }] }),
    })

    // One row per household per simulated day is a uniqueness rule in the
    // database. Refused here it is a 400 the caller can act on; refused there it
    // is a storage failure, and because the day close is idempotent the caller
    // would retry the same rejected payload for as long as it kept trying.
    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('INVALID_REQUEST')
  })

  it('refuses more households than the neighbourhood could hold', async () => {
    const app = await startApp(createDemoDouble())
    const households = Array.from({ length: 51 }, (_unused, index) => ({
      householdId: index,
      householdName: `House ${index}`,
      generatedKwh: 1,
      consumedKwh: 1,
      exportedKwh: 0,
      importedKwh: 0,
      earnedInr: 0,
      spentInr: 0,
      tradeCount: 0,
      balanceInr: 0,
    }))

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/days`,
      payload: dayClose({ households }),
    })

    expect(response.statusCode).toBe(400)
  })

  it('answers 409 when the run belongs to another session', async () => {
    const app = await startApp(
      createDemoDouble({
        recordDay: async () => {
          throw new DemoRunOwnershipError()
        },
      }),
    )

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/days`,
      payload: dayClose(),
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().code).toBe('DEMO_RUN_CONFLICT')
  })

  it('answers 503 when demo persistence is switched off', async () => {
    const app = await startApp(undefined)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/demo/sessions/${SESSION_ID}/days`,
      payload: dayClose(),
    })

    expect(response.statusCode).toBe(503)
  })
})

describe('reading a demo ledger', () => {
  it('returns the server seal and whether the browser agreed with it', async () => {
    const app = await startApp(createDemoDouble())

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/demo/sessions/${SESSION_ID}/ledger?timeframe=all`,
    })

    expect(response.statusCode).toBe(200)
    const [trade] = response.json().trades
    expect(trade.seal).toBe('seal-the-server-computed')
    expect(trade.sealMatchesClient).toBe(false)
    // The seal the caller posted is storage detail, not part of the contract.
    expect(trade.clientSeal).toBeUndefined()
  })

  it('defaults to the whole session when no timeframe is given', async () => {
    const readLedger = vi.fn(createDemoDouble().readLedger)
    const app = await startApp(createDemoDouble({ readLedger }))

    await app.inject({ method: 'GET', url: `/api/v1/demo/sessions/${SESSION_ID}/ledger` })

    expect(readLedger).toHaveBeenCalledWith(SESSION_ID, 'all')
  })

  it.each(['today', '7d', '30d', 'all'])('accepts the %s timeframe', async (timeframe) => {
    const readLedger = vi.fn(createDemoDouble().readLedger)
    const app = await startApp(createDemoDouble({ readLedger }))

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/demo/sessions/${SESSION_ID}/ledger?timeframe=${timeframe}`,
    })

    expect(response.statusCode).toBe(200)
    expect(readLedger).toHaveBeenCalledWith(SESSION_ID, timeframe)
  })

  it('refuses a timeframe that is not published', async () => {
    const app = await startApp(createDemoDouble())

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/demo/sessions/${SESSION_ID}/ledger?timeframe=last-year`,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('INVALID_REQUEST')
  })

  it('refuses a session identifier that is not a UUID', async () => {
    const app = await startApp(createDemoDouble())

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/demo/sessions/../../organisations/ledger',
    })

    expect(response.statusCode).toBe(400)
  })
})
