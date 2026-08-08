import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import LoginPage from './LoginPage.vue'

// mock auth 服务：固定 mock 模式，便于模拟「同一 SPA 内切换身份二次登录」
vi.mock('@/services/auth', () => ({
  authMode: 'mock',
  startLogin: vi.fn(),
  getSession: vi.fn(),
  logout: vi.fn(),
}))

import * as authService from '@/services/auth'

const mockedStartLogin = vi.mocked(authService.startLogin)
const mockedGetSession = vi.mocked(authService.getSession)

function sessionData(overrides: { user?: { id: string; name: string }; permissions?: string[]; workspace?: unknown }) {
  return {
    kind: 'completed' as const,
    data: {
      user: overrides.user ?? { id: 'u-member', name: '成员' },
      profileGate: { complete: true, emailVerified: true },
      degraded: false,
      permissions: overrides.permissions ?? ['club:member:view-self'],
      workspace: overrides.workspace ?? null,
    },
  }
}

const routes = [
  { path: '/', component: { template: '<div>home</div>' } },
  { path: '/login', name: 'P-IDN-01', component: LoginPage },
  { path: '/me', component: { template: '<div>me</div>' } },
  { path: '/org/:clubId/dashboard', component: { template: '<div>dashboard</div>' } },
  { path: '/admin/clubs', component: { template: '<div>admin</div>' } },
  { path: '/:pathMatch(.*)*', component: { template: '<div>404</div>' } },
]

async function mountLoginPage() {
  const router = createRouter({ history: createMemoryHistory(), routes })
  const pinia = createPinia()
  setActivePinia(pinia)
  router.push('/login')
  await router.isReady()
  const wrapper = mount(LoginPage, { global: { plugins: [router, pinia] } })
  await flushPromises()
  return { wrapper, router }
}

describe('LoginPage 组件：mock 身份切换后会话刷新与落点', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mock 下切换身份二次登录：每次 handleLogin 刷新会话并按新身份解析落点', async () => {
    // onMounted 首次拉会话：未认证，不触发跳转（保持组件挂载）
    mockedGetSession.mockResolvedValueOnce({
      kind: 'rejected',
      error: { code: 'AUTH-MOCK-NOT-SELECTED', message: 'no session' },
    } as never)

    const { wrapper, router } = await mountLoginPage()
    const pushSpy = vi.spyOn(router, 'push')
    const loginButton = wrapper
      .findAll('button')
      .find((b) => b.text().includes('使用统一身份认证登录'))!

    // 第一次登录：社团负责人 → 按会话身份落入工作台
    mockedStartLogin.mockResolvedValueOnce('ready')
    mockedGetSession.mockResolvedValueOnce(
      sessionData({
        user: { id: 'u-leader', name: '负责人' },
        permissions: ['club:dashboard:view', 'club:member:manage'],
        workspace: { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' },
      }) as never,
    )

    await loginButton.trigger('click')
    await flushPromises()
    expect(pushSpy).toHaveBeenLastCalledWith('/org/club-001/dashboard')
    // 首次登录：startLogin 使用当前选中角色与默认落点
    expect(mockedStartLogin).toHaveBeenLastCalledWith('/me', 'leader')

    // 第二次登录：同一 SPA 生命周期内切换普通成员身份 → 会话刷新后按新身份解析到个人中心
    mockedStartLogin.mockResolvedValueOnce('ready')
    mockedGetSession.mockResolvedValueOnce(
      sessionData({
        user: { id: 'u-member', name: '成员' },
        permissions: ['club:member:view-self'],
        workspace: { clubId: 'club-001', clubName: '计算机协会', role: 'member' },
      }) as never,
    )

    await loginButton.trigger('click')
    await flushPromises()

    // 落点按新身份解析：普通成员无 dashboard 权限 → 个人中心（不得沿用旧身份的 /org/.../dashboard）
    expect(pushSpy).toHaveBeenLastCalledWith('/me')
    // 两次登录各调用一次 startLogin
    expect(mockedStartLogin).toHaveBeenCalledTimes(2)
    // 每次登录前都重新拉取会话（onMounted 一次 + 两次 handleLogin 各一次）
    expect(mockedGetSession).toHaveBeenCalledTimes(3)
  })

  it('mock 下切换身份为资料未完善用户：会话刷新后落入资料补全门禁页', async () => {
    mockedGetSession.mockResolvedValueOnce({
      kind: 'rejected',
      error: { code: 'AUTH-MOCK-NOT-SELECTED', message: 'no session' },
    } as never)

    const { wrapper, router } = await mountLoginPage()
    const pushSpy = vi.spyOn(router, 'push')
    const loginButton = wrapper
      .findAll('button')
      .find((b) => b.text().includes('使用统一身份认证登录'))!

    mockedStartLogin.mockResolvedValueOnce('ready')
    mockedGetSession.mockResolvedValueOnce({
      kind: 'completed',
      data: {
        user: { id: 'u-incomplete', name: '资料未完善' },
        profileGate: { complete: false, emailVerified: false },
        degraded: false,
        permissions: [],
        workspace: null,
      },
    } as never)

    await loginButton.trigger('click')
    await flushPromises()

    expect(mockedStartLogin).toHaveBeenCalledTimes(1)
    expect(pushSpy).toHaveBeenLastCalledWith('/me/profile/required')
  })

  it('已登录用户直接访问 /login 时按会话身份解析落点', async () => {
    mockedGetSession.mockResolvedValueOnce(
      sessionData({
        user: { id: 'u-leader', name: '负责人' },
        permissions: ['club:dashboard:view'],
        workspace: { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' },
      }) as never,
    )

    const { router } = await mountLoginPage()

    expect(router.currentRoute.value.path).toBe('/org/club-001/dashboard')
  })
})
