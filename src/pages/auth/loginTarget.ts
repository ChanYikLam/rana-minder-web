/** 登录成功后的默认落点解析（纯函数，便于单元测试）
 * 与根路径守卫（router/index.ts 的 P-GEN-00-root 分支）保持同一权限口径：
 * 有工作空间但无 club:dashboard:view 权限时，不得落入 /org/:clubId/dashboard（否则被守卫弹到无权限页），回退个人中心。
 */

export interface LoginTargetContext {
  /** 当前会话工作空间（可能为 null） */
  workspace: { clubId: string } | null
  /** 会话级权限查询 */
  hasPermission: (permission: string) => boolean
  /** URL 携带的 redirect 参数（已校验同源），优先于默认落点 */
  requestedRedirect: string | null
}

export function resolveLoginTarget(ctx: LoginTargetContext): string {
  if (ctx.requestedRedirect) return ctx.requestedRedirect
  if (ctx.workspace?.clubId && ctx.hasPermission('club:dashboard:view')) {
    return `/org/${ctx.workspace.clubId}/dashboard`
  }
  if (ctx.hasPermission('platform:club:manage')) return '/admin/clubs'
  return '/me'
}
