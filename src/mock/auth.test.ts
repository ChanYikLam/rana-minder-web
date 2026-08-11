import { describe, expect, it, beforeEach } from 'vitest'
import { resolveMockUser, clearMockSession, getActiveMockUser, getPermissions, getDemoRoles, mockUsers } from './auth'
import type { MockUser } from './auth'

describe('mock 登录角色解析（自锚定）', () => {
  beforeEach(() => {
    clearMockSession()
  })

  it('带 _mock_user 参数的请求会锚定该角色', () => {
    const user = resolveMockUser('/api/auth/session?_mock_user=member')
    expect(user.id).toBe('user-member-001')
    expect(getActiveMockUser()?.id).toBe('user-member-001')
  })

  it('锚定后，不带参数的请求解析到同一登录角色（回归：此前恒为 leader）', () => {
    resolveMockUser('/api/auth/session?_mock_user=deptleader')
    const data = resolveMockUser('/api/org/club-001/dashboard')
    expect(data.id).toBe('user-deptleader-001')
    expect(getActiveMockUser()?.id).toBe('user-deptleader-001')
  })

  it('无效的 _mock_user 参数不改变当前角色', () => {
    resolveMockUser('/api/auth/session?_mock_user=member')
    resolveMockUser('/api/org/club-001/dashboard?_mock_user=nonexistent')
    expect(getActiveMockUser()?.id).toBe('user-member-001')
  })

  it('clearMockSession 后无参请求回落为默认 leader', () => {
    resolveMockUser('/api/auth/session?_mock_user=hr')
    clearMockSession()
    expect(getActiveMockUser()).toBeNull()
    expect(resolveMockUser('/api/org/club-001/dashboard').id).toBe('user-leader-001')
  })
})

describe('平台管理员权限位（admin 域端点鉴权前提）', () => {
  beforeEach(() => {
    clearMockSession()
  })

  it('admin 用户拥有平台管理权限位（platform:delete:execute）', () => {
    resolveMockUser('/api/admin/clubs?_mock_user=admin')
    expect(getPermissions(resolveMockUser('/api/admin/clubs'), '').includes('platform:delete:execute')).toBe(true)
  })

  it('普通成员/社团负责人无平台管理权限位（admin 端点应返回 403）', () => {
    resolveMockUser('/api/admin/clubs?_mock_user=member')
    expect(getPermissions(resolveMockUser('/api/admin/clubs'), '').includes('platform:delete:execute')).toBe(false)
    resolveMockUser('/api/admin/clubs?_mock_user=leader')
    expect(getPermissions(resolveMockUser('/api/admin/clubs'), '').includes('platform:delete:execute')).toBe(false)
  })
})

describe('MRM-022：getDemoRoles 动态读取运行期 mockUsers（非模块加载快照）', () => {
  beforeEach(() => {
    clearMockSession()
  })

  it('getDemoRoles 返回当前 mockUsers 的完整身份目录', () => {
    const roles = getDemoRoles()
    expect(roles.some((r) => r.key === 'leader')).toBe(true)
    expect(roles.some((r) => r.key === 'incomplete')).toBe(true)
    expect(roles.find((r) => r.key === 'leader')?.role).toBe('club_leader')
  })

  it('运行期替换 mockUsers 后 getDemoRoles 反映新状态（修复前为加载时快照，不更新）', () => {
    const before = getDemoRoles().length
    // 模拟运行期新增演示身份：写回 mockUsers 后，getDemoRoles 应随调用时读取到新身份
    ;(mockUsers as Record<string, MockUser>)['extra-demo'] = {
      ...mockUsers.member,
      id: 'user-extra-001',
      currentClubId: 'club-001',
    }
    try {
      const roles = getDemoRoles()
      expect(roles.length).toBe(before + 1)
      expect(roles.some((r) => r.key === 'extra-demo')).toBe(true)
    } finally {
      delete (mockUsers as Record<string, MockUser>)['extra-demo']
    }
  })
})
