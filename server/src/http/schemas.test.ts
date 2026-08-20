import { describe, expect, it } from 'vitest'
import {
  acceptInvitationBodySchema,
  auditEventQuerySchema,
  createAdjustmentSchema,
  createInvitationBodySchema,
  createOrganisationSchema,
  createSimulationSchema,
  invitationParamsSchema,
  ledgerQuerySchema,
  membershipParamsSchema,
  organisationIdSchema,
  settleSimulationSchema,
  simulationListQuerySchema,
  simulationParamsSchema,
  simulationResultsQuerySchema,
  transferOwnershipSchema,
  updateMembershipRoleSchema,
} from './schemas.js'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('organisationIdSchema', () => {
  it('accepts a UUID', () => {
    expect(organisationIdSchema.safeParse({ organisationId: UUID }).success).toBe(true)
  })

  it('rejects a non-UUID identifier', () => {
    expect(organisationIdSchema.safeParse({ organisationId: 'nope' }).success).toBe(false)
  })
})

describe('createOrganisationSchema', () => {
  it('trims the name and slug', () => {
    const parsed = createOrganisationSchema.parse({ name: '  Nolambur  ', slug: '  nolambur  ' })
    expect(parsed).toEqual({ name: 'Nolambur', slug: 'nolambur' })
  })

  it('rejects an upper-case or spaced slug', () => {
    expect(createOrganisationSchema.safeParse({ name: 'Nolambur', slug: 'Nolambur' }).success).toBe(false)
    expect(createOrganisationSchema.safeParse({ name: 'Nolambur', slug: 'nol ambur' }).success).toBe(false)
    expect(createOrganisationSchema.safeParse({ name: 'Nolambur', slug: 'nolambur-' }).success).toBe(false)
  })

  it('rejects a name shorter than two characters', () => {
    expect(createOrganisationSchema.safeParse({ name: 'N', slug: 'nolambur' }).success).toBe(false)
  })

  it('rejects unknown keys', () => {
    const result = createOrganisationSchema.safeParse({ name: 'Nolambur', slug: 'nolambur', role: 'owner' })
    expect(result.success).toBe(false)
  })
})

describe('createSimulationSchema', () => {
  const valid = {
    seed: 'seed-1',
    simulationDate: '2026-08-01',
    dayType: 'sunny-weekday',
    households: [{ id: 'h1', pvKw: 3, baseLoadKw: 1 }],
  }

  it('applies the documented defaults', () => {
    const parsed = createSimulationSchema.parse(valid)
    expect(parsed.sampleCount).toBe(100)
    expect(parsed.intervalMinutes).toBe(60)
    expect(parsed.rateInrPerKwh).toBe(5.5)
  })

  it('rejects a date that is not YYYY-MM-DD', () => {
    expect(createSimulationSchema.safeParse({ ...valid, simulationDate: '01-08-2026' }).success).toBe(false)
  })

  it('rejects an unknown day type', () => {
    expect(createSimulationSchema.safeParse({ ...valid, dayType: 'sunny' }).success).toBe(false)
  })

  it('requires at least one household and allows at most fifty', () => {
    expect(createSimulationSchema.safeParse({ ...valid, households: [] }).success).toBe(false)
    const fiftyOne = Array.from({ length: 51 }, (_, index) => ({
      id: `h${index}`,
      pvKw: 1,
      baseLoadKw: 1,
    }))
    expect(createSimulationSchema.safeParse({ ...valid, households: fiftyOne }).success).toBe(false)
  })

  it('rejects a household with a zero base load', () => {
    const result = createSimulationSchema.safeParse({
      ...valid,
      households: [{ id: 'h1', pvKw: 3, baseLoadKw: 0 }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects an interval other than 10, 30 or 60 minutes', () => {
    expect(createSimulationSchema.safeParse({ ...valid, intervalMinutes: 15 }).success).toBe(false)
  })
})

describe('settleSimulationSchema', () => {
  it('defaults the outcome to the selected sample', () => {
    expect(settleSimulationSchema.parse({})).toEqual({ outcome: 'selected' })
  })

  it('rejects an unknown outcome', () => {
    expect(settleSimulationSchema.safeParse({ outcome: 'p99' }).success).toBe(false)
  })
})

describe('createAdjustmentSchema', () => {
  const valid = {
    targetEventId: 'event-1',
    idempotencyKey: 'key-1',
    energyKwh: -0.5,
    estimatedCreditInr: -2.75,
    reason: 'Meter correction',
  }

  it('accepts a signed delta with a reason', () => {
    expect(createAdjustmentSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects an adjustment that changes nothing', () => {
    const result = createAdjustmentSchema.safeParse({ ...valid, energyKwh: 0, estimatedCreditInr: 0 })
    expect(result.success).toBe(false)
  })

  it('accepts a change to credit alone', () => {
    expect(createAdjustmentSchema.safeParse({ ...valid, energyKwh: 0 }).success).toBe(true)
  })

  it('rejects a reason shorter than three characters', () => {
    expect(createAdjustmentSchema.safeParse({ ...valid, reason: 'no' }).success).toBe(false)
  })

  it('trims the idempotency key and reason', () => {
    const parsed = createAdjustmentSchema.parse({ ...valid, idempotencyKey: ' key-1 ', reason: ' Fix ' })
    expect(parsed.idempotencyKey).toBe('key-1')
    expect(parsed.reason).toBe('Fix')
  })
})

describe('transferOwnershipSchema', () => {
  it('trims the new owner id', () => {
    expect(transferOwnershipSchema.parse({ newOwnerUserId: ' user-1 ' })).toEqual({
      newOwnerUserId: 'user-1',
    })
  })

  it('rejects unknown keys', () => {
    expect(
      transferOwnershipSchema.safeParse({ newOwnerUserId: 'user-1', role: 'owner' }).success,
    ).toBe(false)
  })
})

describe('membershipParamsSchema', () => {
  it('accepts a UUID organisation and an opaque user id', () => {
    expect(membershipParamsSchema.safeParse({ organisationId: UUID, userId: 'user-1' }).success).toBe(true)
  })

  it('rejects an empty user id', () => {
    expect(membershipParamsSchema.safeParse({ organisationId: UUID, userId: '' }).success).toBe(false)
  })
})

describe('updateMembershipRoleSchema', () => {
  it('accepts the three assignable roles', () => {
    for (const role of ['admin', 'operator', 'viewer']) {
      expect(updateMembershipRoleSchema.safeParse({ role }).success).toBe(true)
    }
  })

  it('never accepts owner, which moves only through a transfer', () => {
    expect(updateMembershipRoleSchema.safeParse({ role: 'owner' }).success).toBe(false)
  })
})

describe('createInvitationBodySchema', () => {
  it('trims and accepts an email with an assignable role', () => {
    const parsed = createInvitationBodySchema.parse({ email: ' asha@example.com ', role: 'viewer' })
    expect(parsed.email).toBe('asha@example.com')
  })

  it('rejects a malformed email', () => {
    expect(createInvitationBodySchema.safeParse({ email: 'nope', role: 'viewer' }).success).toBe(false)
  })

  it('never accepts owner', () => {
    expect(
      createInvitationBodySchema.safeParse({ email: 'asha@example.com', role: 'owner' }).success,
    ).toBe(false)
  })
})

describe('invitationParamsSchema', () => {
  it('accepts a UUID organisation and an opaque invitation id', () => {
    expect(
      invitationParamsSchema.safeParse({ organisationId: UUID, invitationId: 'invitation-1' }).success,
    ).toBe(true)
  })
})

describe('acceptInvitationBodySchema', () => {
  it('accepts a token', () => {
    expect(acceptInvitationBodySchema.safeParse({ token: 'token-abc' }).success).toBe(true)
  })

  it('rejects an empty token and unknown keys', () => {
    expect(acceptInvitationBodySchema.safeParse({ token: '' }).success).toBe(false)
    expect(acceptInvitationBodySchema.safeParse({ token: 'abc', extra: 1 }).success).toBe(false)
  })
})

describe('simulationParamsSchema', () => {
  it('accepts a UUID organisation and an opaque run id', () => {
    expect(simulationParamsSchema.safeParse({ organisationId: UUID, runId: 'run-1' }).success).toBe(true)
  })
})

describe('list query schemas', () => {
  it('coerces a string limit and applies each route default', () => {
    expect(simulationListQuerySchema.parse({})).toEqual({ limit: 50 })
    expect(simulationListQuerySchema.parse({ limit: '10' })).toEqual({ limit: 10 })
    expect(simulationResultsQuerySchema.parse({})).toEqual({ limit: 1_000 })
    expect(ledgerQuerySchema.parse({})).toEqual({ limit: 100 })
    expect(auditEventQuerySchema.parse({}).limit).toBe(100)
  })

  it('enforces each route maximum', () => {
    expect(simulationListQuerySchema.safeParse({ limit: 101 }).success).toBe(false)
    expect(simulationResultsQuerySchema.safeParse({ limit: 10_001 }).success).toBe(false)
    expect(ledgerQuerySchema.safeParse({ limit: 501 }).success).toBe(false)
    expect(auditEventQuerySchema.safeParse({ limit: 501 }).success).toBe(false)
  })

  it('rejects a limit below one', () => {
    expect(ledgerQuerySchema.safeParse({ limit: 0 }).success).toBe(false)
  })
})

describe('auditEventQuerySchema', () => {
  it('leaves the action and cursor absent when not supplied', () => {
    const parsed = auditEventQuerySchema.parse({})
    expect(parsed.action).toBeUndefined()
    expect(parsed.cursor).toBeUndefined()
  })

  it('trims an action filter and a cursor', () => {
    const parsed = auditEventQuerySchema.parse({ action: ' organisation.created ', cursor: ' abc ' })
    expect(parsed.action).toBe('organisation.created')
    expect(parsed.cursor).toBe('abc')
  })

  it('rejects a cursor longer than the bound', () => {
    expect(auditEventQuerySchema.safeParse({ cursor: 'a'.repeat(513) }).success).toBe(false)
  })
})
