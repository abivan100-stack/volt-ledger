import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../auth/auth.js'
import type {
  MembershipDocument,
  LedgerEventDocument,
  OrganisationDocument,
  SimulationIntervalDocument,
  SimulationRunDocument,
  SimulationSummaryDocument,
} from '../db/models.js'
import { createLedgerSeal, simulationDailyRunLimit } from '../db/repositories.js'
import { buildApp } from '../app.js'

const apps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

const organisation: OrganisationDocument = {
  _id: '9bf4cf78-0aeb-4ef8-9344-7d706de9e576',
  name: 'Solar Commons',
  slug: 'solar-commons',
  createdByUserId: 'user_123',
  createdAt: new Date('2030-01-01T00:00:00.000Z'),
  updatedAt: new Date('2030-01-01T00:00:00.000Z'),
  deletedAt: null,
}

const run: SimulationRunDocument = {
  _id: 'run_123',
  organisationId: organisation._id,
  requestedByUserId: 'user_123',
  seed: 'demo-seed',
  modelVersion: 'monte-carlo-v1',
  inputSnapshot: {
    simulationDate: '2030-01-01',
    dayType: 'sunny-weekday',
    households: [{ id: 'household_1', pvKw: 4.2, baseLoadKw: 0.6 }],
    sampleCount: 10,
    intervalMinutes: 60,
    rateInrPerKwh: 5.5,
  },
  inputDigest: 'input-digest',
  status: 'queued',
  attemptCount: 0,
  createdAt: new Date('2030-01-01T00:00:00.000Z'),
  startedAt: null,
  completedAt: null,
  resultDigest: null,
  errorCode: null,
  deletedAt: null,
}

const interval: SimulationIntervalDocument = {
  _id: 'interval_123',
  organisationId: organisation._id,
  runId: run._id,
  householdId: 'household_1',
  intervalStart: new Date('2030-01-01T00:00:00.000Z'),
  intervalEnd: new Date('2030-01-01T01:00:00.000Z'),
  generatedKwh: 1.2,
  consumedKwh: 0.8,
  importedKwh: 0,
  exportedKwh: 0.4,
  estimatedCreditInr: 2.2,
  outcome: 'p50',
  createdAt: new Date('2030-01-01T00:02:00.000Z'),
  deletedAt: null,
}

const summary: SimulationSummaryDocument = {
  _id: 'summary_123',
  organisationId: organisation._id,
  runId: run._id,
  householdId: 'household_1',
  outcome: 'p50',
  intervalCount: 1,
  generatedKwh: 1.2,
  consumedKwh: 0.8,
  importedKwh: 0,
  exportedKwh: 0.4,
  estimatedCreditInr: 2.2,
  createdAt: new Date('2030-01-01T00:02:00.000Z'),
  deletedAt: null,
}

const ledgerEvent: LedgerEventDocument = {
  _id: 'ledger_123',
  organisationId: organisation._id,
  sequence: 1,
  eventType: 'settlement',
  outcome: 'selected',
  actorUserId: 'user_123',
  householdId: 'household_1',
  settlementDate: '2030-01-01',
  sourceRunId: run._id,
  simulationResultDigest: 'result-digest',
  energyKwh: 0.4,
  estimatedCreditInr: 2.2,
  previousSeal: null,
  canonicalSeal: createLedgerSeal({
    organisationId: organisation._id,
    sequence: 1,
    eventType: 'settlement',
    outcome: 'selected',
    actorUserId: 'user_123',
    householdId: 'household_1',
    settlementDate: '2030-01-01',
    sourceRunId: run._id,
    simulationResultDigest: 'result-digest',
    energyKwh: 0.4,
    estimatedCreditInr: 2.2,
    previousSeal: null,
    adjustmentTargetEventId: null,
    adjustmentReason: null,
    idempotencyKey: null,
  }),
  adjustmentTargetEventId: null,
  adjustmentReason: null,
  idempotencyKey: null,
  createdAt: new Date('2030-01-01T00:04:00.000Z'),
}

const adjustmentEvent: LedgerEventDocument = {
  ...ledgerEvent,
  _id: 'adjustment_123',
  sequence: 2,
  eventType: 'adjustment',
  actorUserId: 'user_123',
  energyKwh: -0.1,
  estimatedCreditInr: -0.55,
  previousSeal: ledgerEvent.canonicalSeal,
  adjustmentTargetEventId: ledgerEvent._id,
  adjustmentReason: 'Corrected the synthetic export estimate',
  idempotencyKey: 'correction-1',
}

function authFor(_role: MembershipDocument['role']): AuthService {
  return {
    handle: async () => new Response(null, { status: 204 }),
  createVerificationCode: async () => '123456',
    getSession: async () => ({
      user: { id: 'user_123', name: 'Volt User', email: 'asha@example.com', emailVerified: true },
      session: { id: 'session_123', expiresAt: new Date('2030-01-02T00:00:00.000Z') },
    }),
  }
}

function membership(role: MembershipDocument['role']): MembershipDocument {
  return {
    _id: 'membership_123',
    organisationId: organisation._id,
    userId: 'user_123',
    email: 'asha@example.com',
    role,
    createdAt: organisation.createdAt,
    updatedAt: organisation.updatedAt,
    deletedAt: null,
  }
}

function createRepositories(role: MembershipDocument['role'] = 'operator', initialRun = run) {
  let receivedInput: unknown
  return {
    repositories: {
      organisations: {
        createWithOwner: async () => ({ organisation, membership: membership('owner') }),
        listForUser: async () => [organisation],
        findById: async () => organisation,
      },
      memberships: {
        find: async () => membership(role),
        listForOrganisation: async () => [membership(role)],
        updateRole: async () => null,
        remove: async () => null,
      },
      invitations: {
        create: async () => { throw new Error('not used') },
        findById: async () => null,
        findPendingByEmail: async () => null,
        listForOrganisation: async () => [],
        revoke: async () => false,
        accept: async () => { throw new Error('not used') },
      },
      simulations: {
        createRun: async (input: Record<string, unknown>) => {
          receivedInput = input
          return { ...initialRun, ...input, status: 'queued' as const }
        },
        findRunById: async () => initialRun,
        listForOrganisation: async () => [initialRun],
        listIntervals: async () => [interval],
        listSummaries: async () => [summary],
        getDailyQuota: async () => ({
          usageDate: '2030-01-01',
          used: 0,
          limit: simulationDailyRunLimit,
          remaining: simulationDailyRunLimit,
          resetsAt: new Date('2030-01-02T00:00:00.000Z'),
        }),
      },
      ledger: {
        settleCompletedRun: async () => ({ run: initialRun, events: [ledgerEvent], alreadySettled: false }),
        appendAdjustment: async () => ({ event: adjustmentEvent, alreadyApplied: false }),
        list: async () => [ledgerEvent],
      },
    },
    getReceivedInput: () => receivedInput,
  }
}

describe('simulation REST API', () => {
  it('queues a bounded Monte Carlo run for an operator and freezes its input digest', async () => {
    const fixture = createRepositories('operator')
    const app = await buildApp({ logger: false, auth: authFor('operator'), repositories: fixture.repositories as never })
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/organisations/${organisation._id}/simulations`,
      payload: {
        seed: 'demo-seed',
        simulationDate: '2030-01-01',
        dayType: 'sunny-weekday',
        households: [{ id: 'household_1', pvKw: 4.2, baseLoadKw: 0.6 }],
        sampleCount: 10,
        intervalMinutes: 60,
        rateInrPerKwh: 5.5,
      },
    })

    expect(response.statusCode).toBe(202)
    expect(response.json()).toMatchObject({
      run: {
        id: run._id,
        status: 'queued',
        modelVersion: 'monte-carlo-v1',
        seed: 'demo-seed',
      },
    })
    expect(response.json().run.inputDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(fixture.getReceivedInput()).toMatchObject({
      organisationId: organisation._id,
      requestedByUserId: 'user_123',
      modelVersion: 'monte-carlo-v1',
      seed: 'demo-seed',
    })
  })

  it('rejects viewers from creating runs and rejects invalid dates', async () => {
    const viewerFixture = createRepositories('viewer')
    const viewerApp = await buildApp({ logger: false, auth: authFor('viewer'), repositories: viewerFixture.repositories as never })
    apps.push(viewerApp)
    const viewerResponse = await viewerApp.inject({
      method: 'POST',
      url: `/api/v1/organisations/${organisation._id}/simulations`,
      payload: {
        seed: 'demo-seed',
        simulationDate: '2030-01-01',
        dayType: 'sunny-weekday',
        households: [{ id: 'household_1', pvKw: 4.2, baseLoadKw: 0.6 }],
      },
    })
    expect(viewerResponse.statusCode).toBe(403)
    expect(viewerFixture.getReceivedInput()).toBeUndefined()

    const ownerFixture = createRepositories('owner')
    const ownerApp = await buildApp({ logger: false, auth: authFor('owner'), repositories: ownerFixture.repositories as never })
    apps.push(ownerApp)
    const invalidResponse = await ownerApp.inject({
      method: 'POST',
      url: `/api/v1/organisations/${organisation._id}/simulations`,
      payload: {
        seed: 'demo-seed',
        simulationDate: '2030-02-31',
        dayType: 'sunny-weekday',
        households: [{ id: 'household_1', pvKw: 4.2, baseLoadKw: 0.6 }],
      },
    })
    expect(invalidResponse.statusCode).toBe(400)
    expect(ownerFixture.getReceivedInput()).toBeUndefined()
  })

  it('reports the daily quota and returns a retryable response when it is exhausted', async () => {
    const fixture = createRepositories('operator')
    fixture.repositories.simulations.getDailyQuota = async () => ({
      usageDate: '2030-01-01',
      used: simulationDailyRunLimit,
      limit: simulationDailyRunLimit,
      remaining: 0,
      resetsAt: new Date('2030-01-02T00:00:00.000Z'),
    })
    fixture.repositories.simulations.createRun = async () => {
      throw new Error('SIMULATION_QUOTA_EXCEEDED')
    }
    const app = await buildApp({ logger: false, auth: authFor('operator'), repositories: fixture.repositories as never })
    apps.push(app)

    const quotaResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/organisations/${organisation._id}/simulations/quota`,
    })
    expect(quotaResponse.statusCode).toBe(200)
    expect(quotaResponse.json()).toEqual({
      quota: {
        usageDate: '2030-01-01',
        used: simulationDailyRunLimit,
        limit: simulationDailyRunLimit,
        remaining: 0,
        resetsAt: '2030-01-02T00:00:00.000Z',
      },
    })

    const exhaustedResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/organisations/${organisation._id}/simulations`,
      payload: {
        seed: 'demo-seed',
        simulationDate: '2030-01-01',
        dayType: 'sunny-weekday',
        households: [{ id: 'household_1', pvKw: 4.2, baseLoadKw: 0.6 }],
      },
    })
    expect(exhaustedResponse.statusCode).toBe(429)
    expect(exhaustedResponse.headers['retry-after']).toBeDefined()
    expect(exhaustedResponse.json()).toMatchObject({
      code: 'SIMULATION_QUOTA_EXCEEDED',
      quota: { remaining: 0, limit: simulationDailyRunLimit },
    })
  })

  it('lets organisation members inspect run status and completed results only', async () => {
    const completedRun = {
      ...run,
      status: 'completed' as const,
      attemptCount: 0,
      startedAt: new Date('2030-01-01T00:01:00.000Z'),
      completedAt: new Date('2030-01-01T00:03:00.000Z'),
      resultDigest: 'result-digest',
    }
    const fixture = createRepositories('viewer', completedRun)
    const app = await buildApp({ logger: false, auth: authFor('viewer'), repositories: fixture.repositories as never })
    apps.push(app)

    const listResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/organisations/${organisation._id}/simulations`,
    })
    expect(listResponse.statusCode).toBe(200)
    expect(listResponse.json().runs).toHaveLength(1)

    const statusResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/organisations/${organisation._id}/simulations/${run._id}`,
    })
    expect(statusResponse.statusCode).toBe(200)
    expect(statusResponse.json()).toMatchObject({ run: { id: run._id, status: 'completed', resultDigest: 'result-digest' } })

    const resultResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/organisations/${organisation._id}/simulations/${run._id}/results`,
    })
    expect(resultResponse.statusCode).toBe(200)
    expect(resultResponse.json()).toMatchObject({
      intervals: [{ id: interval._id, intervalStart: interval.intervalStart.toISOString() }],
      summaries: [{ id: summary._id, outcome: 'p50' }],
    })

    const pendingFixture = createRepositories('viewer', run)
    const pendingApp = await buildApp({ logger: false, auth: authFor('viewer'), repositories: pendingFixture.repositories as never })
    apps.push(pendingApp)
    const pendingResponse = await pendingApp.inject({
      method: 'GET',
      url: `/api/v1/organisations/${organisation._id}/simulations/${run._id}/results`,
    })
    expect(pendingResponse.statusCode).toBe(409)
    expect(pendingResponse.json()).toEqual({
      error: 'Simulation results are not available yet',
      code: 'SIMULATION_NOT_COMPLETE',
    })
  })

  it('restricts settlement acceptance to admins and exposes immutable ledger events to members', async () => {
    const operatorFixture = createRepositories('operator', { ...run, status: 'completed', resultDigest: 'result-digest' })
    const operatorApp = await buildApp({ logger: false, auth: authFor('operator'), repositories: operatorFixture.repositories as never })
    apps.push(operatorApp)
    const forbidden = await operatorApp.inject({
      method: 'POST',
      url: `/api/v1/organisations/${organisation._id}/simulations/${run._id}/settlement`,
      payload: { outcome: 'selected' },
    })
    expect(forbidden.statusCode).toBe(403)
    const adjustmentForbidden = await operatorApp.inject({
      method: 'POST',
      url: `/api/v1/organisations/${organisation._id}/ledger/adjustments`,
      payload: {
        targetEventId: ledgerEvent._id,
        idempotencyKey: 'correction-1',
        energyKwh: -0.1,
        estimatedCreditInr: -0.55,
        reason: 'Corrected the synthetic export estimate',
      },
    })
    expect(adjustmentForbidden.statusCode).toBe(403)

    const adminFixture = createRepositories('admin', { ...run, status: 'completed', resultDigest: 'result-digest' })
    const adminApp = await buildApp({ logger: false, auth: authFor('admin'), repositories: adminFixture.repositories as never })
    apps.push(adminApp)
    const accepted = await adminApp.inject({
      method: 'POST',
      url: `/api/v1/organisations/${organisation._id}/simulations/${run._id}/settlement`,
      payload: { outcome: 'selected' },
    })
    expect(accepted.statusCode).toBe(201)
    expect(accepted.json()).toMatchObject({
      settlement: {
        runId: run._id,
        outcome: 'selected',
        events: [{ sequence: 1, sourceRunId: run._id, canonicalSeal: ledgerEvent.canonicalSeal }],
      },
    })

    const memberFixture = createRepositories('viewer', { ...run, status: 'completed', resultDigest: 'result-digest' })
    const memberApp = await buildApp({ logger: false, auth: authFor('viewer'), repositories: memberFixture.repositories as never })
    apps.push(memberApp)
    const ledger = await memberApp.inject({ method: 'GET', url: `/api/v1/organisations/${organisation._id}/ledger?limit=10` })
    expect(ledger.statusCode).toBe(200)
    expect(ledger.json()).toMatchObject({
      events: [{ sequence: 1, outcome: 'selected', energyKwh: 0.4 }],
      integrity: { valid: true, complete: true, checkedEvents: 1, firstSequence: 1, lastSequence: 1 },
    })

    const adjustment = await adminApp.inject({
      method: 'POST',
      url: `/api/v1/organisations/${organisation._id}/ledger/adjustments`,
      payload: {
        targetEventId: ledgerEvent._id,
        idempotencyKey: 'correction-1',
        energyKwh: -0.1,
        estimatedCreditInr: -0.55,
        reason: 'Corrected the synthetic export estimate',
      },
    })
    expect(adjustment.statusCode).toBe(201)
    expect(adjustment.json()).toMatchObject({
      adjustment: {
        alreadyApplied: false,
        event: {
          id: adjustmentEvent._id,
          eventType: 'adjustment',
          adjustmentTargetEventId: ledgerEvent._id,
          adjustmentReason: 'Corrected the synthetic export estimate',
          idempotencyKey: 'correction-1',
        },
      },
    })

    const csrfBlocked = await adminApp.inject({
      method: 'POST',
      url: `/api/v1/organisations/${organisation._id}/simulations/${run._id}/settlement`,
      headers: { cookie: 'better-auth.session_token=test-session' },
      payload: { outcome: 'selected' },
    })
    expect(csrfBlocked.statusCode).toBe(403)
  })
})
