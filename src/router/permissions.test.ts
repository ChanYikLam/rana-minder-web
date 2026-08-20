import { describe, expect, it } from 'vitest'
import { workspacePermissionForRoute, ADMIN_PERMISSIONS, INTERVIEW_ACCESS_PERMISSIONS } from './permissions'
import { mockUsers, getPermissions } from '@/mock/auth'
import router from '@/router'

describe('ADMIN_PERMISSIONS', () => {
  it('maps all admin route names to a permission', () => {
    // P2-4 一致性：联合/招新平台页细化为各自细粒度权限，不再归口 platform:club:manage
    expect(ADMIN_PERMISSIONS['P-REC-admin-list']).toBe('platform:recruitment:manage')
    expect(ADMIN_PERMISSIONS['P-JNT-admin-list']).toBe('platform:joint:manage')
    expect(ADMIN_PERMISSIONS['P-JNT-05-admin']).toBe('platform:joint:manage')
    // 社团接入/接入向导本身即为"社团管理"语义，归口 platform:club:manage 是最具体
    expect(ADMIN_PERMISSIONS['P-ORG-01']).toBe('platform:club:manage')
    expect(ADMIN_PERMISSIONS['P-ORG-01-wizard']).toBe('platform:club:manage')
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
  it('maps member list/detail to manage or view-self (ordinary members can browse)', () => {
    expect(workspacePermissionForRoute('P-MEM-list')).toEqual(['club:member:manage', 'club:member:view-self'])
    expect(workspacePermissionForRoute('P-MEM-01')).toEqual(['club:member:manage', 'club:member:view-self'])
  })

  it('maps department-apply route to club:member:manage only', () => {
    expect(workspacePermissionForRoute('P-MEM-02')).toBe('club:member:manage')
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

  // P2-2 健壮性：未声明的子键必须按"最长前缀"命中，且不依赖 Object.keys 顺序
  it('matches longest prefix deterministically (no dependency on Object.keys order)', () => {
    // P-REC-*（无精确键）→ P-REC 前缀 → club:recruitment:manage
    expect(workspacePermissionForRoute('P-REC-99')).toBe('club:recruitment:manage')
    // P-MEM-*（无精确键）→ P-MEM 前缀 → club:member:manage
    expect(workspacePermissionForRoute('P-MEM-99')).toBe('club:member:manage')
    // P-STAT-*（无精确键）→ P-STAT 前缀 → club:stats:view
    expect(workspacePermissionForRoute('P-STAT-99')).toBe('club:stats:view')
    // P-FORM-list 也走最长前缀命中（字典中无 P-FORM-list 精确键）
    expect(workspacePermissionForRoute('P-FORM-list')).toBe('club:form:design')
    // 精确键仍优先于任何前缀匹配
    expect(workspacePermissionForRoute('P-MEM-03-manage')).toBe('club:invite:manage')
    expect(workspacePermissionForRoute('P-REC-02')).toEqual(INTERVIEW_ACCESS_PERMISSIONS)
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
