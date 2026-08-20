import { describe, it, expect } from 'vitest'
import {
  ASSIGNABLE_ROLES,
  MEMBERSHIP_ROLES,
  canArchiveOrganisation,
  canManageMembership,
  canManageMembers,
  canRunSimulations,
  canSettleAndAdjustLedger,
  canTransferOwnership,
  canViewAuditEvents,
  isMembershipRole,
  roleLabel,
} from '../permissions'

describe('MEMBERSHIP_ROLES', () => {
  it('lists the four roles most-privileged first', () => {
    expect(MEMBERSHIP_ROLES).toEqual(['owner', 'admin', 'operator', 'viewer'])
  })
})

describe('isMembershipRole', () => {
  it('accepts every known role', () => {
    for (const role of MEMBERSHIP_ROLES) expect(isMembershipRole(role)).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isMembershipRole('superadmin')).toBe(false)
    expect(isMembershipRole('')).toBe(false)
    expect(isMembershipRole(undefined)).toBe(false)
    expect(isMembershipRole(null)).toBe(false)
    expect(isMembershipRole(3)).toBe(false)
  })
})

describe('canManageMembers', () => {
  it('allows owner and admin only', () => {
    expect(canManageMembers('owner')).toBe(true)
    expect(canManageMembers('admin')).toBe(true)
    expect(canManageMembers('operator')).toBe(false)
    expect(canManageMembers('viewer')).toBe(false)
  })
})

describe('canRunSimulations', () => {
  it('allows owner, admin and operator', () => {
    expect(canRunSimulations('owner')).toBe(true)
    expect(canRunSimulations('admin')).toBe(true)
    expect(canRunSimulations('operator')).toBe(true)
    expect(canRunSimulations('viewer')).toBe(false)
  })
})

describe('canSettleAndAdjustLedger', () => {
  it('allows owner and admin only, matching server-owned settlement', () => {
    expect(canSettleAndAdjustLedger('owner')).toBe(true)
    expect(canSettleAndAdjustLedger('admin')).toBe(true)
    expect(canSettleAndAdjustLedger('operator')).toBe(false)
    expect(canSettleAndAdjustLedger('viewer')).toBe(false)
  })
})

describe('canViewAuditEvents', () => {
  it('allows owner and admin only', () => {
    expect(canViewAuditEvents('owner')).toBe(true)
    expect(canViewAuditEvents('admin')).toBe(true)
    expect(canViewAuditEvents('operator')).toBe(false)
    expect(canViewAuditEvents('viewer')).toBe(false)
  })
})

describe('canTransferOwnership', () => {
  it('allows the owner only', () => {
    expect(canTransferOwnership('owner')).toBe(true)
    expect(canTransferOwnership('admin')).toBe(false)
    expect(canTransferOwnership('operator')).toBe(false)
    expect(canTransferOwnership('viewer')).toBe(false)
  })
})

describe('canArchiveOrganisation', () => {
  it('allows the owner only', () => {
    expect(canArchiveOrganisation('owner')).toBe(true)
    expect(canArchiveOrganisation('admin')).toBe(false)
    expect(canArchiveOrganisation('operator')).toBe(false)
    expect(canArchiveOrganisation('viewer')).toBe(false)
  })
})

describe('roleLabel', () => {
  it('renders each role for display', () => {
    expect(roleLabel('owner')).toBe('Owner')
    expect(roleLabel('admin')).toBe('Admin')
    expect(roleLabel('operator')).toBe('Operator')
    expect(roleLabel('viewer')).toBe('Viewer')
  })
})

describe('ASSIGNABLE_ROLES', () => {
  it('excludes owner, which is only reachable through an ownership transfer', () => {
    expect(ASSIGNABLE_ROLES).toEqual(['admin', 'operator', 'viewer'])
  })
})

describe('canManageMembership', () => {
  it('lets an owner manage every non-owner member', () => {
    expect(canManageMembership('owner', 'admin')).toBe(true)
    expect(canManageMembership('owner', 'operator')).toBe(true)
    expect(canManageMembership('owner', 'viewer')).toBe(true)
  })

  it('protects the owner membership from everyone, including the owner', () => {
    expect(canManageMembership('owner', 'owner')).toBe(false)
    expect(canManageMembership('admin', 'owner')).toBe(false)
  })

  it('never allows granting the owner role', () => {
    expect(canManageMembership('owner', 'admin', 'owner')).toBe(false)
    expect(canManageMembership('owner', 'viewer', 'owner')).toBe(false)
  })

  it('lets an admin manage operators and viewers only', () => {
    expect(canManageMembership('admin', 'operator')).toBe(true)
    expect(canManageMembership('admin', 'viewer')).toBe(true)
    expect(canManageMembership('admin', 'admin')).toBe(false)
  })

  it('stops an admin promoting anyone to admin', () => {
    expect(canManageMembership('admin', 'viewer', 'admin')).toBe(false)
    expect(canManageMembership('admin', 'operator', 'viewer')).toBe(true)
  })

  it('lets an owner promote to admin', () => {
    expect(canManageMembership('owner', 'viewer', 'admin')).toBe(true)
  })

  it('gives operators and viewers no management at all', () => {
    for (const target of MEMBERSHIP_ROLES) {
      expect(canManageMembership('operator', target)).toBe(false)
      expect(canManageMembership('viewer', target)).toBe(false)
    }
  })
})
