import { describe, expect, it, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSessionViewStore, mergeClubPermissions } from './sessionViewStore'
import type { User } from '@/types/domain'

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
    session.setWorkspaceInfo({ clubId: 'club-002', clubName: '网络协会', role: 'hr', memberId: undefined })

    expect(session.workspace?.clubId).toBe('club-002')
    expect(session.workspace?.memberId).toBeUndefined()
  })

  it('setWorkspaceInfo 传入 memberId 时以新值为准（多社团用户在新社团有成员身份）', () => {
    const session = seedLoggedInUser()
    session.workspace = { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader', memberId: 'mem-004' }

    session.setWorkspaceInfo({ clubId: 'club-002', clubName: '网络协会', role: 'hr', memberId: 'mem-020' })

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
