import { describe, expect, it } from 'vitest'
import type { MembershipDocument, MembershipRole } from '../db/models.js'
import {
  ANONYMISED_NAME,
  anonymisedEmail,
  canCloseAccount,
  isAnonymisedEmail,
  ownedOrganisationIds,
} from './closure.js'

/**
 * Closing an account is the one self-service operation whose correctness depends
 * on Volt's own invariants rather than on identity alone: an organisation always
 * has exactly one owner, and the ledger is never rewritten.
 */

function membership(overrides: Partial<MembershipDocument> = {}): MembershipDocument {
  return {
    _id: 'membership_1',
    organisationId: 'org_1',
    userId: 'user_1',
    email: 'asha@example.com',
    role: 'viewer' as MembershipRole,
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: new Date('2030-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  }
}

describe('ownedOrganisationIds', () => {
  it('finds the organisations the account owns', () => {
    const memberships = [
      membership({ organisationId: 'org_1', role: 'owner' }),
      membership({ organisationId: 'org_2', role: 'admin' }),
      membership({ organisationId: 'org_3', role: 'owner' }),
    ]

    expect(ownedOrganisationIds(memberships)).toEqual(['org_1', 'org_3'])
  })

  it('ignores every role that is not owner', () => {
    const memberships = (['admin', 'operator', 'viewer'] as const).map((role, index) =>
      membership({ organisationId: `org_${index}`, role }),
    )

    // Only an owner cannot be removed; the rest are ordinary members.
    expect(ownedOrganisationIds(memberships)).toEqual([])
  })

  it('ignores ownership of an archived organisation', () => {
    const memberships = [
      membership({ organisationId: 'org_1', role: 'owner', deletedAt: new Date() }),
    ]

    // Archiving soft-deletes the memberships, so it must not strand the owner.
    expect(ownedOrganisationIds(memberships)).toEqual([])
  })
})

describe('canCloseAccount', () => {
  it('allows an account that owns nothing', () => {
    expect(canCloseAccount([])).toBe(true)
    expect(canCloseAccount([membership({ role: 'admin' })])).toBe(true)
  })

  it('refuses an account that still owns an organisation', () => {
    // An owner membership cannot be removed, so closing would leave an
    // organisation nobody can administer while it still holds settlements.
    expect(canCloseAccount([membership({ role: 'owner' })])).toBe(false)
  })
})

describe('anonymisedEmail', () => {
  it('produces an address that can never receive mail', () => {
    // .invalid is reserved so it cannot resolve.
    expect(anonymisedEmail('user_1')).toMatch(/@invalid$/)
  })

  it('is stable for the same account, so closing twice is idempotent', () => {
    expect(anonymisedEmail('user_1')).toBe(anonymisedEmail('user_1'))
  })

  it('differs between accounts, so two closures cannot collide', () => {
    expect(anonymisedEmail('user_1')).not.toBe(anonymisedEmail('user_2'))
  })

  it('carries nothing of the original address', () => {
    const produced = anonymisedEmail('user_1')
    expect(produced).not.toContain('user_1')
    expect(isAnonymisedEmail(produced)).toBe(true)
  })

  it('does not recognise an ordinary address as anonymised', () => {
    expect(isAnonymisedEmail('asha@example.com')).toBe(false)
    expect(isAnonymisedEmail('deleted-short@invalid')).toBe(false)
  })
})

describe('ANONYMISED_NAME', () => {
  it('leaves no display name behind', () => {
    expect(ANONYMISED_NAME).toBe('')
  })
})
