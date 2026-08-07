/** 全局导航守卫决策逻辑（纯函数化，便于单元测试）。
 * 由 router/index.ts 注入 stores 调用；身份切换清缓存、profile gate、
 * admin/workspace 双权限链、根路径落点等全部决策集中于此，
 * 测试可脱离 vue-router 实例直接验证。 */
import { ADMIN_HOME_PATH, PROFILE_GATE_PATH, type LoginTargetContext } from '@/pages/auth/loginTarget'
import type { ClubRole } from '@/types/domain'
import { ADMIN_PERMISSIONS, workspacePermissionForRoute } from './permissions'

export interface GuardSession {
  isAuthenticated: boolean
  needsProfileGate: boolean
  user: { id: string } | null
  workspace: { clubId: string; clubName: string; role: ClubRole; memberId?: string | null } | null
  permissions: string[]
  hasPermission: (permission: string) => boolean
  loadSession: () => Promise<void>
}

export interface GuardWorkspace {
  hasWorkspace: boolean
  currentUserId: string | null
  currentClubId: string | null
  clearWorkspace: () => void
  loadWorkspace: (clubId: string) => Promise<boolean>
  hasPermission: (permission: string) => boolean
  setWorkspace: (
    clubId: string,
    clubName: string,
    role: ClubRole,
    permissions: string[],
    userId: string | null,
    memberId: string | null,
  ) => void
}

export interface GuardTarget {
  path: string
  fullPath: string
  name?: string | symbol | null
  meta: Record<string, unknown>
  params: Record<string, string | string[] | undefined>
}

export type GuardDecision =
  | true
  | { name: string; query?: { redirect: string } }
  | { path: string }

export async function runNavigationGuard(
  to: GuardTarget,
  session: GuardSession,
  workspace: GuardWorkspace,
  resolveLoginTarget: (ctx: LoginTargetContext) => string,
): Promise<GuardDecision> {
  // 登录身份变化时统一清空上一身份的工作空间上下文，避免缓存串身份
  if (workspace.hasWorkspace && workspace.currentUserId !== session.user?.id) {
    workspace.clearWorkspace()
  }

  // 根路径：按会话状态跳转默认落点
  if (to.path === '/') {
    if (!session.isAuthenticated) {
      await session.loadSession()
    }
    if (!session.isAuthenticated) {
      return { name: 'P-IDN-01' }
    }
    // 工作空间以最近加载的 store 上下文为准（如经 ClubSwitcher 切到 club-002 时 store 比
    // session.workspace 新，避免按旧社团解析落点）；store 未加载或非当前身份时回落会话
    const storeClubId = workspace.hasWorkspace && workspace.currentUserId === session.user?.id ? workspace.currentClubId : null
    const target = resolveLoginTarget({
      workspace: storeClubId ? { clubId: storeClubId } : session.workspace,
      hasPermission: storeClubId
        ? (permission) => workspace.hasPermission(permission)
        : (permission) => session.hasPermission(permission),
      requestedRedirect: null,
      needsProfileGate: session.needsProfileGate,
    })
    if (target === ADMIN_HOME_PATH) {
      return { name: 'P-ORG-01' }
    }
    if (target === PROFILE_GATE_PATH) {
      return { name: 'P-GEN-04' }
    }
    if (target.startsWith('/org/')) {
      return { path: target }
    }
    return { name: 'P-IDN-03' }
  }

  const isPublic = to.meta.public === true

  if (!isPublic) {
    if (!session.isAuthenticated) {
      await session.loadSession()
    }

    if (!session.isAuthenticated) {
      return { name: 'P-IDN-01', query: { redirect: to.fullPath } }
    }

    if (
      session.needsProfileGate &&
      to.name !== 'P-GEN-04' &&
      to.name !== 'P-IDN-02' &&
      to.name !== 'P-IDN-02-edit' &&
      to.name !== 'P-IDN-02-sync-conflict'
    ) {
      return { name: 'P-GEN-04' }
    }

    if (to.meta.requiresAdmin === true) {
      const permission = ADMIN_PERMISSIONS[String(to.name)]
      if (!permission || !session.hasPermission(permission)) {
        return { name: 'P-GEN-02' }
      }
    }

    if (to.meta.requiresWorkspace === true) {
      const clubId = typeof to.params.clubId === 'string' ? to.params.clubId : null
      const permission = workspacePermissionForRoute(String(to.name))
      if (!clubId || !permission || !(await workspace.loadWorkspace(clubId))) {
        return { name: 'P-GEN-02' }
      }
      const granted = Array.isArray(permission)
        ? permission.some((p) => workspace.hasPermission(p))
        : workspace.hasPermission(permission)
      if (!granted) {
        return { name: 'P-GEN-02' }
      }
    } else if (
      session.workspace &&
      (!workspace.hasWorkspace || workspace.currentUserId !== session.user?.id)
    ) {
      // 非工作空间页面：保留当前工作空间上下文，方便侧边栏导航；未加载或登录身份已变化时按会话初始化
      workspace.setWorkspace(
        session.workspace.clubId,
        session.workspace.clubName,
        session.workspace.role,
        session.permissions,
        session.user?.id ?? null,
        session.workspace.memberId ?? null,
      )
    }
  }

  return true
}
