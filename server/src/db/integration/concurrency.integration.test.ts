import { expect, it } from 'vitest'
import { simulationDailyRunLimit } from '../repositories.js'
import { describeIntegration } from './runner.js'

/**
 * Races. Each of these passes trivially when requests arrive one at a time, so
 * every case fires its operations simultaneously and asserts on the tally: how
 * many succeeded, how many failed, and with which error.
 *
 * A suite that only checked "at least one succeeded" would miss the failure that
 * matters — two winners where there should be one.
 */

const OWNER = 'user_owner'
const SECOND = 'user_second'
const THIRD = 'user_third'

/** Splits settled results into fulfilled values and rejection messages. */
function tally<T>(results: PromiseSettledResult<T>[]): {
  fulfilled: T[]
  rejected: string[]
} {
  const fulfilled: T[] = []
  const rejected: string[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') fulfilled.push(result.value)
    else rejected.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
  }
  return { fulfilled, rejected }
}

describeIntegration('Concurrency', (suite) => {
  async function organisationWithMembers() {
    const repositories = suite.repositories()
    const { organisation } = await repositories.organisations.createWithOwner({
      name: 'Solar Commons',
      slug: 'solar-commons',
      createdByUserId: OWNER,
      createdByUserEmail: 'owner@example.com',
    })
    await repositories.memberships.create({
      organisationId: organisation._id,
      userId: SECOND,
      email: 'second@example.com',
      role: 'admin',
    })
    await repositories.memberships.create({
      organisationId: organisation._id,
      userId: THIRD,
      email: 'third@example.com',
      role: 'operator',
    })
    return organisation
  }

  it('reserves each daily run unit exactly once under concurrency', async () => {
    const organisation = await organisationWithMembers()
    const repositories = suite.repositories()
    const attempts = 8

    const results = await Promise.allSettled(
      Array.from({ length: attempts }, (_, index) =>
        repositories.simulations.createRun({
          organisationId: organisation._id,
          requestedByUserId: OWNER,
          seed: `seed-${index}`,
          modelVersion: 'test-model',
          inputSnapshot: { simulationDate: '2030-01-01', households: [{ id: 'h1' }] },
          inputDigest: `digest-${index}`,
        }),
      ),
    )

    const { fulfilled } = tally(results)
    expect(fulfilled).toHaveLength(attempts)

    // The reservation counter must equal the runs actually created: a lost
    // update would leave the count short and hand out free quota.
    const usage = await suite.collections().simulationUsage
      .findOne({ organisationId: organisation._id })
    expect(usage?.runCount).toBe(attempts)

    const runs = await suite.collections().simulationRuns
      .countDocuments({ organisationId: organisation._id })
    expect(runs).toBe(attempts)
  })

  it('lets exactly one request take the last unit of the daily allowance', async () => {
    const organisation = await organisationWithMembers()
    const repositories = suite.repositories()

    // One real run creates the usage document; then wind its counter to one
    // short of the limit. Filtering by organisationId rather than constructing
    // the document id keeps this independent of how that id is composed.
    await repositories.simulations.createRun({
      organisationId: organisation._id,
      requestedByUserId: OWNER,
      seed: 'seed-warm-up',
      modelVersion: 'test-model',
      inputSnapshot: { simulationDate: '2030-01-01', households: [{ id: 'h1' }] },
      inputDigest: 'digest-warm-up',
    })
    const seeded = await suite.collections().simulationUsage
      .updateOne(
        { organisationId: organisation._id },
        { $set: { runCount: simulationDailyRunLimit - 1 } },
      )
    // If this ever stops matching, the cap below would not actually be tested.
    expect(seeded.matchedCount).toBe(1)

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, index) =>
        repositories.simulations.createRun({
          organisationId: organisation._id,
          requestedByUserId: OWNER,
          seed: `seed-${index}`,
          modelVersion: 'test-model',
          inputSnapshot: { simulationDate: '2030-01-01', households: [{ id: 'h1' }] },
          inputDigest: `digest-${index}`,
        }),
      ),
    )

    const { fulfilled, rejected } = tally(results)
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(5)
    for (const message of rejected) expect(message).toBe('SIMULATION_QUOTA_EXCEEDED')

    const usage = await suite.collections().simulationUsage
      .findOne({ organisationId: organisation._id })
    expect(usage?.runCount).toBe(simulationDailyRunLimit)
  })

  it('produces exactly one owner when two transfers race', async () => {
    if (!suite.supportsTransactions()) return
    const organisation = await organisationWithMembers()
    const repositories = suite.repositories()

    const results = await Promise.allSettled([
      repositories.memberships.transferOwnership(organisation._id, OWNER, SECOND),
      repositories.memberships.transferOwnership(organisation._id, OWNER, THIRD),
    ])

    const { fulfilled } = tally(results)
    const transfers = fulfilled.filter((value) => value !== null)
    // One transfer wins; the other either aborts or finds no current owner.
    expect(transfers.length).toBeLessThanOrEqual(1)

    const members = await repositories.memberships.listForOrganisation(organisation._id)
    const owners = members.filter((member) => member.role === 'owner')
    expect(owners).toHaveLength(1)

    // The previous owner is demoted, never left holding a second ownership.
    const previous = members.find((member) => member.userId === OWNER)
    if (owners[0]?.userId !== OWNER) expect(previous?.role).toBe('admin')
  })

  it('never lets an organisation end up with no owner', async () => {
    if (!suite.supportsTransactions()) return
    const organisation = await organisationWithMembers()
    const repositories = suite.repositories()

    await Promise.allSettled([
      repositories.memberships.transferOwnership(organisation._id, OWNER, SECOND),
      repositories.memberships.transferOwnership(organisation._id, OWNER, THIRD),
      repositories.memberships.transferOwnership(organisation._id, SECOND, THIRD),
    ])

    const members = await repositories.memberships.listForOrganisation(organisation._id)
    expect(members.filter((member) => member.role === 'owner')).toHaveLength(1)
  })

  it('turns one invitation into one membership when acceptance races', async () => {
    if (!suite.supportsTransactions()) return
    const organisation = await organisationWithMembers()
    const repositories = suite.repositories()

    const { token } = await repositories.invitations.create({
      organisationId: organisation._id,
      email: 'invitee@example.com',
      role: 'operator',
      invitedByUserId: OWNER,
    })

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        repositories.invitations.accept(token, 'user_invitee', 'invitee@example.com'),
      ),
    )

    const { fulfilled, rejected } = tally(results)
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(3)

    // A single-use token: later attempts find it no longer pending, or find the
    // membership it already created.
    for (const message of rejected) {
      expect(['INVITATION_NOT_FOUND', 'MEMBERSHIP_EXISTS']).toContain(message)
    }

    const memberships = await suite.collections().memberships
      .countDocuments({ organisationId: organisation._id, userId: 'user_invitee', deletedAt: null })
    expect(memberships).toBe(1)
  })

  it('refuses a second pending invitation for the same address', async () => {
    const organisation = await organisationWithMembers()
    const repositories = suite.repositories()

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        repositories.invitations.create({
          organisationId: organisation._id,
          email: 'invitee@example.com',
          role: 'operator',
          invitedByUserId: OWNER,
        }),
      ),
    )

    // The partial unique index is what holds this line, not a read-then-write
    // check that a race could slip between.
    const { fulfilled } = tally(results)
    expect(fulfilled).toHaveLength(1)

    const pending = await suite.collections().organisationInvitations
      .countDocuments({
        organisationId: organisation._id,
        email: 'invitee@example.com',
        status: 'pending',
        deletedAt: null,
      })
    expect(pending).toBe(1)
  })
})
