import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWorkspaceContextStore } from './workspaceContextStore'
import { useSessionViewStore } from './sessionViewStore'
import type { User } from '@/types/domain'

vi.mock('@/services', () => ({
  organizationApi: {
    getContext: vi.fn(),
  },
}))

import { organizationApi } from '@/services'
const mockedGetContext = vi.mocked(organizationApi.getContext)

function seedUser(id: string) {
  const session = useSessionViewStore()
  session.user = {
    id,
    studentId: 's',
    name: 'n',
    email: 'n@example.edu.cn',
    phone: '',
    avatar: null,
    emailVerified: true,
    profileComplete: true,
  } as User
}

function ctxResult(role: 'club_leader' | 'member', memberId: string | null = null) {
  return {
    kind: 'completed' as const,
    data: {
      clubId: 'club-001',
      clubName: '计算机协会',
      role,
      permissions: role === 'club_leader' ? ['club:dashboard:view', 'club:member:manage'] : ['club:member:view-self'],
      memberId,
    },
  }
}

describe('workspaceContextStore 工作空间缓存（按用户身份）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('同一用户同一社团命中缓存，不重复请求', async () => {
    mockedGetContext.mockResolvedValue(ctxResult('club_leader') as never)
    seedUser('u-leader')
    const store = useWorkspaceContextStore()

    await store.loadWorkspace('club-001')
    await store.loadWorkspace('club-001')

    expect(mockedGetContext).toHaveBeenCalledTimes(1)
    expect(store.currentRole).toBe('club_leader')
  })

  it('登录身份变化后（同社团）缓存失效，重新拉取并覆盖角色与权限', async () => {
    mockedGetContext
      .mockResolvedValueOnce(ctxResult('club_leader') as never)
      .mockResolvedValueOnce(ctxResult('member') as never)
    seedUser('u-leader')
    const store = useWorkspaceContextStore()

    await store.loadWorkspace('club-001')
    expect(store.currentRole).toBe('club_leader')
    expect(store.currentPermissions).toContain('club:member:manage')

    // 同一 SPA 生命周期内切换到普通成员身份（不退出登录）
    seedUser('u-member')
    const ok = await store.loadWorkspace('club-001')

    expect(ok).toBe(true)
    expect(mockedGetContext).toHaveBeenCalledTimes(2)
    expect(store.currentRole).toBe('member')
    expect(store.currentPermissions).toEqual(['club:member:view-self'])
    expect(store.hasPermission('club:dashboard:view')).toBe(false)
  })

  it('会话未初始化（session.user 为 null）时不得命中缓存，强制重新拉取', async () => {
    mockedGetContext.mockResolvedValue(ctxResult('member') as never)
    seedUser('u-leader')
    const store = useWorkspaceContextStore()

    await store.loadWorkspace('club-001')
    expect(mockedGetContext).toHaveBeenCalledTimes(1)

    // 会话被清空（未初始化），但缓存仍残留上一身份 → 不得命中缓存返回旧上下文
    useSessionViewStore().user = null
    const ok = await store.loadWorkspace('club-001')

    expect(ok).toBe(true)
    expect(mockedGetContext).toHaveBeenCalledTimes(2)
  })

  it('context 返回 memberId 时写入 currentMemberId（社团切换后自审身份按新社团解析）', async () => {
    mockedGetContext.mockResolvedValue(ctxResult('club_leader', 'mem-101') as never)
    seedUser('u-leader')
    const store = useWorkspaceContextStore()

    await store.loadWorkspace('club-001')

    expect(store.currentMemberId).toBe('mem-101')
  })

  it('context 未返回 memberId 时 currentMemberId 为 null（不沿用上一社团成员 id）', async () => {
    mockedGetContext.mockResolvedValue(ctxResult('member') as never)
    seedUser('u-leader')
    const store = useWorkspaceContextStore()

    await store.loadWorkspace('club-001')

    expect(store.currentMemberId).toBeNull()
  })

  it('context 请求失败时清空工作空间并返回 false', async () => {
    mockedGetContext.mockResolvedValue({
      kind: 'rejected',
      error: { code: 'IFC-ERR-004', message: '工作空间不可访问' },
    } as never)
    seedUser('u-member')
    const store = useWorkspaceContextStore()

    const ok = await store.loadWorkspace('club-001')

    expect(ok).toBe(false)
    expect(store.hasWorkspace).toBe(false)
    expect(store.currentUserId).toBeNull()
  })

  it('syncWithSession：身份切换到无工作空间用户时清空上一身份残留上下文', async () => {
    mockedGetContext.mockResolvedValue(ctxResult('club_leader') as never)
    seedUser('u-leader')
    const store = useWorkspaceContextStore()

    await store.loadWorkspace('club-001')
    expect(store.hasWorkspace).toBe(true)
    expect(store.currentUserId).toBe('u-leader')

    // 新身份（申请人，无工作空间）→ 清空
    seedUser('u-applicant')
    store.syncWithSession(null, [], 'u-applicant')

    expect(store.hasWorkspace).toBe(false)
    expect(store.currentClubId).toBeNull()
    expect(store.currentUserId).toBeNull()
  })

  it('syncWithSession：同一身份且已有上下文时不重置（保留最近访问的社团上下文）', async () => {
    mockedGetContext.mockResolvedValue(ctxResult('club_leader') as never)
    seedUser('u-leader')
    const store = useWorkspaceContextStore()

    await store.loadWorkspace('club-001')
    // 同一身份再次进入非工作空间页：上下文保持 club-001 不变
    store.syncWithSession({ clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }, ['club:dashboard:view'], 'u-leader')

    expect(store.currentClubId).toBe('club-001')
    expect(store.currentRole).toBe('club_leader')
    expect(store.currentUserId).toBe('u-leader')
  })

  it('syncWithSession：身份切换为新身份（有工作空间）时按会话初始化上下文', async () => {
    mockedGetContext.mockResolvedValue(ctxResult('club_leader') as never)
    seedUser('u-leader')
    const store = useWorkspaceContextStore()

    await store.loadWorkspace('club-001')

    // 新身份 → 有工作空间：按会话初始化（角色/权限/归属用户一并覆盖）
    seedUser('u-member')
    store.syncWithSession(
      { clubId: 'club-001', clubName: '计算机协会', role: 'member' },
      ['club:member:view-self'],
      'u-member',
    )

    expect(store.currentClubId).toBe('club-001')
    expect(store.currentRole).toBe('member')
    expect(store.currentPermissions).toEqual(['club:member:view-self'])
    expect(store.currentUserId).toBe('u-member')
  })
})

describe('workspaceContextStore M-2 工作空间加载并发防护', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // 工具：构造一个可手动 resolve 的 promise，挂起 mock 调用
  function pendingDeferred() {
    let resolve!: (v: unknown) => void
    const promise = new Promise((r) => { resolve = r })
    return { promise, resolve }
  }

  function ctxFor(clubId: string, clubName: string, role: 'club_leader' | 'member', memberId: string | null = null) {
    return {
      kind: 'completed' as const,
      data: {
        clubId,
        clubName,
        role,
        permissions: role === 'club_leader' ? ['club:dashboard:view', 'club:member:manage'] : ['club:member:view-self'],
        memberId,
      },
    }
  }

  it('M-2：后发请求先返回时,旧请求结果不得覆盖新请求上下文（代次校验）', async () => {
    // A 挂起（晚返回），B 立即成功（早返回）
    const a = pendingDeferred()
    mockedGetContext
      .mockReturnValueOnce(a.promise as never)
      .mockResolvedValueOnce(ctxFor('club-002', '电子设计协会', 'member', 'mem-B') as never)

    seedUser('u-leader')
    const store = useWorkspaceContextStore()

    // 不 await：两个请求同时在飞
    const pA = store.loadWorkspace('club-001')
    const pB = store.loadWorkspace('club-002')

    // B 先 resolve：等待其 microtask 完成
    await flushMicrotasks()
    // 此时 A 仍未 resolve
    expect(store.currentClubId).toBe('club-002')
    expect(store.currentMemberId).toBe('mem-B')

    // A 此时才 resolve（晚到）——其结果必须被丢弃
    a.resolve(ctxFor('club-001', '计算机协会', 'club_leader', 'mem-A'))
    const [rA, rB] = await Promise.all([pA, pB])

    expect(rA).toBe(false) // 旧请求被识别为过期,返回 false
    expect(rB).toBe(true)
    // store 最终状态必须保持 B（不被 A 覆盖）
    expect(store.currentClubId).toBe('club-002')
    expect(store.currentClubName).toBe('电子设计协会')
    expect(store.currentMemberId).toBe('mem-B')
    expect(store.currentRole).toBe('member')
  })

  it('M-2：同 clubId 并发请求仅触发一次 API 调用（in-flight 去重）', async () => {
    const a = pendingDeferred()
    mockedGetContext.mockReturnValueOnce(a.promise as never)

    seedUser('u-leader')
    const store = useWorkspaceContextStore()

    // 同一 clubId 的三次并发请求
    const p1 = store.loadWorkspace('club-001')
    const p2 = store.loadWorkspace('club-001')
    const p3 = store.loadWorkspace('club-001')

    // 仅触发一次 API 调用
    expect(mockedGetContext).toHaveBeenCalledTimes(1)

    a.resolve(ctxFor('club-001', '计算机协会', 'club_leader', 'mem-1'))
    const [r1, r2, r3] = await Promise.all([p1, p2, p3])

    expect(r1).toBe(true)
    expect(r2).toBe(true)
    expect(r3).toBe(true)
    expect(mockedGetContext).toHaveBeenCalledTimes(1)
    expect(store.currentMemberId).toBe('mem-1')
  })

  it('M-2：旧请求失败时不得清空新请求已成功写入的上下文', async () => {
    // A 挂起, B 立即成功
    const a = pendingDeferred()
    mockedGetContext
      .mockReturnValueOnce(a.promise as never)
      .mockResolvedValueOnce(ctxFor('club-002', '电子设计协会', 'member', 'mem-B') as never)

    seedUser('u-leader')
    const store = useWorkspaceContextStore()

    const pA = store.loadWorkspace('club-001')
    const pB = store.loadWorkspace('club-002')

    // B 先完成, store 写入 B
    await pB
    expect(store.currentClubId).toBe('club-002')
    expect(store.currentMemberId).toBe('mem-B')

    // A 后失败（rejected）——其错误响应必须被丢弃,不得清空 B 的有效上下文
    a.resolve({ kind: 'rejected' as const, error: { code: 'IFC-ERR-016', message: 'x' } })
    await pA

    expect(store.hasWorkspace).toBe(true)
    expect(store.currentClubId).toBe('club-002')
    expect(store.currentMemberId).toBe('mem-B')
    expect(store.currentUserId).toBe('u-leader')
  })

  it('M-2：换账号（session.user.id 变化）时递增代次,在途旧请求结果不得写回', async () => {
    const old = pendingDeferred()
    mockedGetContext.mockReturnValueOnce(old.promise as never)

    seedUser('u-leader')
    const store = useWorkspaceContextStore()

    const pOld = store.loadWorkspace('club-001')
    expect(mockedGetContext).toHaveBeenCalledTimes(1)

    // 换账号：触发 store 内部 watcher 递增代次
    seedUser('u-member')
    await flushMicrotasks()

    // 旧账号请求此刻才完成, 返回旧数据
    old.resolve(ctxFor('club-001', '计算机协会', 'club_leader', 'mem-leader'))
    const r = await pOld

    // 旧请求过期, 返回 false 且不写回 store
    expect(r).toBe(false)
    expect(store.hasWorkspace).toBe(false)
    expect(store.currentClubId).toBeNull()
    expect(store.currentMemberId).toBeNull()
  })

  it('M-2：旧请求成功后,新请求的 loading 仍能正确复位（finally 代次保护）', async () => {
    const a = pendingDeferred()
    mockedGetContext
      .mockReturnValueOnce(a.promise as never)
      .mockResolvedValueOnce(ctxFor('club-002', '电子设计协会', 'member', 'mem-B') as never)

    seedUser('u-leader')
    const store = useWorkspaceContextStore()

    const pA = store.loadWorkspace('club-001')
    const pB = store.loadWorkspace('club-002')

    // 等待 B 完成
    await pB
    expect(store.loading).toBe(false) // B 是最新请求, 应复位 loading

    // A 晚完成（过期）, 其 finally 不得错误地把 loading 设为 false 又设回去
    a.resolve(ctxFor('club-001', '计算机协会', 'club_leader', 'mem-A'))
    await pA

    expect(store.loading).toBe(false)
    expect(store.currentClubId).toBe('club-002') // 仍为 B, 不被 A 覆盖
  })
})

// 测试工具：等待 microtask 队列（Vue/Promise 解锁）
async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
