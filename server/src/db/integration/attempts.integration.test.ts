import { expect, it } from 'vitest'
import { describeIntegration } from './runner.js'

/**
 * Attempt counting on the claim, verified against a real MongoDB.
 *
 * The counter is incremented inside `findOneAndUpdate` rather than by the
 * worker, so that a claim which never reports back — a killed process, a dropped
 * connection — is still counted. That only holds if the atomic update really
 * behaves as intended, which is not something a stub can demonstrate.
 */

const OWNER = 'user_owner'

describeIntegration('Simulation attempts', (suite) => {
  async function queuedRun(seed = 'seed-1') {
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
      seed,
      modelVersion: 'test-model',
      inputSnapshot: { simulationDate: '2030-01-01', households: [{ id: 'h1' }] },
      inputDigest: `digest-${seed}`,
    })
    return { organisation, run }
  }

  it('creates a queued run with no attempts recorded', async () => {
    const { run } = await queuedRun()
    expect(run.status).toBe('queued')
    expect(run.attemptCount).toBe(0)
  })

  it('counts the attempt as part of the claim', async () => {
    await queuedRun()

    const claimed = await suite.repositories().simulations.claimNextQueuedRun()

    expect(claimed?.status).toBe('running')
    // The returned document is the post-update one, so the worker sees the count
    // that includes its own claim.
    expect(claimed?.attemptCount).toBe(1)
  })

  it('counts a stale-lease reclaim as a further attempt', async () => {
    const { run } = await queuedRun()
    const repositories = suite.repositories()

    const first = await repositories.simulations.claimNextQueuedRun()
    expect(first?.attemptCount).toBe(1)

    // Backdate the lease so the run looks abandoned, as a killed worker would
    // leave it.
    await suite
      .collections()
      .simulationRuns.updateOne(
        { _id: run._id },
        { $set: { startedAt: new Date(Date.now() - 60 * 60 * 1000) } },
      )

    const reclaimed = await repositories.simulations.claimNextQueuedRun()
    expect(reclaimed?._id).toBe(run._id)
    expect(reclaimed?.attemptCount).toBe(2)
  })

  it('does not count a claim that found nothing', async () => {
    const { run } = await queuedRun()
    const repositories = suite.repositories()

    await repositories.simulations.claimNextQueuedRun()
    // The lease is fresh, so there is nothing claimable.
    expect(await repositories.simulations.claimNextQueuedRun()).toBeNull()

    const stored = await suite.collections().simulationRuns.findOne({ _id: run._id })
    expect(stored?.attemptCount).toBe(1)
  })

  it('leaves a quarantined run out of the queue entirely', async () => {
    const { run } = await queuedRun()
    const repositories = suite.repositories()

    await repositories.simulations.claimNextQueuedRun()
    await repositories.simulations.transitionRun(run._id, 'failed', {
      errorCode: 'SIMULATION_MAX_ATTEMPTS_EXCEEDED',
    })

    // A failed run matches neither queued nor a stale running lease, so it stops
    // blocking the queue behind it.
    expect(await repositories.simulations.claimNextQueuedRun()).toBeNull()

    const stored = await suite.collections().simulationRuns.findOne({ _id: run._id })
    expect(stored?.status).toBe('failed')
    expect(stored?.errorCode).toBe('SIMULATION_MAX_ATTEMPTS_EXCEEDED')
  })

  it('moves on to the next run once a poisonous one is quarantined', async () => {
    const repositories = suite.repositories()
    const { organisation, run: first } = await queuedRun('seed-first')

    const second = await repositories.simulations.createRun({
      organisationId: organisation._id,
      requestedByUserId: OWNER,
      seed: 'seed-second',
      modelVersion: 'test-model',
      inputSnapshot: { simulationDate: '2030-01-01', households: [{ id: 'h1' }] },
      inputDigest: 'digest-second',
    })

    // Oldest first, so the first run is claimed and would otherwise be reclaimed
    // ahead of the second on every pass.
    const claimed = await repositories.simulations.claimNextQueuedRun()
    expect(claimed?._id).toBe(first._id)

    await repositories.simulations.transitionRun(first._id, 'failed', {
      errorCode: 'SIMULATION_MAX_ATTEMPTS_EXCEEDED',
    })

    const next = await repositories.simulations.claimNextQueuedRun()
    expect(next?._id).toBe(second._id)
    expect(next?.attemptCount).toBe(1)
  })

  it('counts attempts independently for each run', async () => {
    const repositories = suite.repositories()
    const { organisation, run: first } = await queuedRun('seed-first')
    await repositories.simulations.createRun({
      organisationId: organisation._id,
      requestedByUserId: OWNER,
      seed: 'seed-second',
      modelVersion: 'test-model',
      inputSnapshot: { simulationDate: '2030-01-01', households: [{ id: 'h1' }] },
      inputDigest: 'digest-second',
    })

    await repositories.simulations.claimNextQueuedRun()
    await repositories.simulations.claimNextQueuedRun()

    const stored = await suite.collections().simulationRuns.findOne({ _id: first._id })
    expect(stored?.attemptCount).toBe(1)
  })
})
