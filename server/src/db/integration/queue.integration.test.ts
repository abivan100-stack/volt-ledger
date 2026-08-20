import { expect, it } from 'vitest'
import { describeIntegration } from './runner.js'

/**
 * Queue depth, verified against a real MongoDB.
 *
 * The depth is counted with filters rather than by loading the runs, so what it
 * reports depends entirely on those filters being right: the wrong status, a
 * missing soft-delete clause, or a missing organisation scope would each give a
 * plausible number that is wrong in exactly the situation the endpoint exists
 * for.
 */

const OWNER = 'user_owner'

describeIntegration('Simulation queue depth', (suite) => {
  async function organisation(slug: string) {
    const { organisation: created } = await suite.repositories().organisations.createWithOwner({
      name: `Org ${slug}`,
      slug,
      createdByUserId: OWNER,
      createdByUserEmail: 'owner@example.com',
    })
    return created
  }

  async function queue(organisationId: string, seed: string) {
    return suite.repositories().simulations.createRun({
      organisationId,
      requestedByUserId: OWNER,
      seed,
      modelVersion: 'test-model',
      inputSnapshot: { simulationDate: '2030-01-01', households: [{ id: 'h1' }] },
      inputDigest: `digest-${seed}`,
    })
  }

  it('reports an empty queue without an oldest entry', async () => {
    const org = await organisation('empty-queue')

    const depth = await suite.repositories().simulations.getQueueDepth(org._id)

    expect(depth).toEqual({ queued: 0, running: 0, oldestQueuedAt: null })
  })

  it('counts queued and running separately', async () => {
    const org = await organisation('mixed-queue')
    await queue(org._id, 'a')
    await queue(org._id, 'b')
    await queue(org._id, 'c')

    // Claiming moves one run out of the backlog and into flight.
    await suite.repositories().simulations.claimNextQueuedRun()

    const depth = await suite.repositories().simulations.getQueueDepth(org._id)
    expect(depth.queued).toBe(2)
    expect(depth.running).toBe(1)
  })

  it('reports the longest-waiting run as the oldest', async () => {
    const org = await organisation('oldest-queue')
    const first = await queue(org._id, 'first')
    await queue(org._id, 'second')

    // Backdate the first so the ordering is unambiguous rather than resting on
    // two timestamps written in the same millisecond. Relative to now, not a
    // fixed year: the runs it competes with are created at the current time, so
    // a hard-coded date is only "old" until the calendar reaches it.
    const backdated = new Date(Date.now() - 60 * 60 * 1000)
    await suite
      .collections()
      .simulationRuns.updateOne({ _id: first._id }, { $set: { createdAt: backdated } })

    const depth = await suite.repositories().simulations.getQueueDepth(org._id)
    expect(depth.oldestQueuedAt?.toISOString()).toBe(backdated.toISOString())
  })

  it('ignores runs that finished', async () => {
    const org = await organisation('finished-queue')
    const run = await queue(org._id, 'done')

    await suite.repositories().simulations.claimNextQueuedRun()
    await suite.repositories().simulations.transitionRun(run._id, 'failed', { errorCode: 'BOOM' })

    const depth = await suite.repositories().simulations.getQueueDepth(org._id)
    expect(depth).toEqual({ queued: 0, running: 0, oldestQueuedAt: null })
  })

  it('ignores runs that were soft-deleted with their organisation', async () => {
    const org = await organisation('archived-queue')
    const run = await queue(org._id, 'archived')

    await suite.repositories().simulations.softDeleteRun(run._id)

    // An archived organisation must not leave a phantom backlog behind it.
    const depth = await suite.repositories().simulations.getQueueDepth(org._id)
    expect(depth.queued).toBe(0)
    expect(depth.oldestQueuedAt).toBeNull()
  })

  it('counts each organisation separately', async () => {
    const mine = await organisation('mine-queue')
    const theirs = await organisation('theirs-queue')
    await queue(mine._id, 'mine-1')
    await queue(theirs._id, 'theirs-1')
    await queue(theirs._id, 'theirs-2')

    expect((await suite.repositories().simulations.getQueueDepth(mine._id)).queued).toBe(1)
    expect((await suite.repositories().simulations.getQueueDepth(theirs._id)).queued).toBe(2)
  })
})
