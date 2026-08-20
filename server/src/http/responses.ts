import { z } from 'zod'
import {
  invitationStatuses,
  ledgerEventTypes,
  membershipRoles,
  simulationOutcomes,
  simulationStatuses,
} from '../db/models.js'
import { ASSIGNABLE_ROLES } from './schemas.js'

/**
 * Response shapes for `/api/v1`, described in Zod.
 *
 * Unlike the request schemas, these are not applied by the handlers — the
 * serializers build plain objects. They are enforced instead by the contract
 * tests, which parse real responses from the running app through them, and they
 * are the source the OpenAPI document is generated from. A serializer that
 * changes shape therefore fails the contract suite rather than silently
 * publishing a stale document.
 *
 * Nullability here mirrors the MongoDB documents exactly: a membership may have
 * no email, a queued run has no result digest or completion time, and only the
 * first ledger event has no previous seal.
 */

const isoDateTime = z.string().describe('ISO-8601 timestamp')
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Calendar date, YYYY-MM-DD')

// -------------------------------------------------------------------- errors

/** The single envelope every `/api/v1` failure uses. */
export const errorResponseSchema = z.object({
  error: z.string().describe('Human-readable message; safe to show a user'),
  code: z.string().describe('Stable machine-readable code'),
  issues: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional()
    .describe('Field-level validation detail, present on some 400 responses'),
}).strict()

/** Quota exhaustion adds the current allowance to the error envelope. */
export const quotaErrorResponseSchema = errorResponseSchema.extend({
  quota: z.lazy(() => simulationQuotaSchema),
})

// --------------------------------------------------------------------- health

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('volt-api'),
  database: z.literal('ok'),
}).strict()

export const healthDegradedResponseSchema = z.object({
  status: z.literal('degraded'),
  service: z.literal('volt-api'),
  database: z.literal('unavailable'),
}).strict()

// -------------------------------------------------------------------- session

export const sessionResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
  }),
  session: z.object({
    id: z.string(),
    expiresAt: isoDateTime,
  }),
}).strict()

// -------------------------------------------------------------- organisations

export const organisationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  role: z.enum(membershipRoles).describe("The requesting user's own role"),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
}).strict()

export const organisationListResponseSchema = z.object({
  organisations: z.array(organisationSchema),
}).strict()

export const organisationResponseSchema = z.object({
  organisation: organisationSchema,
}).strict()

// --------------------------------------------------------------- memberships

export const membershipSchema = z.object({
  id: z.string(),
  userId: z.string(),
  email: z.string().nullable().describe('Null when no address was recorded for the membership'),
  role: z.enum(membershipRoles),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
}).strict()

export const membershipListResponseSchema = z.object({
  members: z.array(membershipSchema),
}).strict()

export const membershipResponseSchema = z.object({
  member: membershipSchema,
}).strict()

export const ownershipTransferResponseSchema = z.object({
  ownership: z.object({
    previousOwner: membershipSchema.describe('The acting owner, now demoted to admin'),
    newOwner: membershipSchema,
  }),
}).strict()

// --------------------------------------------------------------- invitations

export const invitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.enum(ASSIGNABLE_ROLES).describe('Never owner; ownership moves only by transfer'),
  status: z.enum(invitationStatuses),
  expiresAt: isoDateTime,
  createdAt: isoDateTime.optional().describe('Present on the list route only'),
}).strict()

export const invitationListResponseSchema = z.object({
  invitations: z.array(invitationSchema),
}).strict()

export const invitationResponseSchema = z.object({
  invitation: invitationSchema,
}).strict()

export const acceptInvitationResponseSchema = z.object({
  organisationId: z.string().uuid(),
  membershipId: z.string(),
  role: z.enum(membershipRoles),
}).strict()

// --------------------------------------------------------------- simulations

export const simulationRunSchema = z.object({
  id: z.string(),
  organisationId: z.string().uuid(),
  requestedByUserId: z.string(),
  seed: z.string(),
  modelVersion: z.string(),
  status: z.enum(simulationStatuses),
  inputDigest: z.string(),
  resultDigest: z.string().nullable().describe('Set once the run completes'),
  errorCode: z.string().nullable().describe('Set only when the run failed'),
  createdAt: isoDateTime,
  startedAt: isoDateTime.nullable(),
  completedAt: isoDateTime.nullable(),
}).strict()

export const simulationRunResponseSchema = z.object({ run: simulationRunSchema }).strict()

export const simulationRunListResponseSchema = z.object({ runs: z.array(simulationRunSchema) }).strict()

export const simulationQuotaSchema = z.object({
  usageDate: calendarDate.describe('UTC calendar day the usage applies to'),
  used: z.number().int().min(0),
  limit: z.number().int().min(1),
  remaining: z.number().int().min(0),
  resetsAt: isoDateTime.describe('Next UTC midnight'),
}).strict()

export const simulationQuotaResponseSchema = z.object({ quota: simulationQuotaSchema }).strict()

export const simulationIntervalSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  intervalStart: isoDateTime,
  intervalEnd: isoDateTime,
  generatedKwh: z.number(),
  consumedKwh: z.number(),
  importedKwh: z.number(),
  exportedKwh: z.number(),
  estimatedCreditInr: z.number(),
  outcome: z.enum(simulationOutcomes),
  createdAt: isoDateTime,
}).strict()

export const simulationSummarySchema = z.object({
  id: z.string(),
  householdId: z.string(),
  outcome: z.enum(simulationOutcomes),
  intervalCount: z.number().int().min(0),
  generatedKwh: z.number(),
  consumedKwh: z.number(),
  importedKwh: z.number(),
  exportedKwh: z.number(),
  estimatedCreditInr: z.number(),
  createdAt: isoDateTime,
}).strict()

export const simulationResultsResponseSchema = z.object({
  run: simulationRunSchema,
  intervals: z.array(simulationIntervalSchema),
  summaries: z.array(simulationSummarySchema),
}).strict()

// -------------------------------------------------------------------- ledger

export const ledgerEventSchema = z.object({
  id: z.string(),
  sequence: z.number().int().min(1).describe('Monotonic within the organisation, from 1'),
  eventType: z.enum(ledgerEventTypes),
  outcome: z.enum(simulationOutcomes).describe('The accepted Monte Carlo outcome'),
  actorUserId: z.string(),
  householdId: z.string(),
  settlementDate: calendarDate,
  sourceRunId: z.string(),
  simulationResultDigest: z.string(),
  energyKwh: z.number().describe("Synthetic exported kWh; not a meter reading"),
  estimatedCreditInr: z.number().describe('Illustrative rupee value; not a payment obligation'),
  previousSeal: z.string().nullable().describe('Null only for sequence 1'),
  canonicalSeal: z.string().describe('Server-generated hash linking this event to the previous'),
  adjustmentTargetEventId: z.string().nullable().describe('Set on adjustment events only'),
  adjustmentReason: z.string().nullable().describe('Set on adjustment events only'),
  idempotencyKey: z.string().nullable().describe('Set on adjustment events only'),
  createdAt: isoDateTime,
}).strict()

export const ledgerIntegritySchema = z.object({
  valid: z.boolean().describe('Every seal recomputed and every link matched'),
  complete: z.boolean().describe('The returned slice begins at sequence 1'),
  checkedEvents: z.number().int().min(0),
  firstSequence: z.number().int().nullable(),
  lastSequence: z.number().int().nullable(),
}).strict()

export const ledgerListResponseSchema = z.object({
  events: z.array(ledgerEventSchema),
  integrity: ledgerIntegritySchema,
}).strict()

export const settlementResponseSchema = z.object({
  settlement: z.object({
    runId: z.string(),
    resultDigest: z.string().nullable(),
    outcome: z.enum(simulationOutcomes),
    alreadySettled: z.boolean().describe('True when this exact settlement already existed'),
    events: z.array(ledgerEventSchema),
  }),
}).strict()

export const adjustmentResponseSchema = z.object({
  adjustment: z.object({
    alreadyApplied: z.boolean().describe('True when the idempotency key had already been used'),
    event: ledgerEventSchema,
  }),
}).strict()

// --------------------------------------------------------------------- audit

export const auditEventSchema = z.object({
  id: z.string(),
  actorUserId: z.string(),
  action: z.string().describe('Dotted action name, e.g. organisation.created'),
  entityType: z.string(),
  entityId: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: isoDateTime,
}).strict()

export const auditEventPageResponseSchema = z.object({
  events: z.array(auditEventSchema).describe('Newest first'),
  nextCursor: z
    .string()
    .nullable()
    .describe('Opaque position marker; null on the last page'),
}).strict()
