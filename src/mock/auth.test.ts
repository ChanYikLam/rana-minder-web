import { describe, expect, it, beforeEach } from 'vitest'
import { resolveMockUser, clearMockSession, getActiveMockUser } from './auth'

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
