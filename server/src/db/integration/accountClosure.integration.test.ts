import { expect, it } from 'vitest'
import { anonymisedEmail, isAnonymisedEmail } from '../../accounts/closure.js'
import { describeIntegration } from './runner.js'

/**
 * Closing an account, verified against a real MongoDB.
 *
 * The closure spans collections Volt owns and collections Better Auth owns, in
 * one transaction, and its whole point is what it leaves behind: memberships
 * released, identity gone, ledger untouched. None of that can be demonstrated
 * against a stub.
 *
 * Better Auth's `user`, `session` and `account` collections are not in
 * `CLEARABLE_COLLECTIONS`, so this suite removes its own rows.
 */

const USER = 'user_closing'
const OTHER = 'user_other'

describeIntegration('Account closure', (suite) => {
  async function authRows(userId: string) {
    const db = suite.db()
    await db.collection('user').insertOne({
      _id: userId as never,
      name: 'Asha Reddy',
      email: `${userId}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db
      .collection('account')
      .insertOne({ _id: `acct_${userId}` as never, userId, providerId: 'credential', password: 'hash' })
    await db
      .collection('session')
      .insertOne({ _id: `sess_${userId}` as never, userId, token: 't', expiresAt: new Date() })
  }

  async function removeAuthRows() {
    const db = suite.db()
    for (const name of ['user', 'account', 'session']) {
      await db.collection(name).deleteMany({ $or: [{ userId: { $in: [USER, OTHER] } }, { _id: { $in: [USER, OTHER] as never } }] })
    }
  }

  it('releases memberships and anonymises the account', async () => {
    const repositories = suite.repositories()
    await removeAuthRows()
    await authRows(USER)

    // Owned by someone else, so the closing account is only a member.
    const { organisation } = await repositories.organisations.createWithOwner({
      name: 'Solar Commons',
      slug: 'closure-member',
      createdByUserId: OTHER,
      createdByUserEmail: 'owner@example.com',
    })
    await repositories.memberships.create({
      organisationId: organisation._id,
      userId: USER,
      email: 'asha@example.com',
      role: 'operator',
    })

    const result = await repositories.accounts.close(USER)
    expect(result.closed).toBe(true)
    expect(result.releasedMemberships).toBe(1)

    expect(await repositories.memberships.find(organisation._id, USER)).toBeNull()

    const user = await suite.db().collection('user').findOne({ _id: USER as never })
    expect(user?.name).toBe('')
    expect(user?.email).toBe(anonymisedEmail(USER))
    expect(isAnonymisedEmail(user?.email as string)).toBe(true)
    expect(user?.emailVerified).toBe(false)

    // Sessions and credentials go, so the address cannot be signed in with.
    expect(await suite.db().collection('session').countDocuments({ userId: USER })).toBe(0)
    expect(await suite.db().collection('account').countDocuments({ userId: USER })).toBe(0)

    await removeAuthRows()
  })

  it('keeps the user row, because ledger events reference it by id', async () => {
    const repositories = suite.repositories()
    await removeAuthRows()
    await authRows(USER)

    const closed = await repositories.accounts.close(USER)
    expect(closed.closed).toBe(true)

    // Erasing the row would leave sealed events pointing at nothing.
    expect(await suite.db().collection('user').countDocuments({ _id: USER as never })).toBe(1)

    await removeAuthRows()
  })

  it('leaves sealed ledger events exactly as they were', async () => {
    const repositories = suite.repositories()
    await removeAuthRows()
    await authRows(USER)

    const { organisation } = await repositories.organisations.createWithOwner({
      name: 'Ledger Keeper',
      slug: 'closure-ledger',
      createdByUserId: OTHER,
      createdByUserEmail: 'owner@example.com',
    })

    const event = {
      _id: 'evt_closure',
      organisationId: organisation._id,
      sequence: 1,
      eventType: 'settlement' as const,
      outcome: 'p50' as const,
      actorUserId: USER,
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
    }
    await suite.collections().ledgerEvents.insertOne(event)

    await repositories.accounts.close(USER)

    const stored = await suite.collections().ledgerEvents.findOne({ _id: 'evt_closure' })
    expect(stored?.actorUserId).toBe(USER)
    expect(stored?.canonicalSeal).toBe('seal-value')

    await removeAuthRows()
  })

  it('refuses while the account owns an organisation, and changes nothing', async () => {
    const repositories = suite.repositories()
    await removeAuthRows()
    await authRows(USER)

    const { organisation } = await repositories.organisations.createWithOwner({
      name: 'Owned Outright',
      slug: 'closure-owner',
      createdByUserId: USER,
      createdByUserEmail: 'asha@example.com',
    })

    const result = await repositories.accounts.close(USER)
    expect(result.closed).toBe(false)
    expect(result.blockedBy).toEqual([organisation._id])

    // A refusal is not a partial close: the membership and the identity survive.
    expect(await repositories.memberships.find(organisation._id, USER)).not.toBeNull()
    const user = await suite.db().collection('user').findOne({ _id: USER as never })
    expect(user?.email).toBe(`${USER}@example.com`)
    expect(await suite.db().collection('session').countDocuments({ userId: USER })).toBe(1)

    await removeAuthRows()
  })

  it('records the closure in the audit stream of each organisation it left', async () => {
    const repositories = suite.repositories()
    await removeAuthRows()
    await authRows(USER)

    const { organisation } = await repositories.organisations.createWithOwner({
      name: 'Audited',
      slug: 'closure-audited',
      createdByUserId: OTHER,
      createdByUserEmail: 'owner@example.com',
    })
    await repositories.memberships.create({
      organisationId: organisation._id,
      userId: USER,
      email: 'asha@example.com',
      role: 'viewer',
    })

    await repositories.accounts.close(USER)

    const events = await repositories.audit.listForOrganisation(organisation._id)
    const closure = events.find((entry) => entry.action === 'account.closed')
    expect(closure).toBeDefined()
    expect(closure?.actorUserId).toBe(USER)
    expect(closure?.metadata).toMatchObject({ previousRole: 'viewer' })

    await removeAuthRows()
  })

  it('is harmless to repeat', async () => {
    const repositories = suite.repositories()
    await removeAuthRows()
    await authRows(USER)

    expect((await repositories.accounts.close(USER)).closed).toBe(true)
    const second = await repositories.accounts.close(USER)

    // Nothing left to release, and the address is already the anonymous one.
    expect(second.closed).toBe(true)
    expect(second.releasedMemberships).toBe(0)
    const user = await suite.db().collection('user').findOne({ _id: USER as never })
    expect(user?.email).toBe(anonymisedEmail(USER))

    await removeAuthRows()
  })
})
