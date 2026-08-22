import { describe, expect, it } from 'vitest'
import { isRoleManagementAllowed } from './permissions.js'

describe('membership role management', () => {
  it('prevents admins from changing another admin or creating one', () => {
    expect(isRoleManagementAllowed('admin', 'admin', 'viewer')).toBe(false)
    expect(isRoleManagementAllowed('admin', 'operator', 'admin')).toBe(false)
  })

  it('allows an owner to manage non-owner roles', () => {
    expect(isRoleManagementAllowed('owner', 'admin', 'viewer')).toBe(true)
  })
})
