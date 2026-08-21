import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp, type OrganisationRouteRepositories } from '../app.js'
import type { AuthService } from '../auth/auth.js'
import type {
  AuditEventDocument,
  LedgerEventDocument,
  MembershipDocument,
  OrganisationDocument,
  OrganisationInvitationDocument,
  SimulationIntervalDocument,
  SimulationRunDocument,
  SimulationSummaryDocument,
} from '../db/models.js'
import {
  acceptInvitationResponseSchema,
  adjustmentResponseSchema,
  auditEventPageResponseSchema,
  errorResponseSchema,
  invitationListResponseSchema,
  invitationResponseSchema,
  ledgerListResponseSchema,
  membershipListResponseSchema,
  organisationListResponseSchema,
  organisationResponseSchema,
  quotaErrorResponseSchema,
  sessionResponseSchema,
  settlementResponseSchema,
  simulationQuotaResponseSchema,
  simulationResultsResponseSchema,
  simulationRunListResponseSchema,
  simulationRunResponseSchema,
} from '../http/responses.js'

/**
 * Contract tests: real responses from the running app, parsed through the very
 * schemas the OpenAPI document publishes.
 *
 * This is what makes `responses.ts` binding rather than decorative. A serializer
 * that gains, loses or renames a field fails here, so the published document can
 * never quietly stop describing what the API returns.
 */

const ORGANISATION_ID = '9bf4cf78-0aeb-4ef8-9344-7d706de9e576'
const RUN_ID = 'run_123'
const USER_ID = 'user_123'
const WHEN = new Date('2030-01-01T00:00:00.000Z')

const apps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

const authenticated: AuthService = {
  handle: async () => new Response(null, { status: 204 }),
  createVerificationCode: async () => '123456',
  getSession: async () => ({
    user: { id: USER_ID, name: 'Asha Raman', email: 'asha@example.com', emailVerified: true },
    session: { id: 'session_123', expiresAt: WHEN },
  }),
}

const organisation: OrganisationDocument = {
  _id: ORGANISATION_ID,
  name: 'Solar Commons',
  slug: 'solar-commons',
  createdByUserId: USER_ID,
  createdAt: WHEN,
  updatedAt: WHEN,
  deletedAt: null,
}

function membership(role: MembershipDocument['role'] = 'owner'): MembershipDocument {
  return {
    _id: 'membership_123',
    organisationId: ORGANISATION_ID,
    userId: USER_ID,
    email: 'asha@example.com',
    role,
    createdAt: WHEN,
    updatedAt: WHEN,
    deletedAt: null,
  }
}

const invitation: OrganisationInvitationDocument = {
  _id: 'invitation_123',
  organisationId: ORGANISATION_ID,
  email: 'new@example.com',
  role: 'operator',
  tokenHash: 'hash',
  status: 'pending',
  invitedByUserId: USER_ID,
  expiresAt: WHEN,
  acceptedByUserId: null,
  acceptedAt: null,
  revokedAt: null,
  createdAt: WHEN,
  updatedAt: WHEN,
  deletedAt: null,
}

function run(status: SimulationRunDocument['status'] = 'completed'): SimulationRunDocument {
  return {
    _id: RUN_ID,
    organisationId: ORGANISATION_ID,
    requestedByUserId: USER_ID,
    seed: 'seed-1',
    modelVersion: 'volt-monte-carlo-1',
    inputSnapshot: { simulationDate: '2030-01-01', households: [{ id: 'h1' }] },
    inputDigest: 'digest',
    status,
    attemptCount: status === 'queued' ? 0 : 1,
    createdAt: WHEN,
    startedAt: status === 'queued' ? null : WHEN,
    completedAt: status === 'completed' ? WHEN : null,
    resultDigest: status === 'completed' ? 'result-digest' : null,
    errorCode: null,
    deletedAt: null,
  }
}

const interval: SimulationIntervalDocument = {
  _id: 'interval_1',
  organisationId: ORGANISATION_ID,
  runId: RUN_ID,
  householdId: 'h1',
  intervalStart: WHEN,
  intervalEnd: WHEN,
  generatedKwh: 12.5,
  consumedKwh: 9,
  importedKwh: 1.25,
  exportedKwh: 4.75,
  estimatedCreditInr: 26.125,
  outcome: 'p50',
  createdAt: WHEN,
  deletedAt: null,
}

const summary: SimulationSummaryDocument = {
  _id: 'summary_1',
  organisationId: ORGANISATION_ID,
  runId: RUN_ID,
  householdId: 'h1',
  outcome: 'p50',
  intervalCount: 24,
  generatedKwh: 12.5,
  consumedKwh: 9,
  importedKwh: 1.25,
  exportedKwh: 4.75,
  estimatedCreditInr: 26.125,
  createdAt: WHEN,
  deletedAt: null,
}

function ledgerEvent(overrides: Partial<LedgerEventDocument> = {}): LedgerEventDocument {
  return {
    _id: 'event_1',
    organisationId: ORGANISATION_ID,
    sequence: 1,
    eventType: 'settlement',
    outcome: 'p50',
    actorUserId: USER_ID,
    householdId: 'h1',
    settlementDate: '2030-01-01',
    sourceRunId: RUN_ID,
    simulationResultDigest: 'result-digest',
    energyKwh: 4.75,
    estimatedCreditInr: 26.13,
    previousSeal: null,
    canonicalSeal: 'seal-1',
    adjustmentTargetEventId: null,
    adjustmentReason: null,
    idempotencyKey: null,
    createdAt: WHEN,
    ...overrides,
  }
}

const auditEvent: AuditEventDocument = {
  _id: 'audit_1',
  organisationId: ORGANISATION_ID,
  actorUserId: USER_ID,
  action: 'organisation.created',
  entityType: 'organisation',
  entityId: ORGANISATION_ID,
  metadata: { slug: 'solar-commons' },
  createdAt: WHEN,
}

interface StubOptions {
  role?: MembershipDocument['role']
  quotaExhausted?: boolean
  runStatus?: SimulationRunDocument['status']
}

function createRepositories(options: StubOptions = {}): OrganisationRouteRepositories {
  const role = options.role ?? 'owner'
  const current = membership(role)

  return {
    organisations: {
      createWithOwner: async () => ({ organisation, membership: current }),
      listForUser: async () => [organisation],
      findById: async () => organisation,
      softDelete: async () => true,
    },
    memberships: {
      find: async () => current,
      listForOrganisation: async () => [current, membership('viewer')],
      updateRole: async () => membership('operator'),
      remove: async () => true,
      transferOwnership: async () => ({
        previousOwner: membership('admin'),
        newOwner: membership('owner'),
      }),
    },
    invitations: {
      create: async () => ({ invitation, token: 'plain-token' }),
      findById: async () => invitation,
      findPendingByEmail: async () => null,
      listForOrganisation: async () => [invitation],
      revoke: async () => true,
      accept: async () => ({ invitation, membership: current }),
    },
    simulations: {
      createRun: async () => {
        if (options.quotaExhausted) throw new Error('SIMULATION_QUOTA_EXCEEDED')
        return run('queued')
      },
      getDailyQuota: async () => ({
        usageDate: '2030-01-01',
        used: options.quotaExhausted ? 100 : 3,
        limit: 100,
        remaining: options.quotaExhausted ? 0 : 97,
        resetsAt: WHEN,
      }),
      findRunById: async () => run(options.runStatus ?? 'completed'),
      listForOrganisation: async () => [run('completed'), run('queued')],
      listIntervals: async () => [interval],
      listSummaries: async () => [summary],
    },
    ledger: {
      settleCompletedRun: async () => ({
        run: run('completed'),
        events: [ledgerEvent()],
        alreadySettled: false,
      }),
      appendAdjustment: async () => ({
        event: ledgerEvent({
          _id: 'event_2',
          sequence: 2,
          eventType: 'adjustment',
          previousSeal: 'seal-1',
          canonicalSeal: 'seal-2',
          adjustmentTargetEventId: 'event_1',
          adjustmentReason: 'Meter correction',
          idempotencyKey: 'key-1',
          energyKwh: -0.5,
          estimatedCreditInr: -2.75,
        }),
        alreadyApplied: false,
      }),
      list: async () => [ledgerEvent()],
    },
    audit: {
      listForOrganisation: async () => [auditEvent],
      listPageForOrganisation: async () => ({
        events: [auditEvent],
        nextCursor: { createdAt: WHEN, id: 'audit_1' },
      }),
    },
  } as unknown as OrganisationRouteRepositories
}

async function startApp(options: StubOptions = {}): Promise<FastifyInstance> {
  const app = await buildApp({
    logger: false,
    auth: authenticated,
    repositories: createRepositories(options),
    databasePing: async () => undefined,
  })
  apps.push(app)
  return app
}

/** State-changing requests carry a cookie, so they need a same-origin header. */
const SAME_ORIGIN = { origin: 'http://localhost:5173', cookie: 'better-auth.session_token=abc' }

const ORGANISATION_PATH = `/api/v1/organisations/${ORGANISATION_ID}`

describe('session and organisations', () => {
  it('GET /api/v1/me matches SessionResponse', async () => {
    const app = await startApp()
    const response = await app.inject({ method: 'GET', url: '/api/v1/me' })

    expect(response.statusCode).toBe(200)
    expect(() => sessionResponseSchema.parse(response.json())).not.toThrow()
  })

  it('POST /api/v1/organisations matches OrganisationResponse with 201', async () => {
    const app = await startApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/organisations',
      headers: SAME_ORIGIN,
      payload: { name: 'Solar Commons', slug: 'solar-commons' },
    })

    expect(response.statusCode).toBe(201)
    expect(() => organisationResponseSchema.parse(response.json())).not.toThrow()
  })

  it('GET /api/v1/organisations matches OrganisationListResponse', async () => {
    const app = await startApp()
    const response = await app.inject({ method: 'GET', url: '/api/v1/organisations' })

    expect(response.statusCode).toBe(200)
    const parsed = organisationListResponseSchema.parse(response.json())
    expect(parsed.organisations[0]?.role).toBe('owner')
  })

  it('GET one organisation matches OrganisationResponse', async () => {
    const app = await startApp()
    const response = await app.inject({ method: 'GET', url: ORGANISATION_PATH })

    expect(response.statusCode).toBe(200)
    expect(() => organisationResponseSchema.parse(response.json())).not.toThrow()
  })

  it('DELETE one organisation answers 204 with no body', async () => {
    const app = await startApp()
    const response = await app.inject({
      method: 'DELETE',
      url: ORGANISATION_PATH,
      headers: SAME_ORIGIN,
    })

    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
  })
})

describe('memberships and invitations', () => {
  it('GET memberships matches MembershipListResponse', async () => {
    const app = await startApp()
    const response = await app.inject({ method: 'GET', url: `${ORGANISATION_PATH}/memberships` })

    expect(response.statusCode).toBe(200)
    const parsed = membershipListResponseSchema.parse(response.json())
    expect(parsed.members.length).toBe(2)
  })

  it('POST invitations matches InvitationResponse with 202', async () => {
    const app = await startApp()
    const response = await app.inject({
      method: 'POST',
      url: `${ORGANISATION_PATH}/invitations`,
      headers: SAME_ORIGIN,
      payload: { email: 'new@example.com', role: 'operator' },
    })

    expect(response.statusCode).toBe(202)
    const parsed = invitationResponseSchema.parse(response.json())
    // The single-use token is emailed, never returned.
    expect(JSON.stringify(parsed)).not.toContain('plain-token')
    expect(JSON.stringify(parsed)).not.toContain('hash')
  })

  it('GET invitations matches InvitationListResponse and includes createdAt', async () => {
    const app = await startApp()
    const response = await app.inject({ method: 'GET', url: `${ORGANISATION_PATH}/invitations` })

    expect(response.statusCode).toBe(200)
    const parsed = invitationListResponseSchema.parse(response.json())
    expect(parsed.invitations[0]?.createdAt).toBeDefined()
  })

  it('POST invitations/accept matches AcceptInvitationResponse', async () => {
    const app = await startApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/invitations/accept',
      headers: SAME_ORIGIN,
      payload: { token: 'plain-token' },
    })

    expect(response.statusCode).toBe(200)
    expect(() => acceptInvitationResponseSchema.parse(response.json())).not.toThrow()
  })
})

describe('simulations', () => {
  it('POST simulations matches SimulationRunResponse with 202 and a queued run', async () => {
    const app = await startApp()
    const response = await app.inject({
      method: 'POST',
      url: `${ORGANISATION_PATH}/simulations`,
      headers: SAME_ORIGIN,
      payload: {
        seed: 'seed-1',
        simulationDate: '2030-01-01',
        dayType: 'sunny-weekday',
        households: [{ id: 'h1', pvKw: 3, baseLoadKw: 1 }],
      },
    })

    // 202, not 201: a separate worker still has to run it.
    expect(response.statusCode).toBe(202)
    const parsed = simulationRunResponseSchema.parse(response.json())
    expect(parsed.run.status).toBe('queued')
    expect(parsed.run.resultDigest).toBeNull()
  })

  it('GET simulations matches SimulationRunListResponse', async () => {
    const app = await startApp()
    const response = await app.inject({ method: 'GET', url: `${ORGANISATION_PATH}/simulations` })

    expect(response.statusCode).toBe(200)
    expect(() => simulationRunListResponseSchema.parse(response.json())).not.toThrow()
  })

  it('GET simulations/quota matches SimulationQuotaResponse', async () => {
    const app = await startApp()
    const response = await app.inject({
      method: 'GET',
      url: `${ORGANISATION_PATH}/simulations/quota`,
    })

    expect(response.statusCode).toBe(200)
    const parsed = simulationQuotaResponseSchema.parse(response.json())
    expect(parsed.quota.remaining).toBe(97)
  })

  it('GET one run matches SimulationRunResponse', async () => {
    const app = await startApp()
    const response = await app.inject({
      method: 'GET',
      url: `${ORGANISATION_PATH}/simulations/${RUN_ID}`,
    })

    expect(response.statusCode).toBe(200)
    expect(() => simulationRunResponseSchema.parse(response.json())).not.toThrow()
  })

  it('GET results matches SimulationResultsResponse', async () => {
    const app = await startApp()
    const response = await app.inject({
      method: 'GET',
      url: `${ORGANISATION_PATH}/simulations/${RUN_ID}/results`,
    })

    expect(response.statusCode).toBe(200)
    const parsed = simulationResultsResponseSchema.parse(response.json())
    expect(parsed.intervals[0]?.outcome).toBe('p50')
    expect(parsed.summaries[0]?.exportedKwh).toBe(4.75)
  })

  it('GET results answers the documented 409 while a run is still queued', async () => {
    const app = await startApp({ runStatus: 'queued' })
    const response = await app.inject({
      method: 'GET',
      url: `${ORGANISATION_PATH}/simulations/${RUN_ID}/results`,
    })

    expect(response.statusCode).toBe(409)
    const parsed = errorResponseSchema.parse(response.json())
    expect(parsed.code).toBe('SIMULATION_NOT_COMPLETE')
  })

  it('POST simulations answers the documented 429 with the allowance and Retry-After', async () => {
    const app = await startApp({ quotaExhausted: true })
    const response = await app.inject({
      method: 'POST',
      url: `${ORGANISATION_PATH}/simulations`,
      headers: SAME_ORIGIN,
      payload: {
        seed: 'seed-1',
        simulationDate: '2030-01-01',
        dayType: 'sunny-weekday',
        households: [{ id: 'h1', pvKw: 3, baseLoadKw: 1 }],
      },
    })

    expect(response.statusCode).toBe(429)
    expect(response.headers['retry-after']).toBeDefined()
    const parsed = quotaErrorResponseSchema.parse(response.json())
    expect(parsed.code).toBe('SIMULATION_QUOTA_EXCEEDED')
    expect(parsed.quota.remaining).toBe(0)
  })
})

describe('ledger', () => {
  it('POST settlement matches SettlementResponse with 201', async () => {
    const app = await startApp()
    const response = await app.inject({
      method: 'POST',
      url: `${ORGANISATION_PATH}/simulations/${RUN_ID}/settlement`,
      headers: SAME_ORIGIN,
      payload: { outcome: 'p50' },
    })

    expect(response.statusCode).toBe(201)
    const parsed = settlementResponseSchema.parse(response.json())
    expect(parsed.settlement.alreadySettled).toBe(false)
    expect(parsed.settlement.events[0]?.eventType).toBe('settlement')
  })

  it('GET ledger matches LedgerListResponse and carries an integrity verdict', async () => {
    const app = await startApp()
    const response = await app.inject({ method: 'GET', url: `${ORGANISATION_PATH}/ledger` })

    expect(response.statusCode).toBe(200)
    const parsed = ledgerListResponseSchema.parse(response.json())
    expect(parsed.integrity.checkedEvents).toBe(1)
    expect(typeof parsed.integrity.valid).toBe('boolean')
  })

  it('POST adjustments matches AdjustmentResponse and never edits its target', async () => {
    const app = await startApp()
    const response = await app.inject({
      method: 'POST',
      url: `${ORGANISATION_PATH}/ledger/adjustments`,
      headers: SAME_ORIGIN,
      payload: {
        targetEventId: 'event_1',
        idempotencyKey: 'key-1',
        energyKwh: -0.5,
        estimatedCreditInr: -2.75,
        reason: 'Meter correction',
      },
    })

    expect(response.statusCode).toBe(201)
    const parsed = adjustmentResponseSchema.parse(response.json())
    // The correction is its own event, pointing at the untouched original.
    expect(parsed.adjustment.event.eventType).toBe('adjustment')
    expect(parsed.adjustment.event.adjustmentTargetEventId).toBe('event_1')
    expect(parsed.adjustment.event.id).not.toBe('event_1')
  })
})

describe('audit', () => {
  it('GET audit-events matches AuditEventPageResponse with an opaque cursor', async () => {
    const app = await startApp()
    const response = await app.inject({ method: 'GET', url: `${ORGANISATION_PATH}/audit-events` })

    expect(response.statusCode).toBe(200)
    const parsed = auditEventPageResponseSchema.parse(response.json())
    expect(parsed.events[0]?.action).toBe('organisation.created')
    expect(typeof parsed.nextCursor).toBe('string')
    // The cursor is a position marker, not the record it points at.
    expect(parsed.nextCursor).not.toContain('audit_1')
  })

  it('reports an unusable cursor with the documented code', async () => {
    const app = await startApp()
    const response = await app.inject({
      method: 'GET',
      url: `${ORGANISATION_PATH}/audit-events?cursor=not-a-cursor`,
    })

    expect(response.statusCode).toBe(400)
    expect(errorResponseSchema.parse(response.json()).code).toBe('INVALID_AUDIT_CURSOR')
  })
})

describe('the error envelope', () => {
  it('is used for an unauthenticated request', async () => {
    const app = await buildApp({
      logger: false,
      auth: {
        handle: async () => new Response(null, { status: 204 }),
        createVerificationCode: async () => '123456',
        getSession: async () => null,
      },
      repositories: createRepositories(),
      databasePing: async () => undefined,
    })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/api/v1/me' })

    expect(response.statusCode).toBe(401)
    expect(errorResponseSchema.parse(response.json()).code).toBe('UNAUTHENTICATED')
  })

  it('is used when a role is insufficient', async () => {
    const app = await startApp({ role: 'viewer' })
    const response = await app.inject({ method: 'GET', url: `${ORGANISATION_PATH}/audit-events` })

    expect(response.statusCode).toBe(403)
    expect(errorResponseSchema.parse(response.json()).code).toBe('ORGANISATION_ROLE_FORBIDDEN')
  })

  it('is used for a malformed path parameter', async () => {
    const app = await startApp()
    const response = await app.inject({ method: 'GET', url: '/api/v1/organisations/not-a-uuid' })

    expect(response.statusCode).toBe(400)
    expect(errorResponseSchema.parse(response.json()).code).toBe('INVALID_ORGANISATION_ID')
  })

  it('carries field-level issues when a body fails validation', async () => {
    const app = await startApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/organisations',
      headers: SAME_ORIGIN,
      payload: { name: 'x', slug: 'Not A Slug' },
    })

    expect(response.statusCode).toBe(400)
    const parsed = errorResponseSchema.parse(response.json())
    expect(parsed.code).toBe('INVALID_REQUEST')
    expect(parsed.issues?.length).toBeGreaterThan(0)
  })

  it('rejects a cookie-authenticated write from another origin', async () => {
    const app = await startApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/organisations',
      headers: { origin: 'https://evil.example', cookie: 'better-auth.session_token=abc' },
      payload: { name: 'Solar Commons', slug: 'solar-commons' },
    })

    expect(response.statusCode).toBe(403)
    expect(errorResponseSchema.parse(response.json()).code).toBe('CSRF_ORIGIN_MISMATCH')
  })
})
