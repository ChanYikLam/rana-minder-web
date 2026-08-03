/** 路由级权限映射（与路由定义解耦，便于单元测试） */

export const WORKSPACE_PERMISSIONS: Record<string, string> = {
  'P-ORG-02': 'club:dashboard:view',
  'P-ORG-03': 'club:batch:execute',
  'P-REC': 'club:recruitment:manage',
  'P-JNT': 'club:joint:manage',
  'P-MEM': 'club:member:manage',
  'P-MEM-03-manage': 'club:invite:manage',
  'P-MEM-06': 'club:transition:manage',
  'P-FORM': 'club:form:design',
  'P-STAT': 'club:stats:view',
  'P-EXP': 'club:export:execute',
  'P-NTF': 'club:config:manage',
  'P-AUD': 'club:audit:view',
  'P-CFG': 'club:config:manage',
}

export const ADMIN_PERMISSIONS: Record<string, string> = {
  'P-FORM-admin-list': 'platform:form:design',
  'P-FORM-01-admin': 'platform:form:design',
  'P-FORM-02-admin': 'platform:form:design',
  'P-JNT-admin-list': 'platform:club:manage',
  'P-JNT-05-admin': 'platform:club:manage',
  'P-REC-admin-list': 'platform:club:manage',
  'P-ORG-01': 'platform:club:manage',
  'P-NTF-02-platform': 'platform:config:manage',
  'P-AUD-01-admin': 'platform:audit:view',
  'P-AUD-02-admin': 'platform:audit:view',
  'P-STAT-01-admin': 'platform:export:execute',
  'P-EXP-01-admin': 'platform:export:execute',
  'P-AUD-03': 'platform:delete:execute',
  'P-AUD-04': 'platform:delete:execute',
  'P-CFG-01-admin': 'platform:config:manage',
  'P-CFG-02': 'platform:config:manage',
  'P-OPS-01': 'platform:ops:view',
}

export function workspacePermissionForRoute(routeName: string): string | null {
  const exact = WORKSPACE_PERMISSIONS[routeName]
  if (exact) return exact
  const prefix = Object.keys(WORKSPACE_PERMISSIONS).find((key) => routeName.startsWith(`${key}-`) || routeName === `${key}-list`)
  return prefix ? WORKSPACE_PERMISSIONS[prefix] : null
}
