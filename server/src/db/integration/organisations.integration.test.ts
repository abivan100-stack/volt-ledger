import { expect, it } from 'vitest'
import { describeIntegration } from './runner.js'

/**
 * Transactional organisation creation, the archival cascade, and the soft-delete
 * filtering that both depend on.
 *
 * The point of the cascade tests is as much what survives as what disappears:
 * archiving removes access and working data, but ledger and audit history are
 * retained for provenance, and an assertion that only checked the deletions
 * would pass just as happily if the ledger were wiped too.
 */

const OWNER = 'user_owner'
const OTHER = 'user_other'

describeIntegration('Organisations', (suite) => {
  async function createOrganisation(slug = 'solar-commons') {
    return suite.repositories().organisations.createWithOwner({
      name: 'Solar Commons',
      slug,
      createdByUserId: OWNER,
      createdByUserEmail: 'owner@example.com',
    })
  }

  it('creates the organisation, the owner membership and the audit event together', async () => {
    const { organisation, membership } = await createOrganisation()

    expect(organisation.deletedAt).toBeNull()
    expect(membership.role).toBe('owner')
    expect(membership.organisationId).toBe(organisation._id)

    const audit = await suite.collections().auditEvents
      .findOne({ organisationId: organisation._id, action: 'organisation.created' })
    expect(audit).not.toBeNull()
  })

  it('leaves nothing behind when the transaction aborts', async () => {
    if (!suite.supportsTransactions()) return
    await createOrganisation('solar-commons')

    const membershipsBefore = await suite.collections().memberships.countDocuments()
    const auditBefore = await suite.collections().auditEvents.countDocuments()

    // The duplicate slug fails on the unique index, part-way through the
    // transaction: the membership and audit inserts must roll back with it.
    await expect(
      suite.repositories().organisations.createWithOwner({
        name: 'Duplicate',
        slug: 'solar-commons',
        createdByUserId: OTHER,
      }),
    ).rejects.toThrow()

    expect(await suite.collections().memberships.countDocuments()).toBe(
      membershipsBefore,
    )
    expect(await suite.collections().auditEvents.countDocuments()).toBe(
      auditBefore,
    )
    expect(await suite.collections().organisations.countDocuments()).toBe(1)
  })

  it('archives access and working data in one pass', async () => {
    const { organisation } = await createOrganisation()
    const repositories = suite.repositories()

    await repositories.invitations.create({
      organisationId: organisation._id,
      email: 'invitee@example.com',
      role: 'operator',
      invitedByUserId: OWNER,
    })
    const run = await repositories.simulations.createRun({
      organisationId: organisation._id,
      requestedByUserId: OWNER,
      seed: 'seed-1',
      modelVersion: 'test-model',
      inputSnapshot: { simulationDate: '2030-01-01', households: [{ id: 'h1' }] },
      inputDigest: 'digest-1',
    })

    expect(await repositories.organisations.softDelete(organisation._id, OWNER)).toBe(true)

    const archived = await suite.collections().organisations
      .findOne({ _id: organisation._id })
    expect(archived?.deletedAt).not.toBeNull()

    const membership = await suite.collections().memberships
      .findOne({ organisationId: organisation._id, userId: OWNER })
    expect(membership?.deletedAt).not.toBeNull()

    const invitation = await suite.collections().organisationInvitations
      .findOne({ organisationId: organisation._id })
    // Pending access is revoked as well as soft-deleted, so a token in flight
    // cannot be redeemed against an archived organisation.
    expect(invitation?.status).toBe('revoked')
    expect(invitation?.deletedAt).not.toBeNull()

    const archivedRun = await suite.collections().simulationRuns
      .findOne({ _id: run._id })
    expect(archivedRun?.deletedAt).not.toBeNull()
  })

  it('retains ledger and audit history through an archive', async () => {
    const { organisation } = await createOrganisation()
    const repositories = suite.repositories()

    await repositories.ledger.append({
      organisationId: organisation._id,
      eventType: 'settlement',
      outcome: 'p50',
      actorUserId: OWNER,
      householdId: 'h1',
      settlementDate: '2030-01-01',
      sourceRunId: 'run-1',
      simulationResultDigest: 'digest-1',
      energyKwh: 4.75,
      estimatedCreditInr: 26.13,
    })

    await repositories.organisations.softDelete(organisation._id, OWNER)

    const events = await repositories.ledger.list(organisation._id)
    expect(events).toHaveLength(1)
    // Ledger events carry no deletedAt at all; they are immutable history.
    expect(events[0]).not.toHaveProperty('deletedAt')

    const audit = await repositories.audit.listForOrganisation(organisation._id)
    expect(audit.length).toBeGreaterThanOrEqual(2)
    expect(audit.map((event) => event.action)).toContain('organisation.soft_deleted')
  })

  it('refuses to archive for anyone who is not the owner', async () => {
    const { organisation } = await createOrganisation()

    expect(await suite.repositories().organisations.softDelete(organisation._id, OTHER)).toBe(false)

    const untouched = await suite.collections().organisations
      .findOne({ _id: organisation._id })
    expect(untouched?.deletedAt).toBeNull()
  })

  it('hides an archived organisation from every read path', async () => {
    const { organisation } = await createOrganisation()
    const repositories = suite.repositories()

    expect(await repositories.organisations.findById(organisation._id)).not.toBeNull()
    expect(await repositories.organisations.listForUser(OWNER)).toHaveLength(1)
    expect(await repositories.memberships.find(organisation._id, OWNER)).not.toBeNull()

    await repositories.organisations.softDelete(organisation._id, OWNER)

    expect(await repositories.organisations.findById(organisation._id)).toBeNull()
    expect(await repositories.organisations.listForUser(OWNER)).toHaveLength(0)
    expect(await repositories.memberships.find(organisation._id, OWNER)).toBeNull()
  })

  it('frees the slug once archived, which the partial unique index allows', async () => {
    const first = await createOrganisation('solar-commons')
    await suite.repositories().organisations.softDelete(first.organisation._id, OWNER)

    // The uniqueness rule applies only to rows with deletedAt: null, so the name
    // becomes available again rather than being reserved forever.
    const second = await createOrganisation('solar-commons')
    expect(second.organisation._id).not.toBe(first.organisation._id)
    expect(second.organisation.slug).toBe('solar-commons')
  })

  it('still refuses two live organisations with the same slug', async () => {
    await createOrganisation('solar-commons')
    await expect(createOrganisation('solar-commons')).rejects.toThrow()
  })
})
