import { expect, it } from 'vitest'
import { invitationTtlMs } from '../repositories.js'
import { describeIntegration } from './runner.js'

/**
 * Expired-invitation maintenance and the soft-delete filtering around it.
 *
 * Expiry revokes rather than deletes: the record and its token hash are kept so
 * the history of who was invited survives, which is why these tests check the
 * document is still there after the sweep rather than only that it stopped
 * working.
 */

const OWNER = 'user_owner'

/** Comfortably past any invitation's expiry. */
function afterExpiry(): Date {
  return new Date(Date.now() + invitationTtlMs + 60_000)
}

describeIntegration('Invitations', (suite) => {
  async function organisation(slug = 'solar-commons') {
    const created = await suite.repositories().organisations.createWithOwner({
      name: 'Solar Commons',
      slug,
      createdByUserId: OWNER,
      createdByUserEmail: 'owner@example.com',
    })
    return created.organisation
  }

  it('revokes an expired invitation without destroying its record', async () => {
    const org = await organisation()
    const repositories = suite.repositories()

    const { invitation } = await repositories.invitations.create({
      organisationId: org._id,
      email: 'invitee@example.com',
      role: 'operator',
      invitedByUserId: OWNER,
    })

    expect(await repositories.invitations.expirePending(afterExpiry())).toBe(1)

    const stored = await suite.collections().organisationInvitations
      .findOne({ _id: invitation._id })

    expect(stored?.status).toBe('revoked')
    expect(stored?.revokedAt).not.toBeNull()
    // Retained for history, token hash included.
    expect(stored?.deletedAt).toBeNull()
    expect(stored?.tokenHash).toBeTruthy()
  })

  it('is idempotent, so a repeated sweep changes nothing', async () => {
    const org = await organisation()
    const repositories = suite.repositories()

    await repositories.invitations.create({
      organisationId: org._id,
      email: 'invitee@example.com',
      role: 'operator',
      invitedByUserId: OWNER,
    })

    expect(await repositories.invitations.expirePending(afterExpiry())).toBe(1)
    expect(await repositories.invitations.expirePending(afterExpiry())).toBe(0)
  })

  it('leaves invitations that have not expired alone', async () => {
    const org = await organisation()
    const repositories = suite.repositories()

    const { invitation } = await repositories.invitations.create({
      organisationId: org._id,
      email: 'invitee@example.com',
      role: 'operator',
      invitedByUserId: OWNER,
    })

    // The sweep runs at "now", well before the seven-day expiry.
    expect(await repositories.invitations.expirePending(new Date())).toBe(0)

    const stored = await suite.collections().organisationInvitations
      .findOne({ _id: invitation._id })
    expect(stored?.status).toBe('pending')
  })

  it('never reopens an invitation that was already accepted', async () => {
    const org = await organisation()
    const repositories = suite.repositories()

    const { token, invitation } = await repositories.invitations.create({
      organisationId: org._id,
      email: 'invitee@example.com',
      role: 'operator',
      invitedByUserId: OWNER,
    })
    await repositories.invitations.accept(token, 'user_invitee', 'invitee@example.com')

    expect(await repositories.invitations.expirePending(afterExpiry())).toBe(0)

    const stored = await suite.collections().organisationInvitations
      .findOne({ _id: invitation._id })
    expect(stored?.status).toBe('accepted')
  })

  it('skips invitations soft-deleted by an archive', async () => {
    const org = await organisation()
    const repositories = suite.repositories()

    await repositories.invitations.create({
      organisationId: org._id,
      email: 'invitee@example.com',
      role: 'operator',
      invitedByUserId: OWNER,
    })
    await repositories.organisations.softDelete(org._id, OWNER)

    // The archive already revoked and soft-deleted it; the sweep must not
    // count it again.
    expect(await repositories.invitations.expirePending(afterExpiry())).toBe(0)
  })

  it('refuses an expired token at acceptance even before the sweep runs', async () => {
    const org = await organisation()
    const repositories = suite.repositories()

    const { token, invitation } = await repositories.invitations.create({
      organisationId: org._id,
      email: 'invitee@example.com',
      role: 'operator',
      invitedByUserId: OWNER,
    })

    // Backdate the expiry rather than waiting seven days.
    await suite.collections().organisationInvitations
      .updateOne({ _id: invitation._id }, { $set: { expiresAt: new Date(Date.now() - 60_000) } })

    await expect(
      repositories.invitations.accept(token, 'user_invitee', 'invitee@example.com'),
    ).rejects.toThrow('INVITATION_EXPIRED')
  })

  it('refuses a token offered by a different address', async () => {
    const org = await organisation()
    const repositories = suite.repositories()

    const { token } = await repositories.invitations.create({
      organisationId: org._id,
      email: 'invitee@example.com',
      role: 'operator',
      invitedByUserId: OWNER,
    })

    await expect(
      repositories.invitations.accept(token, 'user_other', 'someone-else@example.com'),
    ).rejects.toThrow('INVITATION_EMAIL_MISMATCH')
  })

  it('hides an expired invitation from the pending lookup', async () => {
    const org = await organisation()
    const repositories = suite.repositories()

    const { invitation } = await repositories.invitations.create({
      organisationId: org._id,
      email: 'invitee@example.com',
      role: 'operator',
      invitedByUserId: OWNER,
    })

    expect(
      await repositories.invitations.findPendingByEmail(org._id, 'invitee@example.com'),
    ).not.toBeNull()

    await suite.collections().organisationInvitations
      .updateOne({ _id: invitation._id }, { $set: { expiresAt: new Date(Date.now() - 60_000) } })

    // Expired means unusable, whether or not the sweep has caught up.
    expect(
      await repositories.invitations.findPendingByEmail(org._id, 'invitee@example.com'),
    ).toBeNull()
  })

  it('sweeps across organisations in one pass', async () => {
    const repositories = suite.repositories()
    const first = await organisation('solar-commons')
    const second = await organisation('wind-commons')

    for (const org of [first, second]) {
      await repositories.invitations.create({
        organisationId: org._id,
        email: 'invitee@example.com',
        role: 'operator',
        invitedByUserId: OWNER,
      })
    }

    expect(await repositories.invitations.expirePending(afterExpiry())).toBe(2)
  })
})
