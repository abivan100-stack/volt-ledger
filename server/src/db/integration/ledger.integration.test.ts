import { expect, it } from 'vitest'
import { describeIntegration } from './runner.js'

/**
 * Settlement and adjustment idempotency, and the append-only rule underneath
 * both.
 *
 * Retries are the normal case here, not the exception: a client that times out
 * and resends must not double-settle a run or double-count a correction. Every
 * test therefore repeats the operation and asserts the ledger did not grow.
 */

const OWNER = 'user_owner'
const HOUSEHOLDS = ['h1', 'h2']

describeIntegration('Ledger', (suite) => {
  async function completedRun() {
    const repositories = suite.repositories()
    const { organisation } = await repositories.organisations.createWithOwner({
      name: 'Solar Commons',
      slug: 'solar-commons',
      createdByUserId: OWNER,
      createdByUserEmail: 'owner@example.com',
    })

    const run = await repositories.simulations.createRun({
      organisationId: organisation._id,
      requestedByUserId: OWNER,
      seed: 'seed-1',
      modelVersion: 'test-model',
      inputSnapshot: {
        simulationDate: '2030-01-01',
        households: HOUSEHOLDS.map((id) => ({ id })),
      },
      inputDigest: 'digest-1',
    })

    await repositories.simulations.transitionRun(run._id, 'running')
    await repositories.simulations.completeRun({
      runId: run._id,
      resultDigest: 'result-digest-1',
      intervals: [],
      summaries: HOUSEHOLDS.map((householdId) => ({
        organisationId: organisation._id,
        runId: run._id,
        householdId,
        outcome: 'p50' as const,
        intervalCount: 24,
        generatedKwh: 12.5,
        consumedKwh: 9,
        importedKwh: 1.25,
        exportedKwh: 4.75,
        estimatedCreditInr: 26.125,
      })),
    })

    return { organisation, run }
  }

  it('appends one immutable event per household on settlement', async () => {
    const { organisation, run } = await completedRun()

    const settled = await suite.repositories().ledger.settleCompletedRun({
      organisationId: organisation._id,
      runId: run._id,
      outcome: 'p50',
      actorUserId: OWNER,
    })

    expect(settled.alreadySettled).toBe(false)
    expect(settled.events).toHaveLength(HOUSEHOLDS.length)
    expect(settled.events.map((event) => event.householdId).sort()).toEqual([...HOUSEHOLDS].sort())

    // Each event binds the run's result digest, so an event can always be traced
    // back to the exact numbers that produced it.
    for (const event of settled.events) {
      expect(event.simulationResultDigest).toBe('result-digest-1')
      expect(event.sourceRunId).toBe(run._id)
      expect(event.energyKwh).toBe(4.75)
    }
  })

  it('links the chain, starting from a null previous seal', async () => {
    const { organisation, run } = await completedRun()
    await suite.repositories().ledger.settleCompletedRun({
      organisationId: organisation._id,
      runId: run._id,
      outcome: 'p50',
      actorUserId: OWNER,
    })

    const events = await suite.repositories().ledger.list(organisation._id)
    const ordered = [...events].sort((left, right) => left.sequence - right.sequence)

    expect(ordered[0]?.sequence).toBe(1)
    expect(ordered[0]?.previousSeal).toBeNull()
    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index]?.sequence).toBe((ordered[index - 1]?.sequence ?? 0) + 1)
      expect(ordered[index]?.previousSeal).toBe(ordered[index - 1]?.canonicalSeal)
    }
  })

  it('is idempotent: settling the same run and outcome twice appends nothing', async () => {
    const { organisation, run } = await completedRun()
    const repositories = suite.repositories()
    const input = {
      organisationId: organisation._id,
      runId: run._id,
      outcome: 'p50' as const,
      actorUserId: OWNER,
    }

    const first = await repositories.ledger.settleCompletedRun(input)
    const second = await repositories.ledger.settleCompletedRun(input)

    expect(first.alreadySettled).toBe(false)
    expect(second.alreadySettled).toBe(true)
    expect(second.events.map((event) => event._id).sort()).toEqual(
      first.events.map((event) => event._id).sort(),
    )

    const total = await suite.collections().ledgerEvents
      .countDocuments({ organisationId: organisation._id })
    expect(total).toBe(HOUSEHOLDS.length)
  })

  it('stays idempotent when the same settlement is retried concurrently', async () => {
    if (!suite.supportsTransactions()) return
    const { organisation, run } = await completedRun()
    const repositories = suite.repositories()
    const input = {
      organisationId: organisation._id,
      runId: run._id,
      outcome: 'p50' as const,
      actorUserId: OWNER,
    }

    await Promise.allSettled([
      repositories.ledger.settleCompletedRun(input),
      repositories.ledger.settleCompletedRun(input),
      repositories.ledger.settleCompletedRun(input),
    ])

    // Whatever the interleaving, one settlement's worth of events exists.
    const total = await suite.collections().ledgerEvents
      .countDocuments({ organisationId: organisation._id })
    expect(total).toBe(HOUSEHOLDS.length)
  })

  it('refuses to settle the same run with a different outcome', async () => {
    const { organisation, run } = await completedRun()
    const repositories = suite.repositories()

    await repositories.ledger.settleCompletedRun({
      organisationId: organisation._id,
      runId: run._id,
      outcome: 'p50',
      actorUserId: OWNER,
    })

    await expect(
      repositories.ledger.settleCompletedRun({
        organisationId: organisation._id,
        runId: run._id,
        outcome: 'p90',
        actorUserId: OWNER,
      }),
    ).rejects.toThrow('SIMULATION_ALREADY_SETTLED_DIFFERENT_OUTCOME')
  })

  it('records a correction as a new event, leaving its target untouched', async () => {
    const { organisation, run } = await completedRun()
    const repositories = suite.repositories()

    const settled = await repositories.ledger.settleCompletedRun({
      organisationId: organisation._id,
      runId: run._id,
      outcome: 'p50',
      actorUserId: OWNER,
    })
    const target = settled.events[0]
    if (!target) throw new Error('expected a settlement event')

    const adjustment = await repositories.ledger.appendAdjustment({
      organisationId: organisation._id,
      targetEventId: target._id,
      actorUserId: OWNER,
      idempotencyKey: 'correction-1',
      energyKwh: -0.5,
      estimatedCreditInr: -2.75,
      reason: 'Inverter audit',
    })

    expect(adjustment.alreadyApplied).toBe(false)
    expect(adjustment.event.eventType).toBe('adjustment')
    expect(adjustment.event.adjustmentTargetEventId).toBe(target._id)

    // The original is byte-for-byte what it was, seal included.
    const stored = await suite.collections().ledgerEvents
      .findOne({ _id: target._id })
    expect(stored?.energyKwh).toBe(target.energyKwh)
    expect(stored?.canonicalSeal).toBe(target.canonicalSeal)
    expect(stored?.eventType).toBe('settlement')
  })

  it('is idempotent: replaying an adjustment key appends nothing', async () => {
    const { organisation, run } = await completedRun()
    const repositories = suite.repositories()

    const settled = await repositories.ledger.settleCompletedRun({
      organisationId: organisation._id,
      runId: run._id,
      outcome: 'p50',
      actorUserId: OWNER,
    })
    const target = settled.events[0]
    if (!target) throw new Error('expected a settlement event')

    const input = {
      organisationId: organisation._id,
      targetEventId: target._id,
      actorUserId: OWNER,
      idempotencyKey: 'correction-1',
      energyKwh: -0.5,
      estimatedCreditInr: -2.75,
      reason: 'Inverter audit',
    }

    const first = await repositories.ledger.appendAdjustment(input)
    const second = await repositories.ledger.appendAdjustment(input)

    expect(first.alreadyApplied).toBe(false)
    expect(second.alreadyApplied).toBe(true)
    expect(second.event._id).toBe(first.event._id)

    const adjustments = await suite.collections().ledgerEvents
      .countDocuments({ organisationId: organisation._id, eventType: 'adjustment' })
    expect(adjustments).toBe(1)
  })

  it('refuses the same key with different values', async () => {
    const { organisation, run } = await completedRun()
    const repositories = suite.repositories()

    const settled = await repositories.ledger.settleCompletedRun({
      organisationId: organisation._id,
      runId: run._id,
      outcome: 'p50',
      actorUserId: OWNER,
    })
    const target = settled.events[0]
    if (!target) throw new Error('expected a settlement event')

    await repositories.ledger.appendAdjustment({
      organisationId: organisation._id,
      targetEventId: target._id,
      actorUserId: OWNER,
      idempotencyKey: 'correction-1',
      energyKwh: -0.5,
      estimatedCreditInr: -2.75,
      reason: 'Inverter audit',
    })

    // Reusing a key with new numbers is a mistake, not a retry.
    await expect(
      repositories.ledger.appendAdjustment({
        organisationId: organisation._id,
        targetEventId: target._id,
        actorUserId: OWNER,
        idempotencyKey: 'correction-1',
        energyKwh: -1.5,
        estimatedCreditInr: -8.25,
        reason: 'Inverter audit',
      }),
    ).rejects.toThrow('LEDGER_IDEMPOTENCY_CONFLICT')
  })

  it('appends only one event when the same correction is retried concurrently', async () => {
    if (!suite.supportsTransactions()) return
    const { organisation, run } = await completedRun()
    const repositories = suite.repositories()

    const settled = await repositories.ledger.settleCompletedRun({
      organisationId: organisation._id,
      runId: run._id,
      outcome: 'p50',
      actorUserId: OWNER,
    })
    const target = settled.events[0]
    if (!target) throw new Error('expected a settlement event')

    const input = {
      organisationId: organisation._id,
      targetEventId: target._id,
      actorUserId: OWNER,
      idempotencyKey: 'correction-1',
      energyKwh: -0.5,
      estimatedCreditInr: -2.75,
      reason: 'Inverter audit',
    }

    await Promise.allSettled([
      repositories.ledger.appendAdjustment(input),
      repositories.ledger.appendAdjustment(input),
      repositories.ledger.appendAdjustment(input),
    ])

    const adjustments = await suite.collections().ledgerEvents
      .countDocuments({ organisationId: organisation._id, eventType: 'adjustment' })
    expect(adjustments).toBe(1)
  })
})
