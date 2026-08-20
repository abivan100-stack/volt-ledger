import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  adjustmentResponseSchema,
  auditEventPageResponseSchema,
  errorResponseSchema,
  invitationSchema,
  ledgerEventSchema,
  ledgerListResponseSchema,
  membershipSchema,
  organisationSchema,
  quotaErrorResponseSchema,
  sessionResponseSchema,
  settlementResponseSchema,
  simulationQuotaSchema,
  simulationResultsResponseSchema,
  simulationRunSchema,
} from './responses.js'

const UUID = '11111111-1111-4111-8111-111111111111'
const WHEN = '2026-08-01T00:00:00.000Z'

describe('errorResponseSchema', () => {
  it('accepts the minimal envelope', () => {
    expect(errorResponseSchema.safeParse({ error: 'Nope', code: 'UNAUTHENTICATED' }).success).toBe(true)
  })

  it('accepts field-level issues', () => {
    const result = errorResponseSchema.safeParse({
      error: 'Invalid organisation input',
      code: 'INVALID_REQUEST',
      issues: [{ path: 'slug', message: 'Invalid' }],
    })
    expect(result.success).toBe(true)
  })

  it('requires both error and code', () => {
    expect(errorResponseSchema.safeParse({ error: 'Nope' }).success).toBe(false)
    expect(errorResponseSchema.safeParse({ code: 'X' }).success).toBe(false)
  })
})

describe('quotaErrorResponseSchema', () => {
  it('carries the current allowance alongside the envelope', () => {
    const result = quotaErrorResponseSchema.safeParse({
      error: 'Daily simulation quota exceeded',
      code: 'SIMULATION_QUOTA_EXCEEDED',
      quota: { usageDate: '2026-08-01', used: 100, limit: 100, remaining: 0, resetsAt: WHEN },
    })
    expect(result.success).toBe(true)
  })
})

describe('sessionResponseSchema', () => {
  it('accepts a signed-in user', () => {
    const result = sessionResponseSchema.safeParse({
      user: { id: 'user-1', name: 'Asha', email: 'asha@example.com', emailVerified: true },
      session: { id: 'session-1', expiresAt: WHEN },
    })
    expect(result.success).toBe(true)
  })
})

describe('organisationSchema', () => {
  it('requires the caller role', () => {
    const base = { id: UUID, name: 'Nolambur', slug: 'nolambur', createdAt: WHEN, updatedAt: WHEN }
    expect(organisationSchema.safeParse(base).success).toBe(false)
    expect(organisationSchema.safeParse({ ...base, role: 'owner' }).success).toBe(true)
  })
})

describe('membershipSchema', () => {
  const base = { id: 'm1', userId: 'u1', role: 'operator', createdAt: WHEN, updatedAt: WHEN }

  it('allows a membership with no recorded email', () => {
    expect(membershipSchema.safeParse({ ...base, email: null }).success).toBe(true)
  })

  it('allows a membership with an email', () => {
    expect(membershipSchema.safeParse({ ...base, email: 'asha@example.com' }).success).toBe(true)
  })

  it('still requires the email key to be present', () => {
    expect(membershipSchema.safeParse(base).success).toBe(false)
  })
})

describe('invitationSchema', () => {
  const base = { id: 'i1', email: 'asha@example.com', status: 'pending', expiresAt: WHEN }

  it('never accepts the owner role', () => {
    expect(invitationSchema.safeParse({ ...base, role: 'owner' }).success).toBe(false)
    expect(invitationSchema.safeParse({ ...base, role: 'admin' }).success).toBe(true)
  })

  it('treats createdAt as optional, since only the list route includes it', () => {
    expect(invitationSchema.safeParse({ ...base, role: 'viewer' }).success).toBe(true)
    expect(invitationSchema.safeParse({ ...base, role: 'viewer', createdAt: WHEN }).success).toBe(true)
  })
})

describe('simulationRunSchema', () => {
  const queued = {
    id: 'run-1',
    organisationId: UUID,
    requestedByUserId: 'user-1',
    seed: 'seed-1',
    modelVersion: 'monte-carlo-1',
    status: 'queued',
    inputDigest: 'digest',
    resultDigest: null,
    errorCode: null,
    createdAt: WHEN,
    startedAt: null,
    completedAt: null,
  }

  it('accepts a queued run with no result digest or timings', () => {
    expect(simulationRunSchema.safeParse(queued).success).toBe(true)
  })

  it('accepts a completed run', () => {
    const completed = { ...queued, status: 'completed', resultDigest: 'rd', completedAt: WHEN }
    expect(simulationRunSchema.safeParse(completed).success).toBe(true)
  })

  it('rejects an unknown status', () => {
    expect(simulationRunSchema.safeParse({ ...queued, status: 'pending' }).success).toBe(false)
  })
})

describe('simulationQuotaSchema', () => {
  it('requires a YYYY-MM-DD usage date', () => {
    const base = { used: 1, limit: 100, remaining: 99, resetsAt: WHEN }
    expect(simulationQuotaSchema.safeParse({ ...base, usageDate: '2026-08-01' }).success).toBe(true)
    expect(simulationQuotaSchema.safeParse({ ...base, usageDate: '01-08-2026' }).success).toBe(false)
  })
})

describe('simulationResultsResponseSchema', () => {
  it('accepts a completed run with empty result sets', () => {
    const result = simulationResultsResponseSchema.safeParse({
      run: {
        id: 'run-1',
        organisationId: UUID,
        requestedByUserId: 'user-1',
        seed: 'seed-1',
        modelVersion: 'monte-carlo-1',
        status: 'completed',
        inputDigest: 'digest',
        resultDigest: 'rd',
        errorCode: null,
        createdAt: WHEN,
        startedAt: WHEN,
        completedAt: WHEN,
      },
      intervals: [],
      summaries: [],
    })
    expect(result.success).toBe(true)
  })
})

function ledgerEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    sequence: 1,
    eventType: 'settlement',
    outcome: 'p50',
    actorUserId: 'user-1',
    householdId: 'h1',
    settlementDate: '2026-08-01',
    sourceRunId: 'run-1',
    simulationResultDigest: 'rd',
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

describe('ledgerEventSchema', () => {
  it('accepts the first event, which has no previous seal', () => {
    expect(ledgerEventSchema.safeParse(ledgerEvent()).success).toBe(true)
  })

  it('requires a sequence of at least one', () => {
    expect(ledgerEventSchema.safeParse(ledgerEvent({ sequence: 0 })).success).toBe(false)
  })

  it('always carries an outcome, including on adjustments', () => {
    expect(ledgerEventSchema.safeParse(ledgerEvent({ outcome: null })).success).toBe(false)
  })

  it('accepts an adjustment carrying its target, reason and key', () => {
    const adjustment = ledgerEvent({
      sequence: 2,
      eventType: 'adjustment',
      previousSeal: 'seal-1',
      canonicalSeal: 'seal-2',
      adjustmentTargetEventId: 'event-1',
      adjustmentReason: 'Meter correction',
      idempotencyKey: 'key-1',
    })
    expect(ledgerEventSchema.safeParse(adjustment).success).toBe(true)
  })
})

describe('ledgerListResponseSchema', () => {
  it('carries the integrity verdict alongside the events', () => {
    const result = ledgerListResponseSchema.safeParse({
      events: [ledgerEvent()],
      integrity: { valid: true, complete: true, checkedEvents: 1, firstSequence: 1, lastSequence: 1 },
    })
    expect(result.success).toBe(true)
  })

  it('accepts an empty chain with null sequence bounds', () => {
    const result = ledgerListResponseSchema.safeParse({
      events: [],
      integrity: { valid: true, complete: true, checkedEvents: 0, firstSequence: null, lastSequence: null },
    })
    expect(result.success).toBe(true)
  })
})

describe('settlementResponseSchema', () => {
  it('reports whether the settlement already existed', () => {
    const result = settlementResponseSchema.safeParse({
      settlement: {
        runId: 'run-1',
        resultDigest: 'rd',
        outcome: 'p50',
        alreadySettled: true,
        events: [ledgerEvent()],
      },
    })
    expect(result.success).toBe(true)
  })
})

describe('adjustmentResponseSchema', () => {
  it('reports whether the idempotency key had already been used', () => {
    const result = adjustmentResponseSchema.safeParse({
      adjustment: { alreadyApplied: false, event: ledgerEvent({ eventType: 'adjustment' }) },
    })
    expect(result.success).toBe(true)
  })
})

describe('auditEventPageResponseSchema', () => {
  const event = {
    id: 'audit-1',
    actorUserId: 'user-1',
    action: 'organisation.created',
    entityType: 'organisation',
    entityId: UUID,
    metadata: { slug: 'nolambur' },
    createdAt: WHEN,
  }

  it('accepts a page with a cursor', () => {
    expect(auditEventPageResponseSchema.safeParse({ events: [event], nextCursor: 'abc' }).success).toBe(true)
  })

  it('accepts the last page with a null cursor', () => {
    expect(auditEventPageResponseSchema.safeParse({ events: [event], nextCursor: null }).success).toBe(true)
  })

  it('requires the cursor key to be present', () => {
    expect(auditEventPageResponseSchema.safeParse({ events: [event] }).success).toBe(false)
  })
})

describe('JSON Schema conversion', () => {
  it('converts every response schema without throwing', () => {
    const schemas = [
      errorResponseSchema,
      sessionResponseSchema,
      organisationSchema,
      membershipSchema,
      invitationSchema,
      simulationRunSchema,
      simulationQuotaSchema,
      simulationResultsResponseSchema,
      ledgerListResponseSchema,
      settlementResponseSchema,
      adjustmentResponseSchema,
      auditEventPageResponseSchema,
    ]
    for (const schema of schemas) {
      expect(() => z.toJSONSchema(schema)).not.toThrow()
    }
  })
})
