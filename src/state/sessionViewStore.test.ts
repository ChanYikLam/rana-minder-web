import { describe, expect, it, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSessionViewStore } from './sessionViewStore'
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

  it('setWorkspaceInfo 合并保留 memberId：切换社团不丢失自审身份', () => {
    const session = seedLoggedInUser()
    session.workspace = { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader', memberId: 'mem-004' }

    // ClubSwitcher 切换 club-002：getMyClubs/getContext 不含 memberId，不得整体覆盖
    session.setWorkspaceInfo({ clubId: 'club-002', clubName: '网络协会', role: 'hr' })

    expect(session.workspace).toEqual({
      clubId: 'club-002',
      clubName: '网络协会',
      role: 'hr',
      memberId: 'mem-004',
    })
  })

  it('setWorkspaceInfo 传入 memberId 时以新值为准', () => {
    const session = seedLoggedInUser()
    session.workspace = { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader', memberId: 'mem-004' }

    session.setWorkspaceInfo({ clubId: 'club-002', clubName: '网络协会', role: 'hr', memberId: 'mem-020' })

    expect(session.workspace?.memberId).toBe('mem-020')
  })

  it('setPermissions 按新社团上下文刷新会话级权限', () => {
    const session = seedLoggedInUser()
    session.permissions = ['club:dashboard:view', 'club:member:manage']

    session.setPermissions(['club:member:view-self'])

    expect(session.permissions).toEqual(['club:member:view-self'])
    expect(session.hasPermission('club:member:manage')).toBe(false)
    expect(session.hasPermission('club:member:view-self')).toBe(true)
  })
})
