import { describe, it, expect } from 'vitest'
import {
  MEMBERSHIP_ROLES,
  canArchiveOrganisation,
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
