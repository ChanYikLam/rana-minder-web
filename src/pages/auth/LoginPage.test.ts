import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { createPinia, type Pinia } from 'pinia'
import LoginPage from './LoginPage.vue'
import { getSession } from '@/services/auth'
import { useSessionViewStore } from '@/state/sessionViewStore'
import type { SessionInfo } from '@/types/domain'
import type { ApiResult } from '@/types/contracts'

const MOCK_ROLE_STORAGE_KEY = 'ranaminder.mockRole'

/** 仅替换 getSession（真实实现走 fetch，测试环境无 mock 插件）；startLogin/authMode 保持真实 mock 行为 */
vi.mock('@/services/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/auth')>()
  return { ...actual, getSession: vi.fn() }
})

const getSessionMock = vi.mocked(getSession)

function sessionFor(roleKey: string | null): ApiResult<SessionInfo> {
  if (roleKey === 'member') {
    return {
      kind: 'completed',
      data: {
        user: {
          id: 'user-member-001',
          studentId: '20210005',
          name: '陈雨桐',
          email: 'member@example.edu.cn',
          phone: '',
          avatar: null,
          emailVerified: true,
          profileComplete: true,
        },
        profileGate: { complete: true, emailVerified: true },
        degraded: false,
        permissions: ['club:member:view-self'],
        workspace: { clubId: 'club-001', clubName: '计算机协会', role: 'member' },
      },
    }
  }
  if (roleKey === 'admin') {
    return {
      kind: 'completed',
      data: {
        user: {
          id: 'user-admin-001',
          studentId: '20210001',
          name: '平台管理员',
          email: 'admin@example.edu.cn',
          phone: '',
          avatar: null,
          emailVerified: true,
          profileComplete: true,
        },
        profileGate: { complete: true, emailVerified: true },
        degraded: false,
        permissions: ['platform:club:manage', 'platform:config:manage'],
        workspace: null,
      },
    }
  }
  return { kind: 'rejected', error: { code: 'AUTH-MOCK-NOT-SELECTED', message: '请先选择 Mock 登录身份' } }
}

const Dummy = { render: () => null }

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'P-IDN-01', component: Dummy, meta: { public: true } },
      { path: '/me', component: Dummy },
      { path: '/admin/clubs', component: Dummy },
      { path: '/org/:clubId/dashboard', component: Dummy },
    ],
  })
}

async function clickRoleAndLogin(wrapper: ReturnType<typeof mount>, roleLabel: string) {
  const roleButton = wrapper.findAll('button').find((b) => b.text().includes(roleLabel))
  expect(roleButton, `找不到身份按钮：${roleLabel}`).toBeTruthy()
  await roleButton!.trigger('click')

  const loginButton = wrapper.findAll('button').find((b) => b.text().includes('使用统一身份认证登录'))
  expect(loginButton).toBeTruthy()
  await loginButton!.trigger('click')
  await flushPromises()
  await flushPromises()
}

describe('LoginPage 登录落点与权限刷新（mock 身份切换）', () => {
  let pinia: Pinia
  let router: Router

  beforeEach(() => {
    sessionStorage.clear()
    getSessionMock.mockImplementation(() => Promise.resolve(sessionFor(sessionStorage.getItem(MOCK_ROLE_STORAGE_KEY))))
    pinia = createPinia()
    router = makeRouter()
  })

  it('同一 SPA 生命周期内先以普通成员登录再切换超级管理员：落点与权限均按新身份刷新', async () => {
    router.push('/login')
    await router.isReady()
    const wrapper = mount(LoginPage, { global: { plugins: [pinia, router] } })
    await flushPromises()

    // 首次登录：普通成员（有工作空间但无 dashboard 权限）→ 回落个人中心
    await clickRoleAndLogin(wrapper, '普通成员')
    const session = useSessionViewStore(pinia)
    expect(session.user?.id).toBe('user-member-001')
    expect(session.permissions).toEqual(['club:member:view-self'])
    expect(router.currentRoute.value.path).toBe('/me')

    // 同一 SPA 生命周期内切换身份：超级管理员（无工作空间 + 平台权限）→ admin 默认首页
    await clickRoleAndLogin(wrapper, '超级管理员')
    expect(session.user?.id).toBe('user-admin-001')
    expect(session.permissions).toContain('platform:club:manage')
    expect(session.permissions).not.toContain('club:member:view-self')
    expect(router.currentRoute.value.path).toBe('/admin/clubs')

    wrapper.unmount()
  })
})
