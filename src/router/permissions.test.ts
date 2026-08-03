import { describe, expect, it } from 'vitest'
import { workspacePermissionForRoute, ADMIN_PERMISSIONS } from './permissions'

describe('ADMIN_PERMISSIONS', () => {
  it('maps all admin route names to a permission', () => {
    expect(ADMIN_PERMISSIONS['P-REC-admin-list']).toBe('platform:club:manage')
    expect(ADMIN_PERMISSIONS['P-ORG-01']).toBe('platform:club:manage')
    expect(ADMIN_PERMISSIONS['P-OPS-01']).toBe('platform:ops:view')
  })
})

describe('workspacePermissionForRoute', () => {
  it('maps member routes to club:member:manage', () => {
    expect(workspacePermissionForRoute('P-MEM-list')).toBe('club:member:manage')
    expect(workspacePermissionForRoute('P-MEM-02')).toBe('club:member:manage')
    expect(workspacePermissionForRoute('P-MEM-04')).toBe('club:member:manage')
    expect(workspacePermissionForRoute('P-MEM-05')).toBe('club:member:manage')
    expect(workspacePermissionForRoute('P-MEM-01')).toBe('club:member:manage')
  })

  it('maps invite route to club:invite:manage (exact override over prefix)', () => {
    expect(workspacePermissionForRoute('P-MEM-03-manage')).toBe('club:invite:manage')
  })

  it('maps transition route to club:transition:manage (exact override)', () => {
    expect(workspacePermissionForRoute('P-MEM-06')).toBe('club:transition:manage')
  })

  it('maps other workspace route families to their permissions', () => {
    expect(workspacePermissionForRoute('P-ORG-02')).toBe('club:dashboard:view')
    expect(workspacePermissionForRoute('P-ORG-03')).toBe('club:batch:execute')
    expect(workspacePermissionForRoute('P-REC-01')).toBe('club:recruitment:manage')
    expect(workspacePermissionForRoute('P-FORM-list')).toBe('club:form:design')
    expect(workspacePermissionForRoute('P-STAT-01')).toBe('club:stats:view')
    expect(workspacePermissionForRoute('P-AUD-02')).toBe('club:audit:view')
  })

  it('returns null for unknown route names', () => {
    expect(workspacePermissionForRoute('P-GEN-01')).toBeNull()
    expect(workspacePermissionForRoute('')).toBeNull()
  })
})
