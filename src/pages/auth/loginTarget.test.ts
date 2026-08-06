import { describe, it, expect } from 'vitest'
import { resolveLoginTarget } from './loginTarget'

function makeCtx(overrides: {
  workspace?: { clubId: string } | null
  permissions?: string[]
  requestedRedirect?: string | null
  needsProfileGate?: boolean
} = {}) {
  const permissions = overrides.permissions ?? []
  return {
    workspace: overrides.workspace ?? null,
    hasPermission: (p: string) => permissions.includes(p),
    requestedRedirect: overrides.requestedRedirect ?? null,
    needsProfileGate: overrides.needsProfileGate ?? false,
  }
}

describe('resolveLoginTarget', () => {
  it('普通成员：有工作空间但无 club:dashboard:view 时回落个人中心（不得落入工作台被弹无权限页）', () => {
    const target = resolveLoginTarget(
      makeCtx({ workspace: { clubId: 'club-001' }, permissions: ['club:member:view-self'] }),
    )
    expect(target).toBe('/me')
  })

  it('社团负责人：有工作空间且具 dashboard 权限时进入工作台', () => {
    const target = resolveLoginTarget(
      makeCtx({ workspace: { clubId: 'club-001' }, permissions: ['club:dashboard:view'] }),
    )
    expect(target).toBe('/org/club-001/dashboard')
  })

  it('面试官：有工作空间但无 dashboard 权限时回落个人中心', () => {
    const target = resolveLoginTarget(
      makeCtx({ workspace: { clubId: 'club-001' }, permissions: ['club:interview:view'] }),
    )
    expect(target).toBe('/me')
  })

  it('平台管理员：无工作空间但具平台权限时进入社团接入', () => {
    const target = resolveLoginTarget(
      makeCtx({ permissions: ['platform:club:manage'] }),
    )
    expect(target).toBe('/admin/clubs')
  })

  it('无工作空间且无平台权限（申请人）时进入个人中心', () => {
    const target = resolveLoginTarget(makeCtx({}))
    expect(target).toBe('/me')
  })

  it('redirect 参数优先于默认落点', () => {
    const target = resolveLoginTarget(
      makeCtx({
        workspace: { clubId: 'club-001' },
        permissions: ['club:dashboard:view'],
        requestedRedirect: '/explore/activities',
      }),
    )
    expect(target).toBe('/explore/activities')
  })

  it('资料未完善（needsProfileGate）时直接进入资料补全门禁页，优先于其它落点', () => {
    const target = resolveLoginTarget(
      makeCtx({
        workspace: { clubId: 'club-001' },
        permissions: ['club:dashboard:view'],
        requestedRedirect: '/explore/activities',
        needsProfileGate: true,
      }),
    )
    expect(target).toBe('/me/profile/required')
  })

  it('资料未完善但无 workspace 时同样进入门禁页', () => {
    const target = resolveLoginTarget(
      makeCtx({ needsProfileGate: true }),
    )
    expect(target).toBe('/me/profile/required')
  })
})
