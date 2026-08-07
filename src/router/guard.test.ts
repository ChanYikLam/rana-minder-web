import { describe, expect, it, vi } from 'vitest'
import { runNavigationGuard, type GuardSession, type GuardTarget, type GuardWorkspace } from './guard'
import { resolveLoginTarget } from '@/pages/auth/loginTarget'

function makeSession(overrides: Partial<GuardSession> = {}): GuardSession {
  return {
    isAuthenticated: false,
    needsProfileGate: false,
    user: null,
    workspace: null,
    permissions: [],
    hasPermission: () => false,
    loadSession: vi.fn(async () => {}),
    ...overrides,
  }
}

function makeWorkspace(overrides: Partial<GuardWorkspace> = {}): GuardWorkspace {
  return {
    hasWorkspace: false,
    currentUserId: null,
    currentClubId: null,
    clearWorkspace: vi.fn(),
    loadWorkspace: vi.fn(async () => true),
    hasPermission: () => false,
    setWorkspace: vi.fn(),
    ...overrides,
  }
}

function makeTarget(overrides: Partial<GuardTarget> = {}): GuardTarget {
  return {
    path: '/me',
    fullPath: '/me',
    name: 'P-IDN-03',
    meta: {},
    params: {},
    ...overrides,
  }
}

function mockResolve(target: string) {
  return vi.fn(() => target)
}

describe('runNavigationGuard 身份切换清缓存', () => {
  it('工作空间归属上一身份时清空，避免缓存串身份', async () => {
    const session = makeSession({ isAuthenticated: true, user: { id: 'user-002' } })
    const workspace = makeWorkspace({ hasWorkspace: true, currentUserId: 'user-001' })

    await runNavigationGuard(makeTarget(), session, workspace, mockResolve('/me'))

    expect(workspace.clearWorkspace).toHaveBeenCalledTimes(1)
  })

  it('工作空间归属当前身份时保留不清空', async () => {
    const session = makeSession({ isAuthenticated: true, user: { id: 'user-001' } })
    const workspace = makeWorkspace({ hasWorkspace: true, currentUserId: 'user-001' })

    await runNavigationGuard(makeTarget(), session, workspace, mockResolve('/me'))

    expect(workspace.clearWorkspace).not.toHaveBeenCalled()
  })
})

describe('runNavigationGuard 根路径落点', () => {
  it('未登录时先加载会话，仍未认证则跳转登录页', async () => {
    const session = makeSession({ isAuthenticated: false })
    const workspace = makeWorkspace()

    const decision = await runNavigationGuard(
      makeTarget({ path: '/', fullPath: '/', name: 'P-GEN-00-root' }),
      session,
      workspace,
      mockResolve('/me'),
    )

    expect(session.loadSession).toHaveBeenCalledTimes(1)
    expect(decision).toEqual({ name: 'P-IDN-01' })
  })

  it('已登录且已认证：resolveLoginTarget 返回个人中心', async () => {
    const session = makeSession({ isAuthenticated: true, user: { id: 'u1' } })
    const resolve = mockResolve('/me')

    const decision = await runNavigationGuard(
      makeTarget({ path: '/', fullPath: '/', name: 'P-GEN-00-root' }),
      session,
      makeWorkspace(),
      resolve,
    )

    expect(decision).toEqual({ name: 'P-IDN-03' })
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({ workspace: null, requestedRedirect: null, needsProfileGate: false }),
    )
  })

  it('resolveLoginTarget 返回平台管理首页时映射到 P-ORG-01', async () => {
    const session = makeSession({
      isAuthenticated: true,
      user: { id: 'u1' },
      hasPermission: (p) => p === 'platform:club:manage',
    })

    const decision = await runNavigationGuard(
      makeTarget({ path: '/', fullPath: '/', name: 'P-GEN-00-root' }),
      session,
      makeWorkspace(),
      mockResolve('/admin/clubs'),
    )

    expect(decision).toEqual({ name: 'P-ORG-01' })
  })

  it('resolveLoginTarget 返回资料门禁页时映射到 P-GEN-04', async () => {
    const session = makeSession({ isAuthenticated: true, user: { id: 'u1' }, needsProfileGate: true })

    const decision = await runNavigationGuard(
      makeTarget({ path: '/', fullPath: '/', name: 'P-GEN-00-root' }),
      session,
      makeWorkspace(),
      mockResolve('/me/profile/required'),
    )

    expect(decision).toEqual({ name: 'P-GEN-04' })
  })

  it('resolveLoginTarget 返回社团工作空间时按 path 跳转', async () => {
    const session = makeSession({ isAuthenticated: true, user: { id: 'u1' } })

    const decision = await runNavigationGuard(
      makeTarget({ path: '/', fullPath: '/', name: 'P-GEN-00-root' }),
      session,
      makeWorkspace(),
      mockResolve('/org/club-001/dashboard'),
    )

    expect(decision).toEqual({ path: '/org/club-001/dashboard' })
  })

  it('store 上下文优先于 session.workspace：切到 club-002 后按新社团解析落点', async () => {
    const session = makeSession({
      isAuthenticated: true,
      user: { id: 'u1' },
      workspace: { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' },
    })
    const workspace = makeWorkspace({
      hasWorkspace: true,
      currentUserId: 'u1',
      currentClubId: 'club-002',
      hasPermission: (p) => p === 'club:dashboard:view',
    })
    const resolve = mockResolve('/org/club-002/dashboard')

    const decision = await runNavigationGuard(
      makeTarget({ path: '/', fullPath: '/', name: 'P-GEN-00-root' }),
      session,
      workspace,
      resolve,
    )

    expect(decision).toEqual({ path: '/org/club-002/dashboard' })
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ workspace: { clubId: 'club-002' } }))
  })

  it('store 上下文命中但落点兜底 /me：hasPermission 走 workspace 版，决策回退 P-IDN-03', async () => {
    const session = makeSession({
      isAuthenticated: true,
      user: { id: 'u1' },
      workspace: { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' },
      // 会话级权限不含看板权限；若误用 session.hasPermission 则无法解析出 org 落点
      hasPermission: () => false,
    })
    const workspacePermission = vi.fn((p: string) => p === 'club:dashboard:view')
    const workspace = makeWorkspace({
      hasWorkspace: true,
      currentUserId: 'u1',
      currentClubId: 'club-002',
      hasPermission: workspacePermission,
    })
    // workspace 看板权限命中 → 真实 resolveLoginTarget 返回 /org/club-002/dashboard
    const decision = await runNavigationGuard(
      makeTarget({ path: '/', fullPath: '/', name: 'P-GEN-00-root' }),
      session,
      workspace,
      resolveLoginTarget,
    )

    expect(decision).toEqual({ path: '/org/club-002/dashboard' })
    // hasPermission 确实使用 workspace 版（store 上下文优先），而非 session 版
    expect(workspacePermission).toHaveBeenCalledWith('club:dashboard:view')
  })

  it('store 上下文命中但无看板权限：resolveLoginTarget 兜底 /me，决策回退 P-IDN-03', async () => {
    const session = makeSession({
      isAuthenticated: true,
      user: { id: 'u1' },
      workspace: { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' },
      hasPermission: () => false,
    })
    const workspace = makeWorkspace({
      hasWorkspace: true,
      currentUserId: 'u1',
      currentClubId: 'club-002',
      hasPermission: () => false,
    })

    const decision = await runNavigationGuard(
      makeTarget({ path: '/', fullPath: '/', name: 'P-GEN-00-root' }),
      session,
      workspace,
      resolveLoginTarget,
    )

    expect(decision).toEqual({ name: 'P-IDN-03' })
  })
})

describe('runNavigationGuard 公开路由', () => {
  it('公开路由未登录直接放行，不触发 loadSession', async () => {
    const session = makeSession({ isAuthenticated: false })
    const workspace = makeWorkspace()

    const decision = await runNavigationGuard(
      makeTarget({ path: '/login', name: 'P-IDN-01', meta: { public: true } }),
      session,
      workspace,
      mockResolve('/me'),
    )

    expect(decision).toBe(true)
    expect(session.loadSession).not.toHaveBeenCalled()
  })
})

describe('runNavigationGuard 认证与资料门禁', () => {
  it('非公开路由未认证：加载会话后仍未认证则带 redirect 跳登录', async () => {
    const session = makeSession({ isAuthenticated: false })
    const workspace = makeWorkspace()

    const decision = await runNavigationGuard(
      makeTarget({ path: '/me', fullPath: '/me/history?tab=1' }),
      session,
      workspace,
      mockResolve('/me'),
    )

    expect(session.loadSession).toHaveBeenCalledTimes(1)
    expect(decision).toEqual({ name: 'P-IDN-01', query: { redirect: '/me/history?tab=1' } })
  })

  it('资料未完善时非豁免页一律重定向 P-GEN-04', async () => {
    const session = makeSession({ isAuthenticated: true, user: { id: 'u1' }, needsProfileGate: true })

    const decision = await runNavigationGuard(
      makeTarget({ path: '/me', name: 'P-IDN-03' }),
      session,
      makeWorkspace(),
      mockResolve('/me'),
    )

    expect(decision).toEqual({ name: 'P-GEN-04' })
  })

  it('资料未完善时豁免页放行（资料页/门禁页本身）', async () => {
    const session = makeSession({ isAuthenticated: true, user: { id: 'u1' }, needsProfileGate: true })

    for (const name of ['P-GEN-04', 'P-IDN-02', 'P-IDN-02-edit', 'P-IDN-02-sync-conflict']) {
      const decision = await runNavigationGuard(
        makeTarget({ path: '/x', name }),
        session,
        makeWorkspace(),
        mockResolve('/me'),
      )
      expect(decision).toBe(true)
    }
  })
})

describe('runNavigationGuard admin 权限链', () => {
  it('无平台权限时跳转 P-GEN-02', async () => {
    const session = makeSession({ isAuthenticated: true, user: { id: 'u1' }, hasPermission: () => false })

    const decision = await runNavigationGuard(
      makeTarget({ path: '/admin/clubs', name: 'P-ORG-01', meta: { requiresAdmin: true } }),
      session,
      makeWorkspace(),
      mockResolve('/me'),
    )

    expect(decision).toEqual({ name: 'P-GEN-02' })
  })

  it('路由无权限映射时保守拒绝（新增 admin 路由未登记映射）', async () => {
    const session = makeSession({ isAuthenticated: true, user: { id: 'u1' }, hasPermission: () => true })

    const decision = await runNavigationGuard(
      makeTarget({ path: '/admin/ghost', name: 'P-XYZ-99', meta: { requiresAdmin: true } }),
      session,
      makeWorkspace(),
      mockResolve('/me'),
    )

    expect(decision).toEqual({ name: 'P-GEN-02' })
  })

  it('持有平台权限时放行', async () => {
    const session = makeSession({
      isAuthenticated: true,
      user: { id: 'u1' },
      hasPermission: (p) => p === 'platform:club:manage',
    })

    const decision = await runNavigationGuard(
      makeTarget({ path: '/admin/clubs', name: 'P-ORG-01', meta: { requiresAdmin: true } }),
      session,
      makeWorkspace(),
      mockResolve('/me'),
    )

    expect(decision).toBe(true)
  })
})

describe('runNavigationGuard workspace 权限链', () => {
  it('缺少 clubId（非法路径）时跳转 P-GEN-02 且不发起加载', async () => {
    const session = makeSession({ isAuthenticated: true, user: { id: 'u1' } })
    const workspace = makeWorkspace()

    const decision = await runNavigationGuard(
      makeTarget({ path: '/org//x', name: 'P-ORG-02', meta: { requiresWorkspace: true }, params: {} }),
      session,
      workspace,
      mockResolve('/me'),
    )

    expect(decision).toEqual({ name: 'P-GEN-02' })
    expect(workspace.loadWorkspace).not.toHaveBeenCalled()
  })

  it('路由无 workspace 权限映射时保守拒绝', async () => {
    const session = makeSession({ isAuthenticated: true, user: { id: 'u1' } })
    const workspace = makeWorkspace()

    const decision = await runNavigationGuard(
      makeTarget({
        path: '/org/c1/ghost',
        name: 'P-GHOST-01',
        meta: { requiresWorkspace: true },
        params: { clubId: 'c1' },
      }),
      session,
      workspace,
      mockResolve('/me'),
    )

    expect(decision).toEqual({ name: 'P-GEN-02' })
    expect(workspace.loadWorkspace).not.toHaveBeenCalled()
  })

  it('loadWorkspace 失败（社团加载不到）时跳转 P-GEN-02', async () => {
    const session = makeSession({ isAuthenticated: true, user: { id: 'u1' } })
    const workspace = makeWorkspace({ loadWorkspace: vi.fn(async () => false) })

    const decision = await runNavigationGuard(
      makeTarget({
        path: '/org/c1/dashboard',
        name: 'P-ORG-02',
        meta: { requiresWorkspace: true },
        params: { clubId: 'c1' },
      }),
      session,
      workspace,
      mockResolve('/me'),
    )

    expect(workspace.loadWorkspace).toHaveBeenCalledWith('c1')
    expect(decision).toEqual({ name: 'P-GEN-02' })
  })

  it('单权限不满足时跳转 P-GEN-02', async () => {
    const session = makeSession({ isAuthenticated: true, user: { id: 'u1' } })
    const workspace = makeWorkspace({ hasPermission: () => false })

    const decision = await runNavigationGuard(
      makeTarget({
        path: '/org/c1/dashboard',
        name: 'P-ORG-02',
        meta: { requiresWorkspace: true },
        params: { clubId: 'c1' },
      }),
      session,
      workspace,
      mockResolve('/me'),
    )

    expect(decision).toEqual({ name: 'P-GEN-02' })
  })

  it('多权限任一命中即可放行（面试职能）', async () => {
    const session = makeSession({ isAuthenticated: true, user: { id: 'u1' } })
    const workspace = makeWorkspace({ hasPermission: (p) => p === 'club:interview:evaluate' })

    const decision = await runNavigationGuard(
      makeTarget({
        path: '/org/c1/recruitment',
        name: 'P-REC-list',
        meta: { requiresWorkspace: true },
        params: { clubId: 'c1' },
      }),
      session,
      workspace,
      mockResolve('/me'),
    )

    expect(decision).toBe(true)
  })

  it('workspace 权限满足时放行', async () => {
    const session = makeSession({ isAuthenticated: true, user: { id: 'u1' } })
    const workspace = makeWorkspace({ hasPermission: (p) => p === 'club:dashboard:view' })

    const decision = await runNavigationGuard(
      makeTarget({
        path: '/org/c1/dashboard',
        name: 'P-ORG-02',
        meta: { requiresWorkspace: true },
        params: { clubId: 'c1' },
      }),
      session,
      workspace,
      mockResolve('/me'),
    )

    expect(decision).toBe(true)
  })
})

describe('runNavigationGuard 非工作空间页面上下文同步', () => {
  it('会话有工作空间且 store 未加载时按会话初始化', async () => {
    const session = makeSession({
      isAuthenticated: true,
      user: { id: 'u1' },
      workspace: { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader', memberId: 'mem-001' },
      permissions: ['club:member:view-self'],
    })
    const workspace = makeWorkspace()

    await runNavigationGuard(makeTarget({ path: '/me', name: 'P-IDN-03' }), session, workspace, mockResolve('/me'))

    expect(workspace.setWorkspace).toHaveBeenCalledWith(
      'club-001',
      '计算机协会',
      'club_leader',
      ['club:member:view-self'],
      'u1',
      'mem-001',
    )
  })

  it('会话有工作空间但 store 归属上一身份时重新初始化', async () => {
    const session = makeSession({
      isAuthenticated: true,
      user: { id: 'u2' },
      workspace: { clubId: 'club-001', clubName: '计算机协会', role: 'member' },
    })
    const workspace = makeWorkspace({ hasWorkspace: true, currentUserId: 'u1' })

    await runNavigationGuard(makeTarget({ path: '/me', name: 'P-IDN-03' }), session, workspace, mockResolve('/me'))

    expect(workspace.setWorkspace).toHaveBeenCalledTimes(1)
  })

  it('store 归属当前身份时保留最近访问的社团上下文，不重置', async () => {
    const session = makeSession({
      isAuthenticated: true,
      user: { id: 'u1' },
      workspace: { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' },
    })
    const workspace = makeWorkspace({ hasWorkspace: true, currentUserId: 'u1' })

    await runNavigationGuard(makeTarget({ path: '/me', name: 'P-IDN-03' }), session, workspace, mockResolve('/me'))

    expect(workspace.setWorkspace).not.toHaveBeenCalled()
  })

  it('会话无工作空间时不写上下文', async () => {
    const session = makeSession({ isAuthenticated: true, user: { id: 'u1' }, workspace: null })
    const workspace = makeWorkspace()

    await runNavigationGuard(makeTarget({ path: '/me', name: 'P-IDN-03' }), session, workspace, mockResolve('/me'))

    expect(workspace.setWorkspace).not.toHaveBeenCalled()
  })
})
