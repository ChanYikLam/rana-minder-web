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

function ctxResult(role: 'club_leader' | 'member') {
  return {
    kind: 'completed' as const,
    data: {
      clubId: 'club-001',
      clubName: '计算机协会',
      role,
      permissions: role === 'club_leader' ? ['club:dashboard:view', 'club:member:manage'] : ['club:member:view-self'],
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
})
