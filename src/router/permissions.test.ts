import { describe, expect, it } from 'vitest'
import { workspacePermissionForRoute, ADMIN_PERMISSIONS, INTERVIEW_ACCESS_PERMISSIONS } from './permissions'
import { mockUsers, getPermissions } from '@/mock/auth'
import router from '@/router'

describe('ADMIN_PERMISSIONS', () => {
  it('maps all admin route names to a permission', () => {
    expect(ADMIN_PERMISSIONS['P-REC-admin-list']).toBe('platform:club:manage')
    expect(ADMIN_PERMISSIONS['P-ORG-01']).toBe('platform:club:manage')
    expect(ADMIN_PERMISSIONS['P-OPS-01']).toBe('platform:ops:view')
    // P2-2：表单填写页使用「可填写」权限而非「设计」权限
    expect(ADMIN_PERMISSIONS['P-FORM-02-admin']).toBe('platform:form:fill')
    expect(ADMIN_PERMISSIONS['P-FORM-01-admin']).toBe('platform:form:design')
  })

  it('covers every requiresAdmin route (guard rejects missing keys unconditionally)', () => {
    const adminRoutes = router
      .getRoutes()
      .filter((r) => r.meta.requiresAdmin === true)
      .map((r) => String(r.name))
    expect(adminRoutes.length).toBeGreaterThan(0)
    for (const name of adminRoutes) {
      expect(ADMIN_PERMISSIONS[name], `missing ADMIN_PERMISSIONS for route ${name}`).toBeTruthy()
    }
  })

  it('resolves every requiresWorkspace route (exact or prefix fallback)', () => {
    const wsRoutes = router
      .getRoutes()
      .filter((r) => r.meta.requiresWorkspace === true)
      .map((r) => String(r.name))
    expect(wsRoutes.length).toBeGreaterThan(0)
    for (const name of wsRoutes) {
      expect(workspacePermissionForRoute(name), `unresolved workspace permission for route ${name}`).not.toBeNull()
    }
  })
})

describe('workspacePermissionForRoute', () => {
  it('maps member routes to club:member:manage', () => {
    expect(workspacePermissionForRoute('P-MEM-list')).toBe('club:member:manage')
    expect(workspacePermissionForRoute('P-MEM-02')).toBe('club:member:manage')
    expect(workspacePermissionForRoute('P-MEM-01')).toBe('club:member:manage')
  })

  it('maps exit route to member:manage or view-self (self-exit accessible to ordinary members)', () => {
    expect(workspacePermissionForRoute('P-MEM-05')).toEqual(['club:member:manage', 'club:member:view-self'])
  })

  it('maps appointment route to club:appointment:manage (leader/hr only)', () => {
    expect(workspacePermissionForRoute('P-MEM-04')).toBe('club:appointment:manage')
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

  it('maps recruitment list/detail/review to interview access union (SRS 7.4 / ORG-037)', () => {
    expect(workspacePermissionForRoute('P-REC-list')).toEqual(INTERVIEW_ACCESS_PERMISSIONS)
    expect(workspacePermissionForRoute('P-REC-02')).toEqual(INTERVIEW_ACCESS_PERMISSIONS)
    expect(workspacePermissionForRoute('P-REC-05')).toEqual(INTERVIEW_ACCESS_PERMISSIONS)
  })

  it('keeps recruitment manage-only routes gated by club:recruitment:manage', () => {
    expect(workspacePermissionForRoute('P-REC-01')).toBe('club:recruitment:manage')
    expect(workspacePermissionForRoute('P-REC-02-applications')).toBe('club:recruitment:manage')
    expect(workspacePermissionForRoute('P-REC-04-manage')).toBe('club:recruitment:manage')
    expect(workspacePermissionForRoute('P-REC-06-manage')).toBe('club:recruitment:manage')
  })

  it('maps club email config to club:email:config (leader only, SRS 7.3)', () => {
    expect(workspacePermissionForRoute('P-NTF-02-club')).toBe('club:email:config')
  })

  it('returns null for unknown route names', () => {
    expect(workspacePermissionForRoute('P-GEN-01')).toBeNull()
    expect(workspacePermissionForRoute('')).toBeNull()
  })
})

describe('appointment/resignation permission roles', () => {
  it('grants club:appointment:manage and club:resignation:approve to leader and hr only', () => {
    for (const userKey of ['leader', 'hr']) {
      const perms = getPermissions(mockUsers[userKey], 'club-001')
      expect(perms).toContain('club:appointment:manage')
      expect(perms).toContain('club:resignation:approve')
    }
    const deptleaderPerms = getPermissions(mockUsers.deptleader, 'club-001')
    expect(deptleaderPerms).not.toContain('club:appointment:manage')
    expect(deptleaderPerms).not.toContain('club:resignation:approve')
  })

  it('grants both permissions to hr role in the second club (leader@club-002)', () => {
    const perms = mockUsers.leader.roles.find((r) => r.clubId === 'club-002')!.permissions
    expect(perms).toContain('club:appointment:manage')
    expect(perms).toContain('club:resignation:approve')
  })
})
