/** 路由级权限映射（与路由定义解耦，便于单元测试）
 * 值可为单个权限串或权限串数组（任一命中即可）。
 */

/** 面试职能访问（SRS 7.4 / ORG-037）：
 * 社团负责人、人事管理员默认全量面试职能（经 club:recruitment:manage）；
 * 部门负责人默认全量面试职能、临时面试官按任务授权（经 club:interview:view|evaluate）。
 */
export const INTERVIEW_ACCESS_PERMISSIONS = [
  'club:recruitment:manage',
  'club:interview:view',
  'club:interview:evaluate',
]

export const WORKSPACE_PERMISSIONS: Record<string, string | string[]> = {
  'P-ORG-02': 'club:dashboard:view',
  'P-ORG-03': 'club:batch:execute',
  'P-REC': 'club:recruitment:manage',
  'P-REC-list': INTERVIEW_ACCESS_PERMISSIONS,
  'P-REC-02': INTERVIEW_ACCESS_PERMISSIONS,
  'P-REC-05': INTERVIEW_ACCESS_PERMISSIONS,
  'P-JNT': 'club:joint:manage',
  'P-MEM': 'club:member:manage',
  'P-MEM-list': ['club:member:manage', 'club:member:view-self'],
  'P-MEM-01': ['club:member:manage', 'club:member:view-self'],
  'P-MEM-03-manage': 'club:invite:manage',
  'P-MEM-04': 'club:appointment:manage',
  'P-MEM-05': ['club:member:manage', 'club:member:view-self'],
  'P-MEM-06': 'club:transition:manage',
  'P-FORM': 'club:form:design',
  'P-STAT': 'club:stats:view',
  'P-EXP': 'club:export:execute',
  'P-NTF-02-club': 'club:email:config',
  'P-NTF': 'club:config:manage',
  'P-AUD': 'club:audit:view',
  'P-CFG': 'club:config:manage',
}

export const ADMIN_PERMISSIONS: Record<string, string> = {
  'P-FORM-admin-list': 'platform:form:design',
  'P-FORM-01-admin': 'platform:form:design',
  // 填写页使用「可填写」权限而非「设计」权限（P2-2），与表单填写语义一致
  'P-FORM-02-admin': 'platform:form:fill',
  'P-JNT-admin-list': 'platform:club:manage',
  'P-JNT-05-admin': 'platform:club:manage',
  'P-REC-admin-list': 'platform:club:manage',
  'P-ORG-01': 'platform:club:manage',
  'P-ORG-01-wizard': 'platform:club:manage',
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

// P2-2 健壮性：显式声明作为前缀规则的 key。
// 其余 key（如 P-REC-list / P-REC-02 / P-MEM-01 / P-MEM-03-manage 等）只参与精确匹配，
// 不会被 startsWith 命中——避免"P-REC-02-applications 被 P-REC-02 误吞"。
// 模块加载时一次性按 key 长度倒序排序（最长前缀优先），
// 消除对 Object.keys 插入顺序的隐式依赖，使匹配行为可预测。
const WORKSPACE_PREFIX_KEYS = new Set<string>([
  'P-REC', 'P-JNT', 'P-MEM', 'P-FORM', 'P-STAT', 'P-EXP', 'P-NTF', 'P-AUD', 'P-CFG',
])

const WORKSPACE_PREFIX_KEYS_BY_LENGTH: readonly string[] = Array.from(WORKSPACE_PREFIX_KEYS).sort(
  (a, b) => b.length - a.length,
)

export function workspacePermissionForRoute(routeName: string): string | string[] | null {
  // 1. 精确匹配优先（最具体的情况，如 P-MEM-03-manage 命中自身而非 P-MEM）
  const exact = WORKSPACE_PERMISSIONS[routeName]
  if (exact) return exact

  // 2. 前缀匹配：仅遍历显式声明的前缀规则集，按 key 长度倒序（最长前缀优先）
  //    - startsWith(`${key}-`) 命中如 P-REC-04-manage → P-REC
  //    - 全等于 `${key}-list` 命中如 P-FORM-list → P-FORM（即使字典中无 P-FORM-list 精确键）
  //    注意：精确键（P-REC-02 / P-MEM-01 等）不在此集中，不会被 startsWith 误吞
  for (const key of WORKSPACE_PREFIX_KEYS_BY_LENGTH) {
    if (routeName.startsWith(`${key}-`) || routeName === `${key}-list`) {
      return WORKSPACE_PERMISSIONS[key]
    }
  }
  return null
}
