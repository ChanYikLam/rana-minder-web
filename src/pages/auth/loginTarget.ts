/** 登录成功后的默认落点解析（纯函数，便于单元测试）
 * 与根路径守卫（router/index.ts 的 P-GEN-00-root 分支）保持同一权限口径：
 * 有工作空间但无 club:dashboard:view 权限时，不得落入 /org/:clubId/dashboard（否则被守卫弹到无权限页），回退个人中心。
 */

/** 平台管理员默认首页（与根守卫共用同一常量，避免两处口径漂移） */
export const ADMIN_HOME_PATH = '/admin/clubs'

/** 校验 URL 携带的 redirect 参数是否合法同源路径（防止开放重定向）；
 * 非字符串 / 非 / 开头 / 协议相对 // / 跨源时返回 null。
 * origin 可注入便于测试，默认取当前页面源。 */
export function parseSameOriginRedirect(raw: unknown, origin: string = window.location.origin): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return null
  try {
    const target = new URL(raw, origin)
    return target.origin === origin ? `${target.pathname}${target.search}${target.hash}` : null
  } catch {
    return null
  }
}

export interface LoginTargetContext {
  /** 当前会话工作空间（可能为 null） */
  workspace: { clubId: string } | null
  /** 会话级权限查询 */
  hasPermission: (permission: string) => boolean
  /** URL 携带的 redirect 参数（已校验同源），优先于默认落点 */
  requestedRedirect: string | null
  /** 资料未完善：直接进入资料补全门禁页（P-GEN-04），避免落点闪跳 */
  needsProfileGate?: boolean
}

export function resolveLoginTarget(ctx: LoginTargetContext): string {
  if (ctx.needsProfileGate) return '/me/profile/required'
  if (ctx.requestedRedirect) return ctx.requestedRedirect
  if (ctx.workspace?.clubId && ctx.hasPermission('club:dashboard:view')) {
    return `/org/${ctx.workspace.clubId}/dashboard`
  }
  if (ctx.hasPermission('platform:club:manage')) return ADMIN_HOME_PATH
  return '/me'
}
