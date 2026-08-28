import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSessionViewStore, mergeClubPermissions } from './sessionViewStore'
import { useNotificationViewStore } from './notificationViewStore'
import type { User } from '@/types/domain'
import { getSession, logout as logoutAuth } from '@/services/auth'

vi.mock('@/services/auth', () => ({
  getSession: vi.fn(),
  logout: vi.fn(),
}))

function seedLoggedInUser(id: string = 'user-leader-001') {
  const session = useSessionViewStore()
  session.user = {
    id,
    studentId: '20210002',
    name: '张明远',
    email: 'leader@example.edu.cn',
    phone: '13800000002',
    avatar: null,
    emailVerified: true,
    profileComplete: true,
  } as User
  return session
}

describe('sessionViewStore 工作空间与权限同步（社团切换）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('setWorkspaceInfo 未传 memberId（新社团无成员身份）时显式置空，不沿用上一社团的自审身份', () => {
    const session = seedLoggedInUser()
    session.workspace = { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader', memberId: 'mem-004' }

    // ClubSwitcher 切到 club-002（getContext 返回 memberId=null）：不得保留 club-001 的 mem-004
    session.setWorkspaceInfo({ clubId: 'club-002', clubName: '电子设计协会', role: 'hr', memberId: undefined })

    expect(session.workspace?.clubId).toBe('club-002')
    expect(session.workspace?.memberId).toBeUndefined()
  })

  it('setWorkspaceInfo 传入 memberId 时以新值为准（多社团用户在新社团有成员身份）', () => {
    const session = seedLoggedInUser()
    session.workspace = { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader', memberId: 'mem-004' }

    session.setWorkspaceInfo({ clubId: 'club-002', clubName: '电子设计协会', role: 'hr', memberId: 'mem-020' })

    expect(session.workspace?.memberId).toBe('mem-020')
  })

  it('setPermissions 按新社团上下文刷新 club:* 域，但保留 platform:* 等全局权限', () => {
    const session = seedLoggedInUser()
    session.permissions = ['club:dashboard:view', 'club:member:manage', 'platform:club:manage']

    // 平台管理员兼任社团成员：切换社团后 platform:* 不得被抹掉
    session.setPermissions(mergeClubPermissions(session.permissions, ['club:member:view-self']))

    expect(session.permissions).toEqual(['platform:club:manage', 'club:member:view-self'])
    expect(session.hasPermission('club:member:manage')).toBe(false)
    expect(session.hasPermission('club:member:view-self')).toBe(true)
    expect(session.hasPermission('platform:club:manage')).toBe(true)
  })
})

describe('sessionViewStore 会话加载（loadSession）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('completed 时写入完整会话状态并启动降级时钟', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-07T12:00:00Z'))
    const session = useSessionViewStore()
    vi.mocked(getSession).mockResolvedValue({
      kind: 'completed',
      data: {
        user: {
          id: 'user-leader-001',
          studentId: '20210002',
          name: '张明远',
          email: 'leader@example.edu.cn',
          phone: '13800000002',
          avatar: null,
          emailVerified: true,
          profileComplete: true,
        },
        profileGate: { complete: true, emailVerified: true },
        degraded: true,
        degradedSince: '2026-08-07T11:50:00Z',
        permissions: ['club:member:view-self', 'platform:club:manage'],
        workspace: { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader', memberId: 'mem-001' },
      },
    })

    await session.loadSession()

    expect(session.user?.id).toBe('user-leader-001')
    expect(session.profileGate).toEqual({ complete: true, emailVerified: true })
    expect(session.degraded).toBe(true)
    expect(session.degradedSince).toBe(new Date('2026-08-07T11:50:00Z').getTime())
    expect(session.permissions).toEqual(['club:member:view-self', 'platform:club:manage'])
    expect(session.workspace).toEqual({
      clubId: 'club-001',
      clubName: '计算机协会',
      role: 'club_leader',
      memberId: 'mem-001',
    })
    expect(session.lastLoadedAt).toBe(new Date('2026-08-07T12:00:00Z').getTime())
    expect(session.isAuthenticated).toBe(true)
    expect(session.isProfileComplete).toBe(true)
    expect(session.needsProfileGate).toBe(false)

    // 降级会话已启动 30s 秒级时钟：推进一个 tick 后剩余窗口开始减少
    vi.advanceTimersByTime(30 * 1000)
    expect(session.degradedWindowRemainingMs).toBeLessThan(10 * 60 * 1000)
    vi.useRealTimers()
  })

  it('profileGate 未完成时 needsProfileGate 为 true', async () => {
    const session = useSessionViewStore()
    session.user = { id: 'u1', profileComplete: false, emailVerified: true } as User
    session.profileGate = { complete: false, emailVerified: true }
    expect(session.isProfileComplete).toBe(false)
    expect(session.needsProfileGate).toBe(true)
  })

  it('非 completed（rejected）时清空既有会话，且失败原因可透出（P2-1：先清空再写 lastError）', async () => {
    const session = seedLoggedInUser()
    session.workspace = { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }
    vi.mocked(getSession).mockResolvedValue({
      kind: 'rejected',
      error: { code: 'AUTH-MOCK-NOT-SELECTED', message: '请先选择 Mock 登录身份' },
    })

    await session.loadSession()

    expect(session.user).toBeNull()
    expect(session.isAuthenticated).toBe(false)
    expect(session.workspace).toBeNull()
    expect(session.permissions).toEqual([])
    expect(session.loading).toBe(false)
    // 会话已清空，但失败原因保留供登录页透出（禁止被 clearSession 重置）
    expect(session.lastError).toBe('请先选择 Mock 登录身份')
  })

  it('禁用账号：session 拒绝后 lastError 保留禁用文案（登录页提示链路可达）', async () => {
    const session = useSessionViewStore()
    vi.mocked(getSession).mockResolvedValue({
      kind: 'rejected',
      error: { code: 'IFC-ERR-011', message: '账号已被禁用，请联系平台管理员' },
    })

    await session.loadSession()

    expect(session.isAuthenticated).toBe(false)
    expect(session.lastError).toBe('账号已被禁用，请联系平台管理员')
  })

  it('getSession 抛出异常时 loading 复位且状态不受污染', async () => {
    const session = seedLoggedInUser()
    vi.mocked(getSession).mockRejectedValue(new Error('network down'))

    await expect(session.loadSession()).rejects.toThrow('network down')

    expect(session.loading).toBe(false)
    expect(session.user?.id).toBe('user-leader-001')
  })

  it('degraded 且无 degradedSince 时回退当前时间作为降级起点', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-07T12:00:00Z'))
    const session = useSessionViewStore()
    vi.mocked(getSession).mockResolvedValue({
      kind: 'completed',
      data: {
        user: { id: 'u1' } as User,
        profileGate: { complete: true, emailVerified: true },
        degraded: true,
        degradedSince: null,
        permissions: [],
        workspace: null,
      },
    })

    await session.loadSession()

    expect(session.degradedSince).toBe(new Date('2026-08-07T12:00:00Z').getTime())
    expect(session.inDegradedWindow).toBe(true)
    vi.useRealTimers()
  })

  it('降级恢复（degraded=false）时清空降级起点并停止窗口', async () => {
    const session = useSessionViewStore()
    session.degraded = true
    session.degradedSince = 123456
    vi.mocked(getSession).mockResolvedValue({
      kind: 'completed',
      data: {
        user: { id: 'u1' } as User,
        profileGate: { complete: true, emailVerified: true },
        degraded: false,
        permissions: [],
        workspace: null,
      },
    })

    await session.loadSession()

    expect(session.degraded).toBe(false)
    expect(session.degradedSince).toBeNull()
    expect(session.inDegradedWindow).toBe(false)
    expect(session.degradedWindowRemainingMs).toBe(0)
    expect(session.degradedWindowExpired).toBe(false)
  })
})

describe('sessionViewStore 降级白名单窗口状态机（SRS-FAIL-001）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-07T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function enterDegradedWindow(elapsedMs: number) {
    const now = new Date('2026-08-07T12:00:00Z')
    vi.setSystemTime(now)
    const session = useSessionViewStore()
    vi.mocked(getSession).mockResolvedValue({
      kind: 'completed',
      data: {
        user: { id: 'u1' } as User,
        profileGate: { complete: true, emailVerified: true },
        degraded: true,
        degradedSince: new Date(now.getTime() - elapsedMs).toISOString(),
        permissions: [],
        workspace: null,
      },
    })
    await session.loadSession()
    return session
  }

  it('未降级或起点缺失时窗口计算一律为关闭态', () => {
    const session = useSessionViewStore()
    session.degraded = true
    session.degradedSince = null
    expect(session.inDegradedWindow).toBe(false)
    expect(session.degradedWindowRemainingMs).toBe(0)
    expect(session.degradedWindowExpired).toBe(false)

    const clean = useSessionViewStore()
    expect(clean.inDegradedWindow).toBe(false)
    expect(clean.degradedWindowRemainingMs).toBe(0)
    expect(clean.degradedWindowExpired).toBe(false)
  })

  it('窗口内：剩余时间随时钟递减，过期标志为 false', async () => {
    const session = await enterDegradedWindow(5 * 60 * 1000)

    expect(session.inDegradedWindow).toBe(true)
    expect(session.degradedWindowRemainingMs).toBe(10 * 60 * 1000)
    expect(session.degradedWindowExpired).toBe(false)

    // 秒级时钟驱动 2 分钟
    vi.advanceTimersByTime(2 * 60 * 1000)
    expect(session.degradedWindowRemainingMs).toBe(8 * 60 * 1000)
  })

  it('时钟越过 15 分钟边界后窗口过期', async () => {
    const session = await enterDegradedWindow(5 * 60 * 1000)

    vi.advanceTimersByTime(10 * 60 * 1000 + 1)

    expect(session.inDegradedWindow).toBe(false)
    expect(session.degradedWindowRemainingMs).toBe(0)
    expect(session.degradedWindowExpired).toBe(true)
  })
})

describe('sessionViewStore 会话清理与登出', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('clearSession 重置全部会话状态', () => {
    const session = seedLoggedInUser()
    session.profileGate = { complete: true, emailVerified: true }
    session.degraded = true
    session.degradedSince = 123456
    session.permissions = ['club:member:view-self']
    session.workspace = { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }
    session.lastLoadedAt = 999

    session.clearSession()

    expect(session.user).toBeNull()
    expect(session.profileGate).toEqual({ complete: false, emailVerified: false })
    expect(session.degraded).toBe(false)
    expect(session.degradedSince).toBeNull()
    expect(session.permissions).toEqual([])
    expect(session.workspace).toBeNull()
    expect(session.lastLoadedAt).toBeNull()
    expect(session.isAuthenticated).toBe(false)
  })

  it('P2-16：clearSession 联动清空通知视图（未读数/列表/loading）', () => {
    const session = seedLoggedInUser()
    const notifications = useNotificationViewStore()
    notifications.unreadCount = 5
    notifications.items = [{ id: 'n-1', type: 'info', title: 't', body: 'b', read: false, createdAt: '2026-08-07T04:00:00Z', link: null, clubName: null }]
    notifications.loading = true

    session.clearSession()

    expect(notifications.unreadCount).toBe(0)
    expect(notifications.items).toEqual([])
    expect(notifications.loading).toBe(false)
    expect(notifications.hasUnread).toBe(false)
  })

  it('logout 成功时调用认证登出并清空会话', async () => {
    const session = seedLoggedInUser()
    // logout 现返回 endSessionUrl（RP-initiated）；null 表示无上游登出地址
    vi.mocked(logoutAuth).mockResolvedValue(null)

    await session.logout()

    expect(logoutAuth).toHaveBeenCalledTimes(1)
    expect(session.user).toBeNull()
    expect(session.isAuthenticated).toBe(false)
  })

  it('logout 失败时仍清空会话（finally 语义）并向上传播异常', async () => {
    const session = seedLoggedInUser()
    vi.mocked(logoutAuth).mockRejectedValue(new Error('oidc down'))

    await expect(session.logout()).rejects.toThrow('oidc down')

    expect(session.user).toBeNull()
    expect(session.isAuthenticated).toBe(false)
  })
})
