import { z } from 'zod'
import {
  auditEventQuerySchema,
  ledgerQuerySchema,
  simulationListQuerySchema,
  simulationResultsQuerySchema,
} from '../http/schemas.js'
import {
  buildComponentSchemas,
  schemaRef,
  type JsonSchema,
  type RequestSchemaName,
  type ResponseSchemaName,
} from './registry.js'

/**
 * The versioned OpenAPI description of Volt's REST API.
 *
 * Generated, never hand-edited: request and response shapes come from the same
 * Zod objects the handlers and the contract tests use, so the published document
 * cannot describe an API that no longer exists.
 *
 * Targets OpenAPI 3.1, which uses JSON Schema 2020-12 unmodified — the dialect
 * Zod emits. Using 3.0 would mean translating into its older, altered subset and
 * losing `nullable` unions and `const`.
 */

export const OPENAPI_VERSION = '3.1.0'

/** Version of this description. Bump on any published contract change. */
export const DOCUMENT_VERSION = '1.0.0'

type HttpMethod = 'get' | 'post' | 'patch' | 'delete'

type MembershipRole = 'owner' | 'admin' | 'operator' | 'viewer'

interface ErrorDoc {
  status: number
  code: string
  description: string
}

interface SuccessDoc {
  status: number
  description: string
  schema?: ResponseSchemaName
  headers?: Record<string, { description: string; schema: JsonSchema }>
  example?: unknown
}

interface QueryDoc {
  /** Query schema to take this parameter's JSON Schema from. */
  from: z.ZodType
  name: string
  description: string
}

interface RouteDoc {
  method: HttpMethod
  /** Fastify-style path; converted to OpenAPI `{param}` form. */
  path: string
  operationId: string
  summary: string
  description: string
  tags: string[]
  /** Requires a session cookie. */
  authenticated: boolean
  /** Membership roles permitted, when the route is organisation-scoped. */
  roles?: MembershipRole[]
  query?: QueryDoc[]
  requestBody?: { schema: RequestSchemaName; required: boolean; example?: unknown }
  success: SuccessDoc[]
  errors: ErrorDoc[]
}

const RETRY_AFTER_HEADER = {
  'Retry-After': {
    description: 'Seconds until the allowance resets.',
    schema: { type: 'integer', minimum: 1 },
  },
} satisfies Record<string, { description: string; schema: JsonSchema }>

/** Emitted by `getAuthenticatedSession` on every authenticated route. */
const AUTH_ERRORS: ErrorDoc[] = [
  { status: 401, code: 'UNAUTHENTICATED', description: 'No session cookie, or the session has expired.' },
]

/** Emitted by `getOrganisationAccess` on every organisation-scoped route. */
const MEMBERSHIP_ERRORS: ErrorDoc[] = [
  ...AUTH_ERRORS,
  {
    status: 403,
    code: 'ORGANISATION_ACCESS_DENIED',
    description: 'The user has no active membership in this organisation.',
  },
  {
    status: 403,
    code: 'ORGANISATION_ROLE_FORBIDDEN',
    description: "The user's role does not permit this action.",
  },
]

const INVALID_ORGANISATION_ID: ErrorDoc = {
  status: 400,
  code: 'INVALID_ORGANISATION_ID',
  description: 'The organisation identifier in the path is not a UUID.',
}

const ORGANISATION_NOT_FOUND: ErrorDoc = {
  status: 404,
  code: 'ORGANISATION_NOT_FOUND',
  description: 'No such organisation, or it has been archived.',
}

const SIMULATION_EXAMPLE_REQUEST = {
  seed: 'nolambur-2026-08-01',
  simulationDate: '2026-08-01',
  dayType: 'sunny-weekday',
  households: [
    { id: 'h1', pvKw: 3.2, baseLoadKw: 0.9 },
    { id: 'h2', pvKw: 0, baseLoadKw: 1.4 },
  ],
  sampleCount: 100,
  intervalMinutes: 60,
  rateInrPerKwh: 5.5,
}

const SIMULATION_EXAMPLE_RUN = {
  id: 'run_01J8Z0',
  organisationId: '3f1a7c92-9e5b-4a1d-8f2c-6b0d5e4a1c33',
  requestedByUserId: 'user_01J8YZ',
  seed: 'nolambur-2026-08-01',
  modelVersion: 'volt-monte-carlo-1',
  status: 'queued',
  inputDigest: 'b2f1c0d9e8a7',
  resultDigest: null,
  errorCode: null,
  createdAt: '2026-08-01T09:15:00.000Z',
  startedAt: null,
  completedAt: null,
}

const LEDGER_EXAMPLE_EVENT = {
  id: 'evt_01J8Z4',
  sequence: 1,
  eventType: 'settlement',
  outcome: 'p50',
  actorUserId: 'user_01J8YZ',
  householdId: 'h1',
  settlementDate: '2026-08-01',
  sourceRunId: 'run_01J8Z0',
  simulationResultDigest: 'a91c77e0b3d4',
  energyKwh: 4.75,
  estimatedCreditInr: 26.13,
  previousSeal: null,
  canonicalSeal: '7d3a9f21c4e85b60a1f2d8c37e94b5a0d6e1f8b2',
  adjustmentTargetEventId: null,
  adjustmentReason: null,
  idempotencyKey: null,
  createdAt: '2026-08-01T10:02:11.000Z',
}

const ROUTES: RouteDoc[] = [
  {
    method: 'get',
    path: '/health',
    operationId: 'getHealth',
    summary: 'Liveness and database reachability',
    description: 'Unauthenticated. Answers 503 when the MongoDB ping fails.',
    tags: ['System'],
    authenticated: false,
    success: [
      { status: 200, description: 'The API and its database are reachable.', schema: 'HealthResponse' },
      { status: 503, description: 'The database could not be reached.', schema: 'HealthDegradedResponse' },
    ],
    errors: [],
  },
  {
    method: 'get',
    path: '/openapi.json',
    operationId: 'getOpenApiDocument',
    summary: 'This document',
    description:
      'Unauthenticated. Describes the shape of the API, never its data, and clients need it before they have a session.',
    tags: ['System'],
    authenticated: false,
    success: [{ status: 200, description: 'The OpenAPI 3.1 description of this API.' }],
    errors: [],
  },
  {
    method: 'get',
    path: '/api/v1/me',
    operationId: 'getCurrentSession',
    summary: 'The signed-in user and session',
    description: 'Used to restore a session on page load.',
    tags: ['Session'],
    authenticated: true,
    success: [{ status: 200, description: 'The current session.', schema: 'SessionResponse' }],
    errors: AUTH_ERRORS,
  },
  {
    method: 'post',
    path: '/api/v1/organisations',
    operationId: 'createOrganisation',
    summary: 'Create an organisation',
    description:
      'The caller becomes its owner. The organisation and the owner membership are created in one transaction.',
    tags: ['Organisations'],
    authenticated: true,
    requestBody: {
      schema: 'CreateOrganisationRequest',
      required: true,
      example: { name: 'Nolambur Microgrid', slug: 'nolambur-microgrid' },
    },
    success: [{ status: 201, description: 'The created organisation.', schema: 'OrganisationResponse' }],
    errors: [
      ...AUTH_ERRORS,
      { status: 400, code: 'INVALID_REQUEST', description: 'The name or slug failed validation; `issues` lists the fields.' },
      { status: 409, code: 'ORGANISATION_SLUG_CONFLICT', description: 'Another organisation already uses this slug.' },
      { status: 500, code: 'ORGANISATION_CREATE_FAILED', description: 'The transaction could not be completed.' },
    ],
  },
  {
    method: 'get',
    path: '/api/v1/organisations',
    operationId: 'listOrganisations',
    summary: 'Organisations the user belongs to',
    description: "Each entry carries the requesting user's own role.",
    tags: ['Organisations'],
    authenticated: true,
    success: [{ status: 200, description: 'Every active membership.', schema: 'OrganisationListResponse' }],
    errors: AUTH_ERRORS,
  },
  {
    method: 'get',
    path: '/api/v1/organisations/:organisationId',
    operationId: 'getOrganisation',
    summary: 'Read one organisation',
    description: 'Readable by any member.',
    tags: ['Organisations'],
    authenticated: true,
    roles: ['owner', 'admin', 'operator', 'viewer'],
    success: [{ status: 200, description: 'The organisation.', schema: 'OrganisationResponse' }],
    errors: [...MEMBERSHIP_ERRORS, INVALID_ORGANISATION_ID, ORGANISATION_NOT_FOUND],
  },
  {
    method: 'delete',
    path: '/api/v1/organisations/:organisationId',
    operationId: 'archiveOrganisation',
    summary: 'Archive an organisation',
    description:
      'Owner only, and soft: active memberships, invitations, simulation runs, intervals and summaries are marked deleted in one transaction, and pending invitations are revoked. Ledger and audit history are retained for provenance. There is no undo.',
    tags: ['Organisations'],
    authenticated: true,
    roles: ['owner'],
    success: [{ status: 204, description: 'Archived. No body.' }],
    errors: [
      ...MEMBERSHIP_ERRORS,
      INVALID_ORGANISATION_ID,
      ORGANISATION_NOT_FOUND,
      { status: 409, code: 'ORGANISATION_CHANGED', description: 'The organisation changed before deletion; retry.' },
      { status: 500, code: 'ORGANISATION_DELETE_FAILED', description: 'The transaction could not be completed.' },
    ],
  },
  {
    method: 'get',
    path: '/api/v1/organisations/:organisationId/memberships',
    operationId: 'listMemberships',
    summary: 'Active members',
    description: 'Readable by any member. `email` may be null when none was recorded.',
    tags: ['Memberships'],
    authenticated: true,
    roles: ['owner', 'admin', 'operator', 'viewer'],
    success: [{ status: 200, description: 'Every active member.', schema: 'MembershipListResponse' }],
    errors: [...MEMBERSHIP_ERRORS, INVALID_ORGANISATION_ID],
  },
  {
    method: 'patch',
    path: '/api/v1/organisations/:organisationId/memberships/:userId',
    operationId: 'updateMembershipRole',
    summary: 'Change a member role',
    description:
      'Owner or admin. The owner membership is never editable here — ownership moves only through `/ownership/transfer` — and an admin may neither reach another admin nor grant the admin role.',
    tags: ['Memberships'],
    authenticated: true,
    roles: ['owner', 'admin'],
    requestBody: { schema: 'UpdateMembershipRoleRequest', required: true, example: { role: 'operator' } },
    success: [{ status: 200, description: 'The updated membership.', schema: 'MembershipResponse' }],
    errors: [
      ...MEMBERSHIP_ERRORS,
      { status: 400, code: 'INVALID_MEMBERSHIP_ID', description: 'The organisation or user identifier in the path is invalid.' },
      { status: 400, code: 'INVALID_REQUEST', description: 'The role is not one of admin, operator, viewer.' },
      { status: 403, code: 'MEMBERSHIP_OWNER_PROTECTED', description: 'The target is the owner membership.' },
      { status: 403, code: 'MEMBERSHIP_ROLE_FORBIDDEN', description: 'Your role cannot grant or change that role.' },
      { status: 404, code: 'MEMBERSHIP_NOT_FOUND', description: 'No such membership in this organisation.' },
      { status: 409, code: 'MEMBERSHIP_CHANGED', description: 'The membership changed before the update; retry.' },
      { status: 500, code: 'MEMBERSHIP_UPDATE_FAILED', description: 'The update could not be completed.' },
    ],
  },
  {
    method: 'delete',
    path: '/api/v1/organisations/:organisationId/memberships/:userId',
    operationId: 'removeMembership',
    summary: 'Remove a member',
    description: 'Owner or admin. The owner membership cannot be removed.',
    tags: ['Memberships'],
    authenticated: true,
    roles: ['owner', 'admin'],
    success: [{ status: 204, description: 'Removed. No body.' }],
    errors: [
      ...MEMBERSHIP_ERRORS,
      { status: 400, code: 'INVALID_MEMBERSHIP_ID', description: 'The organisation or user identifier in the path is invalid.' },
      { status: 403, code: 'MEMBERSHIP_OWNER_PROTECTED', description: 'The target is the owner membership.' },
      { status: 403, code: 'MEMBERSHIP_ROLE_FORBIDDEN', description: 'Your role cannot remove that membership.' },
      { status: 404, code: 'MEMBERSHIP_NOT_FOUND', description: 'No such membership in this organisation.' },
      { status: 409, code: 'MEMBERSHIP_CHANGED', description: 'The membership changed before removal; retry.' },
      { status: 500, code: 'MEMBERSHIP_REMOVE_FAILED', description: 'The removal could not be completed.' },
    ],
  },
  {
    method: 'post',
    path: '/api/v1/organisations/:organisationId/ownership/transfer',
    operationId: 'transferOwnership',
    summary: 'Hand ownership to another member',
    description:
      'Owner only. Atomically promotes an existing active member to owner and demotes the acting owner to admin, so the caller loses owner rights as part of the success path. Audited.',
    tags: ['Memberships'],
    authenticated: true,
    roles: ['owner'],
    requestBody: { schema: 'TransferOwnershipRequest', required: true, example: { newOwnerUserId: 'user_01J8YZ' } },
    success: [{ status: 200, description: 'Both sides of the transfer.', schema: 'OwnershipTransferResponse' }],
    errors: [
      ...MEMBERSHIP_ERRORS,
      INVALID_ORGANISATION_ID,
      { status: 400, code: 'INVALID_REQUEST', description: 'The body is missing `newOwnerUserId`.' },
      { status: 400, code: 'OWNER_TRANSFER_INVALID', description: 'The new owner must be a different active member.' },
      ORGANISATION_NOT_FOUND,
      { status: 404, code: 'MEMBERSHIP_NOT_FOUND', description: 'The target membership does not exist.' },
      { status: 409, code: 'OWNER_TRANSFER_TARGET_INVALID', description: 'The target is already the owner.' },
      { status: 409, code: 'MEMBERSHIP_CHANGED', description: 'A membership changed before the transfer; retry.' },
      { status: 500, code: 'OWNER_TRANSFER_FAILED', description: 'The transaction could not be completed.' },
    ],
  },
  {
    method: 'post',
    path: '/api/v1/organisations/:organisationId/invitations',
    operationId: 'createInvitation',
    summary: 'Invite somebody by email',
    description:
      'Owner or admin; an admin may not invite an admin. The invitation and its encrypted email delivery record are written atomically, and the worker delivers the message with idempotent retries. A 202 means the invitation is queued; delivery can be observed through the recipient email and worker operations. Only a hash of the single-use token is stored.',
    tags: ['Invitations'],
    authenticated: true,
    roles: ['owner', 'admin'],
    requestBody: {
      schema: 'CreateInvitationRequest',
      required: true,
      example: { email: 'asha@example.com', role: 'operator' },
    },
    success: [{ status: 202, description: 'The pending invitation queued for email delivery.', schema: 'InvitationResponse' }],
    errors: [
      ...MEMBERSHIP_ERRORS,
      INVALID_ORGANISATION_ID,
      { status: 400, code: 'INVALID_REQUEST', description: 'The email or role failed validation.' },
      { status: 403, code: 'INVITATION_ROLE_FORBIDDEN', description: 'An admin cannot invite another admin.' },
      ORGANISATION_NOT_FOUND,
      { status: 409, code: 'INVITATION_ALREADY_PENDING', description: 'An invitation is already pending for this email.' },
      { status: 500, code: 'INVITATION_CREATE_FAILED', description: 'The invitation could not be created.' },
    ],
  },
  {
    method: 'get',
    path: '/api/v1/organisations/:organisationId/invitations',
    operationId: 'listInvitations',
    summary: 'Invitation history',
    description: 'Owner or admin. Includes accepted and revoked invitations; records are retained.',
    tags: ['Invitations'],
    authenticated: true,
    roles: ['owner', 'admin'],
    success: [{ status: 200, description: 'Every invitation, with `createdAt`.', schema: 'InvitationListResponse' }],
    errors: [...MEMBERSHIP_ERRORS, INVALID_ORGANISATION_ID],
  },
  {
    method: 'delete',
    path: '/api/v1/organisations/:organisationId/invitations/:invitationId',
    operationId: 'revokeInvitation',
    summary: 'Revoke a pending invitation',
    description:
      'Owner or admin; an admin may not revoke an admin invitation. The record and its token hash are retained for history.',
    tags: ['Invitations'],
    authenticated: true,
    roles: ['owner', 'admin'],
    success: [{ status: 204, description: 'Revoked. No body.' }],
    errors: [
      ...MEMBERSHIP_ERRORS,
      { status: 400, code: 'INVALID_INVITATION_ID', description: 'The organisation or invitation identifier is invalid.' },
      { status: 403, code: 'INVITATION_ROLE_FORBIDDEN', description: 'An admin cannot revoke an admin invitation.' },
      { status: 404, code: 'INVITATION_NOT_FOUND', description: 'No such invitation in this organisation.' },
      { status: 409, code: 'INVITATION_NOT_PENDING', description: 'The invitation is already accepted or revoked.' },
      { status: 409, code: 'INVITATION_CHANGED', description: 'The invitation changed before revocation; retry.' },
      { status: 500, code: 'INVITATION_REVOKE_FAILED', description: 'The revocation could not be completed.' },
    ],
  },
  {
    method: 'post',
    path: '/api/v1/invitations/accept',
    operationId: 'acceptInvitation',
    summary: 'Accept an invitation',
    description:
      'Requires an authenticated user whose **verified** email matches the invited address. Turns the invitation into a membership. Not organisation-scoped: the token names the organisation.',
    tags: ['Invitations'],
    authenticated: true,
    requestBody: { schema: 'AcceptInvitationRequest', required: true, example: { token: 'inv_9f2c…' } },
    success: [{ status: 200, description: 'The membership just created.', schema: 'AcceptInvitationResponse' }],
    errors: [
      ...AUTH_ERRORS,
      { status: 400, code: 'INVALID_REQUEST', description: 'The body is missing a token.' },
      { status: 400, code: 'INVITATION_INVALID', description: 'The invitation is unknown, expired, or already used.' },
      { status: 403, code: 'EMAIL_NOT_VERIFIED', description: 'Verify your email address before accepting.' },
      { status: 403, code: 'INVITATION_EMAIL_MISMATCH', description: 'The invitation was issued to a different address.' },
      { status: 409, code: 'MEMBERSHIP_EXISTS', description: 'You already belong to this organisation.' },
      { status: 500, code: 'INVITATION_ACCEPT_FAILED', description: 'The transaction could not be completed.' },
    ],
  },
  {
    method: 'post',
    path: '/api/v1/organisations/:organisationId/simulations',
    operationId: 'createSimulationRun',
    summary: 'Queue a simulation run',
    description:
      'Owner, admin or operator. Answers 202: the run is **queued**, not computed. A separate worker claims it, so poll `GET /simulations/{runId}` for status. One unit of the organisation\'s UTC daily allowance is reserved in the same transaction as the queue insert. Runs are replayable from their seed, model version and input digest. All data is synthetic.',
    tags: ['Simulations'],
    authenticated: true,
    roles: ['owner', 'admin', 'operator'],
    requestBody: { schema: 'CreateSimulationRequest', required: true, example: SIMULATION_EXAMPLE_REQUEST },
    success: [
      {
        status: 202,
        description: 'The queued run.',
        schema: 'SimulationRunResponse',
        example: { run: SIMULATION_EXAMPLE_RUN },
      },
    ],
    errors: [
      ...MEMBERSHIP_ERRORS,
      INVALID_ORGANISATION_ID,
      { status: 400, code: 'INVALID_REQUEST', description: 'The simulation input failed validation.' },
      ORGANISATION_NOT_FOUND,
      { status: 429, code: 'SIMULATION_QUOTA_EXCEEDED', description: 'The daily allowance is spent. Carries `quota` and a `Retry-After` header.' },
      { status: 500, code: 'SIMULATION_QUEUE_FAILED', description: 'The run could not be queued.' },
    ],
  },
  {
    method: 'get',
    path: '/api/v1/organisations/:organisationId/simulations',
    operationId: 'listSimulationRuns',
    summary: 'Recent simulation runs',
    description: 'Readable by any member. Newest first.',
    tags: ['Simulations'],
    authenticated: true,
    roles: ['owner', 'admin', 'operator', 'viewer'],
    query: [
      { from: simulationListQuerySchema, name: 'limit', description: 'Maximum runs to return. Defaults to 50.' },
    ],
    success: [{ status: 200, description: 'The runs.', schema: 'SimulationRunListResponse' }],
    errors: [
      ...MEMBERSHIP_ERRORS,
      INVALID_ORGANISATION_ID,
      { status: 400, code: 'INVALID_REQUEST', description: 'The `limit` is outside 1–100.' },
      ORGANISATION_NOT_FOUND,
    ],
  },
  {
    method: 'get',
    path: '/api/v1/organisations/:organisationId/simulations/quota',
    operationId: 'getSimulationQuota',
    summary: 'Daily run allowance',
    description:
      'Readable by any member. The allowance is per UTC calendar day and resets at the next UTC midnight.',
    tags: ['Simulations'],
    authenticated: true,
    roles: ['owner', 'admin', 'operator', 'viewer'],
    success: [{ status: 200, description: 'The current allowance.', schema: 'SimulationQuotaResponse' }],
    errors: [...MEMBERSHIP_ERRORS, INVALID_ORGANISATION_ID, ORGANISATION_NOT_FOUND],
  },
  {
    method: 'get',
    path: '/api/v1/organisations/:organisationId/simulations/queue',
    operationId: 'getSimulationQueue',
    summary: 'Queue depth and worker liveness',
    description:
      'Readable by any member. Reports how many runs in this organisation are waiting or in flight, how long the ' +
      'longest-waiting one has been queued, and whether a worker is draining the queue. The two readings only mean ' +
      'something together: a backlog with a `live` worker is a busy system, the same backlog with a `stale` worker is ' +
      'an outage. Worker detail is deliberately coarse — no identity, failure counts, or error codes — because every ' +
      'member can read it.',
    tags: ['Simulations'],
    authenticated: true,
    roles: ['owner', 'admin', 'operator', 'viewer'],
    success: [{ status: 200, description: 'The current depth and worker reading.', schema: 'SimulationQueueResponse' }],
    errors: [...MEMBERSHIP_ERRORS, INVALID_ORGANISATION_ID, ORGANISATION_NOT_FOUND],
  },
  {
    method: 'get',
    path: '/api/v1/organisations/:organisationId/simulations/:runId',
    operationId: 'getSimulationRun',
    summary: 'Simulation run status',
    description:
      'Readable by any member. Poll this while `status` is `queued` or `running`; it settles on `completed`, `failed` or `cancelled`.',
    tags: ['Simulations'],
    authenticated: true,
    roles: ['owner', 'admin', 'operator', 'viewer'],
    success: [{ status: 200, description: 'The run.', schema: 'SimulationRunResponse' }],
    errors: [
      ...MEMBERSHIP_ERRORS,
      { status: 400, code: 'INVALID_SIMULATION_ID', description: 'The organisation or run identifier is invalid.' },
      ORGANISATION_NOT_FOUND,
      { status: 404, code: 'SIMULATION_NOT_FOUND', description: 'No such run in this organisation.' },
    ],
  },
  {
    method: 'get',
    path: '/api/v1/organisations/:organisationId/simulations/:runId/results',
    operationId: 'getSimulationResults',
    summary: 'Interval and summary results',
    description:
      'Readable by any member, and only once the run has completed. Outcomes are the P10, P50, P90 and selected-sample bands of a synthetic Monte Carlo run — not forecasts or meter readings.',
    tags: ['Simulations'],
    authenticated: true,
    roles: ['owner', 'admin', 'operator', 'viewer'],
    query: [
      { from: simulationResultsQuerySchema, name: 'limit', description: 'Maximum intervals to return. Defaults to 1000.' },
    ],
    success: [{ status: 200, description: 'The run with its intervals and summaries.', schema: 'SimulationResultsResponse' }],
    errors: [
      ...MEMBERSHIP_ERRORS,
      { status: 400, code: 'INVALID_SIMULATION_ID', description: 'The organisation or run identifier is invalid.' },
      { status: 400, code: 'INVALID_REQUEST', description: 'The `limit` is outside 1–10000.' },
      ORGANISATION_NOT_FOUND,
      { status: 404, code: 'SIMULATION_NOT_FOUND', description: 'No such run in this organisation.' },
      { status: 409, code: 'SIMULATION_NOT_COMPLETE', description: 'The run has not finished; this is normal while queued.' },
    ],
  },
  {
    method: 'post',
    path: '/api/v1/organisations/:organisationId/simulations/:runId/settlement',
    operationId: 'settleSimulationRun',
    summary: 'Accept a completed outcome into the ledger',
    description:
      'Owner or admin. Appends one immutable, hash-linked settlement event per household, binding the run\'s result digest and the chosen outcome. Energy is that outcome\'s synthetic `exportedKwh` — not a meter reading or a payment.\n\n**Idempotency.** Repeating the same acceptance returns 200 with `alreadySettled: true` and the existing events; nothing is appended twice. Accepting a *different* outcome for an already-settled run is refused with 409.',
    tags: ['Ledger'],
    authenticated: true,
    roles: ['owner', 'admin'],
    requestBody: { schema: 'SettleSimulationRequest', required: false, example: { outcome: 'p50' } },
    success: [
      {
        status: 201,
        description: 'The settlement events just appended.',
        schema: 'SettlementResponse',
        example: {
          settlement: {
            runId: 'run_01J8Z0',
            resultDigest: 'a91c77e0b3d4',
            outcome: 'p50',
            alreadySettled: false,
            events: [LEDGER_EXAMPLE_EVENT],
          },
        },
      },
      {
        status: 200,
        description: 'Already settled with this outcome; nothing was appended.',
        schema: 'SettlementResponse',
        example: {
          settlement: {
            runId: 'run_01J8Z0',
            resultDigest: 'a91c77e0b3d4',
            outcome: 'p50',
            alreadySettled: true,
            events: [LEDGER_EXAMPLE_EVENT],
          },
        },
      },
    ],
    errors: [
      ...MEMBERSHIP_ERRORS,
      { status: 400, code: 'INVALID_SIMULATION_ID', description: 'The organisation or run identifier is invalid.' },
      { status: 400, code: 'INVALID_REQUEST', description: 'The outcome is not one of p10, p50, p90, selected.' },
      ORGANISATION_NOT_FOUND,
      { status: 404, code: 'SIMULATION_NOT_FOUND', description: 'No such run in this organisation.' },
      { status: 409, code: 'SIMULATION_NOT_COMPLETE', description: 'Only a completed run can be settled.' },
      { status: 409, code: 'SIMULATION_ALREADY_SETTLED_DIFFERENT_OUTCOME', description: 'The run was already settled with another outcome.' },
      { status: 409, code: 'SIMULATION_SUMMARIES_INCOMPLETE', description: 'The run has no summaries for the chosen outcome.' },
      { status: 422, code: 'SIMULATION_RESULT_DIGEST_MISSING', description: 'The run carries no result digest to bind.' },
      { status: 422, code: 'SIMULATION_DATE_MISSING', description: 'The frozen input snapshot has no simulation date.' },
      { status: 422, code: 'SIMULATION_HOUSEHOLDS_MISSING', description: 'The frozen input snapshot has no households.' },
      { status: 500, code: 'LEDGER_SETTLEMENT_FAILED', description: 'The transaction could not be completed.' },
    ],
  },
  {
    method: 'get',
    path: '/api/v1/organisations/:organisationId/ledger',
    operationId: 'listLedgerEvents',
    summary: 'Settlement ledger history',
    description:
      'Readable by any member. Returns the events together with the server\'s own integrity verdict over the returned slice: every seal is recomputed and every link re-checked. `complete` is false when the slice does not begin at sequence 1.',
    tags: ['Ledger'],
    authenticated: true,
    roles: ['owner', 'admin', 'operator', 'viewer'],
    query: [{ from: ledgerQuerySchema, name: 'limit', description: 'Maximum events to return. Defaults to 100.' }],
    success: [
      {
        status: 200,
        description: 'The events and their integrity verdict.',
        schema: 'LedgerListResponse',
        example: {
          events: [LEDGER_EXAMPLE_EVENT],
          integrity: { valid: true, complete: true, checkedEvents: 1, firstSequence: 1, lastSequence: 1 },
        },
      },
    ],
    errors: [
      ...MEMBERSHIP_ERRORS,
      INVALID_ORGANISATION_ID,
      { status: 400, code: 'INVALID_REQUEST', description: 'The `limit` is outside 1–500.' },
      ORGANISATION_NOT_FOUND,
    ],
  },
  {
    method: 'post',
    path: '/api/v1/organisations/:organisationId/ledger/adjustments',
    operationId: 'createLedgerAdjustment',
    summary: 'Append a correction to an accepted settlement',
    description:
      'Owner or admin. Appends a new immutable event carrying a signed energy and credit delta against a target settlement event. **The target is never modified** — history is corrected by addition, not edit. The adjustment inherits the target\'s settlement provenance.\n\n**Idempotency.** `idempotencyKey` makes retries safe: replaying a key with the same values returns 200 with `alreadyApplied: true`, while reusing it with different values is refused with 409.',
    tags: ['Ledger'],
    authenticated: true,
    roles: ['owner', 'admin'],
    requestBody: {
      schema: 'CreateAdjustmentRequest',
      required: true,
      example: {
        targetEventId: 'evt_01J8Z4',
        idempotencyKey: 'correction-h1-2026-08-01',
        energyKwh: -0.5,
        estimatedCreditInr: -2.75,
        reason: 'Duplicate export corrected after inverter audit',
      },
    },
    success: [
      {
        status: 201,
        description: 'The correction event just appended.',
        schema: 'AdjustmentResponse',
        example: {
          adjustment: {
            alreadyApplied: false,
            event: {
              ...LEDGER_EXAMPLE_EVENT,
              id: 'evt_01J8Z5',
              sequence: 2,
              eventType: 'adjustment',
              energyKwh: -0.5,
              estimatedCreditInr: -2.75,
              previousSeal: LEDGER_EXAMPLE_EVENT.canonicalSeal,
              canonicalSeal: 'c15e93a7f2048d6b',
              adjustmentTargetEventId: 'evt_01J8Z4',
              adjustmentReason: 'Duplicate export corrected after inverter audit',
              idempotencyKey: 'correction-h1-2026-08-01',
            },
          },
        },
      },
      { status: 200, description: 'This idempotency key was already applied; nothing was appended.', schema: 'AdjustmentResponse' },
    ],
    errors: [
      ...MEMBERSHIP_ERRORS,
      INVALID_ORGANISATION_ID,
      { status: 400, code: 'INVALID_REQUEST', description: 'The adjustment failed validation, including a delta that changes neither energy nor credit.' },
      ORGANISATION_NOT_FOUND,
      { status: 404, code: 'LEDGER_TARGET_NOT_FOUND', description: 'The target event does not exist in this organisation.' },
      { status: 409, code: 'LEDGER_ADJUSTMENT_TARGET_INVALID', description: 'The target cannot be adjusted; corrections target settlement events.' },
      { status: 409, code: 'LEDGER_IDEMPOTENCY_CONFLICT', description: 'This key was already used with different values.' },
      { status: 500, code: 'LEDGER_ADJUSTMENT_FAILED', description: 'The transaction could not be completed.' },
    ],
  },
  {
    method: 'get',
    path: '/api/v1/organisations/:organisationId/audit-events',
    operationId: 'listAuditEvents',
    summary: 'Organisation audit history',
    description:
      'Owner or admin only. Ordered newest first by creation time then event id.\n\n**Pagination.** Follow the opaque `nextCursor` rather than an offset: it encodes only a position, carries no authorization, and stays stable while new events are appended ahead of it. `nextCursor` is null on the last page. Re-send the same `action` filter with each page — a cursor belongs to the query that produced it. Audit history is retained for provenance, including after an organisation is archived.',
    tags: ['Audit'],
    authenticated: true,
    roles: ['owner', 'admin'],
    query: [
      { from: auditEventQuerySchema, name: 'limit', description: 'Maximum events per page. Defaults to 100.' },
      { from: auditEventQuerySchema, name: 'action', description: 'Exact action match, e.g. `organisation.created`.' },
      { from: auditEventQuerySchema, name: 'cursor', description: 'Opaque `nextCursor` from the previous page.' },
    ],
    success: [{ status: 200, description: 'One page of audit events.', schema: 'AuditEventPageResponse' }],
    errors: [
      ...MEMBERSHIP_ERRORS,
      INVALID_ORGANISATION_ID,
      { status: 400, code: 'INVALID_REQUEST', description: 'The `limit`, `action` or `cursor` failed validation.' },
      { status: 400, code: 'INVALID_AUDIT_CURSOR', description: 'The cursor is not a position marker this API issued.' },
      ORGANISATION_NOT_FOUND,
    ],
  },
]

/** `/organisations/:organisationId` -> `/organisations/{organisationId}` */
function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
}

function pathParameterNames(path: string): string[] {
  return [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => match[1] as string)
}

const PATH_PARAMETER_DESCRIPTIONS: Record<string, { description: string; schema: JsonSchema }> = {
  organisationId: { description: 'Organisation UUID.', schema: { type: 'string', format: 'uuid' } },
  userId: { description: 'The member\'s user identifier.', schema: { type: 'string', minLength: 1, maxLength: 200 } },
  invitationId: { description: 'Invitation identifier.', schema: { type: 'string', minLength: 1, maxLength: 200 } },
  runId: { description: 'Simulation run identifier.', schema: { type: 'string', minLength: 1, maxLength: 200 } },
}

/** Pulls one property's JSON Schema out of a query object schema. */
function queryParameterSchema(schema: z.ZodType, name: string): { schema: JsonSchema; required: boolean } {
  const converted = z.toJSONSchema(schema, { io: 'input' }) as {
    properties?: Record<string, JsonSchema>
    required?: string[]
  }
  const property = converted.properties?.[name]
  if (!property) throw new Error(`Query parameter ${name} is not part of its schema`)
  return { schema: property, required: converted.required?.includes(name) ?? false }
}

function buildOperation(route: RouteDoc): JsonSchema {
  const parameters: JsonSchema[] = []

  for (const name of pathParameterNames(route.path)) {
    const known = PATH_PARAMETER_DESCRIPTIONS[name]
    parameters.push({
      name,
      in: 'path',
      required: true,
      description: known?.description ?? `${name} path parameter.`,
      schema: known?.schema ?? { type: 'string' },
    })
  }

  for (const query of route.query ?? []) {
    const { schema, required } = queryParameterSchema(query.from, query.name)
    parameters.push({
      name: query.name,
      in: 'query',
      required,
      description: query.description,
      schema,
    })
  }

  const responses: Record<string, JsonSchema> = {}

  for (const success of route.success) {
    const content = success.schema
      ? {
          content: {
            'application/json': {
              schema: schemaRef(success.schema),
              ...(success.example === undefined ? {} : { example: success.example }),
            },
          },
        }
      : {}
    responses[String(success.status)] = { description: success.description, ...content }
  }

  // Group the documented error codes by status, so each status appears once
  // with every code that can produce it.
  const byStatus = new Map<number, ErrorDoc[]>()
  for (const error of route.errors) {
    const bucket = byStatus.get(error.status) ?? []
    bucket.push(error)
    byStatus.set(error.status, bucket)
  }

  for (const [status, errors] of [...byStatus.entries()].sort((a, b) => a[0] - b[0])) {
    const codeList = errors.map((error) => `- \`${error.code}\` — ${error.description}`).join('\n')
    const quotaResponse = errors.some((error) => error.code === 'SIMULATION_QUOTA_EXCEEDED')
    responses[String(status)] = {
      description: codeList,
      ...(quotaResponse ? { headers: RETRY_AFTER_HEADER } : {}),
      content: {
        'application/json': {
          schema: schemaRef(quotaResponse ? 'QuotaErrorResponse' : 'ErrorResponse'),
        },
      },
    }
  }

  const roleNote = route.roles
    ? `\n\n**Roles.** ${route.roles.map((role) => `\`${role}\``).join(', ')}.`
    : ''

  return {
    operationId: route.operationId,
    summary: route.summary,
    description: `${route.description}${roleNote}`,
    tags: route.tags,
    ...(route.authenticated ? { security: [{ sessionCookie: [] }] } : { security: [] }),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(route.requestBody
      ? {
          requestBody: {
            required: route.requestBody.required,
            content: {
              'application/json': {
                schema: schemaRef(route.requestBody.schema),
                ...(route.requestBody.example === undefined
                  ? {}
                  : { example: route.requestBody.example }),
              },
            },
          },
        }
      : {}),
    responses,
  }
}

export interface BuildDocumentOptions {
  /** Public base URL of the API, e.g. `https://api.volt.example`. */
  serverUrl?: string
  version?: string
}

export function buildOpenApiDocument(options: BuildDocumentOptions = {}): JsonSchema {
  const paths: Record<string, JsonSchema> = {}

  for (const route of ROUTES) {
    const path = toOpenApiPath(route.path)
    const entry = (paths[path] ?? {}) as Record<string, unknown>
    entry[route.method] = buildOperation(route)
    paths[path] = entry as JsonSchema
  }

  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: 'Volt API',
      version: options.version ?? DOCUMENT_VERSION,
      description: [
        'REST API for Volt, a tamper-evident ledger for synthetic neighbourhood solar exchange.',
        '',
        '**All data is synthetic.** Simulation outcomes are Monte Carlo bands over a seeded, replayable model; ledger energy is an accepted outcome\'s synthetic exported kWh and estimated credit is illustrative. Nothing here is a meter reading, a forecast, or a payment obligation.',
        '',
        '**Authentication** is a session cookie issued by Better Auth. Sign-in, sign-up and sign-out live under `/api/auth/*`, which Better Auth owns and this document therefore does not describe; obtain a session there, then call these routes with the cookie. Cookie-authenticated state-changing requests must also carry a same-origin `Origin` or `Referer`, or the API answers 403 `CSRF_ORIGIN_MISMATCH`. Requests are rate limited and the body size is bounded.',
        '',
        '**Errors** all share one envelope: `error` for people, `code` for programs, and an optional `issues` array naming the fields that failed. Each response below lists the codes that status can carry.',
      ].join('\n'),
      license: { name: 'MIT', identifier: 'MIT' },
    },
    servers: [{ url: options.serverUrl ?? 'http://localhost:4000', description: 'Local development' }],
    tags: [
      { name: 'System', description: 'Liveness.' },
      { name: 'Session', description: 'The signed-in user.' },
      { name: 'Organisations', description: 'Organisations and their lifecycle.' },
      { name: 'Memberships', description: 'Roles and ownership.' },
      { name: 'Invitations', description: 'Email-backed access grants.' },
      { name: 'Simulations', description: 'Queued synthetic Monte Carlo runs.' },
      { name: 'Ledger', description: 'Append-only settlements and corrections.' },
      { name: 'Audit', description: 'Cursor-paginated organisation history.' },
    ],
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'better-auth.session_token',
          description: 'Session cookie issued by Better Auth. Send with `credentials: "include"`.',
        },
      },
      schemas: buildComponentSchemas(),
    },
    paths,
  }
}

/** Route table entries, exposed so tests can compare them with the live app. */
export const DOCUMENTED_ROUTES: ReadonlyArray<{ method: HttpMethod; path: string }> = ROUTES.map(
  (route) => ({ method: route.method, path: route.path }),
)
