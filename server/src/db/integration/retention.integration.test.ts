import { expect, it } from 'vitest'
import { purgeCutoff } from '../../retention/policy.js'
import { describeIntegration } from './runner.js'

/**
 * Restore and purge, verified against a real MongoDB.
 *
 * Both operate on soft-delete state written by a different transaction, and the
 * property that makes restore correct — that it revives exactly the rows the
 * archive took, matched on the archive's own instant — is only observable
 * against real documents.
 */

const OWNER = 'user_owner'
const MEMBER = 'user_member'
const DAY = 24 * 60 * 60 * 1000

describeIntegration('Retention', (suite) => {
  async function organisation(slug: string) {
    const { organisation: created } = await suite.repositories().organisations.createWithOwner({
      name: `Org ${slug}`,
      slug,
      createdByUserId: OWNER,
      createdByUserEmail: 'owner@example.com',
    })
    return created
  }

  async function queueRun(organisationId: string, seed: string) {
    return suite.repositories().simulations.createRun({
      organisationId,
      requestedByUserId: OWNER,
      seed,
      modelVersion: 'test-model',
      inputSnapshot: { simulationDate: '2030-01-01', households: [{ id: 'h1' }] },
      inputDigest: `digest-${seed}`,
    })
  }

  /** Moves an existing archive back in time so it falls outside the window. */
  async function backdateArchive(organisationId: string, archivedAt: Date, movedTo: Date) {
    const collections = suite.collections()
    for (const collection of [
      collections.organisations,
      collections.memberships,
      collections.simulationRuns,
      collections.simulationIntervals,
      collections.simulationSummaries,
    ]) {
      await collection.updateMany(
        { $or: [{ _id: organisationId }, { organisationId }], deletedAt: archivedAt } as never,
        { $set: { deletedAt: movedTo } },
      )
    }
  }

  it('restores the organisation and the memberships the archive took', async () => {
    const repositories = suite.repositories()
    const org = await organisation('restore-basic')
    await repositories.memberships.create({
      organisationId: org._id,
      userId: MEMBER,
      email: 'member@example.com',
      role: 'operator',
    })
    await queueRun(org._id, 'restore-1')

    expect(await repositories.organisations.softDelete(org._id, OWNER)).toBe(true)
    expect(await repositories.organisations.findById(org._id)).toBeNull()

    const restored = await repositories.organisations.restore(
      org._id,
      OWNER,
      purgeCutoff(new Date(), 30),
    )

    expect(restored?.deletedAt).toBeNull()
    expect(await repositories.organisations.findById(org._id)).not.toBeNull()
    expect(await repositories.memberships.find(org._id, OWNER)).not.toBeNull()
    expect(await repositories.memberships.find(org._id, MEMBER)).not.toBeNull()
    expect((await repositories.simulations.listForOrganisation(org._id)).length).toBe(1)
  })

  it('leaves a membership removed before the archive removed', async () => {
    const repositories = suite.repositories()
    const org = await organisation('restore-prior')
    await repositories.memberships.create({
      organisationId: org._id,
      userId: MEMBER,
      email: 'member@example.com',
      role: 'viewer',
    })

    // Removed first, then the organisation is archived later.
    await repositories.memberships.remove(org._id, MEMBER, OWNER)
    await repositories.organisations.softDelete(org._id, OWNER)

    await repositories.organisations.restore(org._id, OWNER, purgeCutoff(new Date(), 30))

    // Restoring undoes the archive, not every removal that ever happened.
    expect(await repositories.memberships.find(org._id, MEMBER)).toBeNull()
    expect(await repositories.memberships.find(org._id, OWNER)).not.toBeNull()
  })

  it('refuses anyone who was not the owner at the archive', async () => {
    const repositories = suite.repositories()
    const org = await organisation('restore-stranger')
    await repositories.memberships.create({
      organisationId: org._id,
      userId: MEMBER,
      email: 'member@example.com',
      role: 'admin',
    })
    await repositories.organisations.softDelete(org._id, OWNER)

    expect(
      await repositories.organisations.restore(org._id, MEMBER, purgeCutoff(new Date(), 30)),
    ).toBeNull()
    expect(await repositories.organisations.findById(org._id)).toBeNull()
  })

  it('refuses once the recovery window has passed', async () => {
    const repositories = suite.repositories()
    const org = await organisation('restore-expired')
    await repositories.organisations.softDelete(org._id, OWNER)

    const archived = await suite.collections().organisations.findOne({ _id: org._id })
    const archivedAt = archived?.deletedAt as Date
    await backdateArchive(org._id, archivedAt, new Date(Date.now() - 45 * DAY))

    expect(
      await repositories.organisations.restore(org._id, OWNER, purgeCutoff(new Date(), 30)),
    ).toBeNull()
  })

  it('refuses to restore something that was never archived', async () => {
    const repositories = suite.repositories()
    const org = await organisation('restore-live')

    expect(
      await repositories.organisations.restore(org._id, OWNER, purgeCutoff(new Date(), 30)),
    ).toBeNull()
  })

  it('lists an archive its owner can still undo', async () => {
    const repositories = suite.repositories()
    const org = await organisation('listable-mine')
    await repositories.organisations.softDelete(org._id, OWNER)

    const listed = await repositories.organisations.listRestorableForUser(
      OWNER,
      purgeCutoff(new Date(), 30),
    )

    expect(listed.map(({ _id }) => _id)).toContain(org._id)
  })

  it('offers only archives that actually restore', async () => {
    // The list is a promise. Anything it shows must come back when asked, or the
    // UI offers a button that answers 404.
    const repositories = suite.repositories()
    const org = await organisation('listable-honest')
    await repositories.organisations.softDelete(org._id, OWNER)

    const listed = await repositories.organisations.listRestorableForUser(
      OWNER,
      purgeCutoff(new Date(), 30),
    )
    expect(listed.length).toBeGreaterThan(0)

    for (const entry of listed) {
      expect(
        await repositories.organisations.restore(entry._id, OWNER, purgeCutoff(new Date(), 30)),
      ).not.toBeNull()
    }
  })

  it('does not offer an archive to someone who was only a member of it', async () => {
    const repositories = suite.repositories()
    const org = await organisation('listable-member')
    await repositories.memberships.create({
      organisationId: org._id,
      userId: MEMBER,
      email: 'member@example.com',
      role: 'admin',
    })
    await repositories.organisations.softDelete(org._id, OWNER)

    // An admin's membership was soft-deleted by the same archive at the same
    // instant, so only the role separates them — and restore refuses an admin,
    // so listing one would offer a button that cannot work.
    const listed = await repositories.organisations.listRestorableForUser(
      MEMBER,
      purgeCutoff(new Date(), 30),
    )

    expect(listed.map(({ _id }) => _id)).not.toContain(org._id)
  })

  it('does not offer an archive past its window', async () => {
    const repositories = suite.repositories()
    const org = await organisation('listable-expired')
    await repositories.organisations.softDelete(org._id, OWNER)

    const archived = await suite.collections().organisations.findOne({ _id: org._id })
    await backdateArchive(org._id, archived?.deletedAt as Date, new Date(Date.now() - 45 * DAY))

    const listed = await repositories.organisations.listRestorableForUser(
      OWNER,
      purgeCutoff(new Date(), 30),
    )

    expect(listed.map(({ _id }) => _id)).not.toContain(org._id)
  })

  it('does not offer a live organisation, since there is nothing to undo', async () => {
    const repositories = suite.repositories()
    const org = await organisation('listable-live')

    const listed = await repositories.organisations.listRestorableForUser(
      OWNER,
      purgeCutoff(new Date(), 30),
    )

    expect(listed.map(({ _id }) => _id)).not.toContain(org._id)
  })

  it('pairs the owner membership to the archive by its own instant', async () => {
    const repositories = suite.repositories()
    const org = await organisation('listable-pairing')
    await repositories.organisations.softDelete(org._id, OWNER)

    // Written directly, because nothing in the API can currently pull the two
    // instants apart — which is the point. A future query that merely asked
    // "is there a deleted owner membership?" would list this, and restore would
    // then refuse it.
    const archived = await suite.collections().organisations.findOne({ _id: org._id })
    const archivedAt = archived?.deletedAt as Date
    await suite.collections().organisations.updateOne(
      { _id: org._id },
      { $set: { deletedAt: new Date(archivedAt.getTime() + 1000) } },
    )

    const listed = await repositories.organisations.listRestorableForUser(
      OWNER,
      purgeCutoff(new Date(), 30),
    )

    expect(listed.map(({ _id }) => _id)).not.toContain(org._id)
  })

  it('purges the working data of an archive past its window', async () => {
    const repositories = suite.repositories()
    const org = await organisation('purge-expired')
    await queueRun(org._id, 'purge-1')
    await queueRun(org._id, 'purge-2')
    await repositories.organisations.softDelete(org._id, OWNER)

    const archived = await suite.collections().organisations.findOne({ _id: org._id })
    await backdateArchive(org._id, archived?.deletedAt as Date, new Date(Date.now() - 45 * DAY))

    const result = await repositories.retention.purgeArchivedBefore(purgeCutoff(new Date(), 30))

    expect(result.organisationsPurged).toBeGreaterThanOrEqual(1)
    expect(await suite.collections().simulationRuns.countDocuments({ organisationId: org._id })).toBe(0)
  })

  it('keeps the organisation and membership rows as tombstones', async () => {
    const repositories = suite.repositories()
    const org = await organisation('purge-tombstone')
    await repositories.organisations.softDelete(org._id, OWNER)

    const archived = await suite.collections().organisations.findOne({ _id: org._id })
    await backdateArchive(org._id, archived?.deletedAt as Date, new Date(Date.now() - 45 * DAY))

    await repositories.retention.purgeArchivedBefore(purgeCutoff(new Date(), 30))

    // Ledger and audit events reference these; purging them would leave
    // retained records pointing at nothing.
    expect(await suite.collections().organisations.countDocuments({ _id: org._id })).toBe(1)
    expect(await suite.collections().memberships.countDocuments({ organisationId: org._id })).toBe(1)
  })

  it('never touches ledger or audit events', async () => {
    const repositories = suite.repositories()
    const org = await organisation('purge-evidence')
    await repositories.organisations.softDelete(org._id, OWNER)

    await suite.collections().ledgerEvents.insertOne({
      _id: 'evt_retention',
      organisationId: org._id,
      sequence: 1,
      eventType: 'settlement',
      outcome: 'p50',
      actorUserId: OWNER,
      householdId: 'h1',
      settlementDate: '2030-01-01',
      sourceRunId: 'run_1',
      simulationResultDigest: 'digest',
      energyKwh: 4.5,
      estimatedCreditInr: 24.75,
      previousSeal: null,
      canonicalSeal: 'seal-value',
      adjustmentTargetEventId: null,
      adjustmentReason: null,
      idempotencyKey: null,
      createdAt: new Date('2030-01-01T00:00:00.000Z'),
    })

    const archived = await suite.collections().organisations.findOne({ _id: org._id })
    await backdateArchive(org._id, archived?.deletedAt as Date, new Date(Date.now() - 45 * DAY))

    await repositories.retention.purgeArchivedBefore(purgeCutoff(new Date(), 30))

    const event = await suite.collections().ledgerEvents.findOne({ _id: 'evt_retention' })
    expect(event?.canonicalSeal).toBe('seal-value')
    const audit = await repositories.audit.listForOrganisation(org._id)
    expect(audit.length).toBeGreaterThan(0)
  })

  it('leaves an archive still inside its window alone', async () => {
    const repositories = suite.repositories()
    const org = await organisation('purge-recent')
    await queueRun(org._id, 'recent-1')
    await repositories.organisations.softDelete(org._id, OWNER)

    const result = await repositories.retention.purgeArchivedBefore(purgeCutoff(new Date(), 30))

    expect(result.organisationsPurged).toBe(0)
    expect(await suite.collections().simulationRuns.countDocuments({ organisationId: org._id })).toBe(1)
  })

  it('leaves a live organisation alone', async () => {
    const repositories = suite.repositories()
    const org = await organisation('purge-live')
    await queueRun(org._id, 'live-1')

    await repositories.retention.purgeArchivedBefore(purgeCutoff(new Date(), 30))

    expect((await repositories.simulations.listForOrganisation(org._id)).length).toBe(1)
  })
})
