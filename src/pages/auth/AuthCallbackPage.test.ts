import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { createPinia } from 'pinia'
import AuthCallbackPage from './AuthCallbackPage.vue'

vi.mock('@/services/auth', () => ({
  getSession: vi.fn(),
  logout: vi.fn(),
}))

import { getSession } from '@/services/auth'
import type { SessionInfo } from '@/types/domain'
import type { ApiResult } from '@/types/contracts'

const getSessionMock = vi.mocked(getSession)

function sessionFor(overrides: {
  user?: Partial<SessionInfo['user']>
  permissions?: string[]
  workspace?: SessionInfo['workspace']
  profileGate?: SessionInfo['profileGate']
}): ApiResult<SessionInfo> {
  return {
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
        ...overrides.user,
      },
      profileGate: overrides.profileGate ?? { complete: true, emailVerified: true },
      degraded: false,
      permissions: overrides.permissions ?? ['club:dashboard:view'],
      workspace: overrides.workspace ?? { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' },
    },
  }
}

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/auth/callback', component: AuthCallbackPage },
      { path: '/me', component: { template: '<div>me</div>' } },
      { path: '/me/profile/required', component: { template: '<div>gate</div>' } },
      { path: '/explore/activities', component: { template: '<div>explore</div>' } },
      { path: '/org/:clubId/dashboard', component: { template: '<div>dashboard</div>' } },
    ],
  })
}

async function mountCallback(redirect?: string) {
  const router = makeRouter()
  const pinia = createPinia()
  await router.push(redirect ? { path: '/auth/callback', query: { redirect } } : '/auth/callback')
  await router.isReady()
  mount(AuthCallbackPage, { global: { plugins: [router, pinia] } })
  await flushPromises()
  await flushPromises()
  return router
}

describe('AuthCallbackPage OIDC 回调落点（与登录页/根守卫同一口径）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('社团负责人无 redirect：按会话默认落点进入工作台', async () => {
    getSessionMock.mockResolvedValueOnce(sessionFor({}) as never)
    const router = await mountCallback()
    expect(router.currentRoute.value.path).toBe('/org/club-001/dashboard')
  })

  it('资料未完善：即使携带 redirect 也优先直达资料补全门禁页（P-GEN-04，避免闪跳）', async () => {
    getSessionMock.mockResolvedValueOnce(
      sessionFor({
        user: { id: 'u-incomplete', name: '资料未完善' },
        permissions: [],
        workspace: null,
        profileGate: { complete: false, emailVerified: false },
      }) as never,
    )
    const router = await mountCallback('/org/club-001/dashboard')
    expect(router.currentRoute.value.path).toBe('/me/profile/required')
  })

  it('同源 redirect 优先于默认落点', async () => {
    getSessionMock.mockResolvedValueOnce(
      sessionFor({ permissions: ['club:member:view-self'], workspace: { clubId: 'club-001', clubName: '计算机协会', role: 'member' } }) as never,
    )
    const router = await mountCallback('/explore/activities')
    expect(router.currentRoute.value.path).toBe('/explore/activities')
  })

  it('跨源 redirect 被拒：回落默认落点而非开放重定向', async () => {
    getSessionMock.mockResolvedValueOnce(
      sessionFor({ permissions: ['club:member:view-self'], workspace: { clubId: 'club-001', clubName: '计算机协会', role: 'member' } }) as never,
    )
    const router = await mountCallback('https://evil.example.com/phish')
    expect(router.currentRoute.value.path).toBe('/me')
  })

  it('会话建立失败：留在回调页展示错误，不跳转', async () => {
    getSessionMock.mockResolvedValueOnce({
      kind: 'rejected',
      error: { code: 'AUTH-NOT-SELECTED', message: 'no session' },
    } as never)
    const router = await mountCallback()
    expect(router.currentRoute.value.path).toBe('/auth/callback')
  })
})
