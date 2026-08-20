import { z } from 'zod'
import { SIMULATION_DAY_TYPES } from '../simulations/monteCarlo.js'

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
