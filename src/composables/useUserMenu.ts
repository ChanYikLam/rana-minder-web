import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'

/**
 * 平台管理相关权限常量：
 * 与 DefaultLayout 的 ADMIN_NAV 平台分组（sideNav.ts）保持一致，
 * 任一命中即视为"平台管理员"（侧边栏展示"平台"分组）。
 *
 * P2-4 一致性：与 router/permissions.ts 的 ADMIN_PERMISSIONS 取并集。
 * 联合 / 招新平台页已细化为 platform:joint:manage / platform:recruitment:manage，
 * 也算作"平台管理员"可见入口。
 */
export const PLATFORM_PERMISSIONS = [
  'platform:club:manage',
  'platform:joint:manage',
  'platform:recruitment:manage',
  'platform:form:design',
  'platform:config:manage',
  'platform:audit:view',
  'platform:export:execute',
  'platform:delete:execute',
  'platform:ops:view',
]

/**
 * 用户菜单（头像下拉）公共逻辑，供 PublicLayout / DefaultLayout / TopNav 复用。
 *
 * - canAccessPlatformAdmin：用户菜单中"平台管理"入口固定跳转 /admin/clubs，
 *   其路由守卫（ADMIN_PERMISSIONS['P-ORG-01']）仅校验 platform:club:manage，
 *   故此处只按该单权限判定，避免只拥有其它平台权限的用户看到入口却被打回无权限页；
 *   与 TopNav 的 isAdmin（仅判 1 个权限）语义保持一致。
 * - hasAnyPlatformPermission：任一平台权限命中，用于 DefaultLayout 侧边栏"平台"
 *   分组的展示（该分组下各子项分别按各自权限渲染）。
 * - handleLogout：无论登出请求成功/失败都清理本地工作区上下文并回到登录页，
 *   避免 OIDC 网络异常导致用户滞留当前页且无反馈。
 */
const PLATFORM_ADMIN_ENTRY_PERMISSION = 'platform:club:manage'

export function useUserMenu(options?: { beforeRedirect?: () => void }) {
  const router = useRouter()
  const session = useSessionViewStore()
  const workspace = useWorkspaceContextStore()

  const canAccessPlatformAdmin = computed(() =>
    session.hasPermission(PLATFORM_ADMIN_ENTRY_PERMISSION),
  )

  const hasAnyPlatformPermission = computed(() =>
    PLATFORM_PERMISSIONS.some((p) => session.hasPermission(p)),
  )

  /** 退出登录：清理工作区上下文与跳转放入 finally，保证即使登出失败也回到登录页 */
  async function handleLogout() {
    try {
      await session.logout()
    } finally {
      workspace.clearWorkspace()
      options?.beforeRedirect?.()
      await router.push('/login')
    }
  }

  return {
    canAccessPlatformAdmin,
    hasAnyPlatformPermission,
    handleLogout,
  }
}
