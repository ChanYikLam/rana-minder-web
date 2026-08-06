import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { useUserMenu, PLATFORM_PERMISSIONS } from './useUserMenu'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'

/**
 * 用户菜单公共逻辑：平台管理入口权限判定 + 健壮退出登录。
 */

const Harness = defineComponent({
  setup() {
    const { canAccessPlatformAdmin, hasAnyPlatformPermission, handleLogout } = useUserMenu({
      beforeRedirect: () => { beforeRedirectMock() },
    })
    return { canAccessPlatformAdmin, hasAnyPlatformPermission, handleLogout }
  },
  render() { return null },
})

const beforeRedirectMock = vi.fn()

interface HarnessVm {
  canAccessPlatformAdmin: boolean
  hasAnyPlatformPermission: boolean
  handleLogout: () => Promise<void>
}

let router: Router

function mountHarness() {
  const wrapper = mount(Harness, { global: { plugins: [router] } })
  return { wrapper, vm: wrapper.vm as unknown as HarnessVm }
}

describe('useUserMenu', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    router = createRouter({ history: createMemoryHistory(), routes: [] })
    beforeRedirectMock.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('仅 platform:club:manage 可访问平台管理入口（与 /admin/clubs 守卫一致）', () => {
    const session = useSessionViewStore()
    session.permissions = ['platform:club:manage']
    const { vm } = mountHarness()
    expect(vm.canAccessPlatformAdmin).toBe(true)
  })

  it('只拥有其它平台权限时不展示平台管理入口，避免被路由守卫打回', () => {
    const session = useSessionViewStore()
    session.permissions = ['platform:form:design', 'platform:ops:view']
    const { vm } = mountHarness()
    expect(vm.canAccessPlatformAdmin).toBe(false)
  })

  it('无任何平台权限时不展示平台管理入口', () => {
    const session = useSessionViewStore()
    session.permissions = ['club:member:manage']
    const { vm } = mountHarness()
    expect(vm.canAccessPlatformAdmin).toBe(false)
  })

  it('hasAnyPlatformPermission：任一平台权限命中即 true（用于侧边栏平台分组）', () => {
    const session = useSessionViewStore()
    session.permissions = ['platform:form:design']
    const { vm } = mountHarness()
    expect(vm.hasAnyPlatformPermission).toBe(true)
  })

  it('PLATFORM_PERMISSIONS 与路由 ADMIN_PERMISSIONS 权限集合一致', () => {
    const adminPermissions = new Set([
      'platform:club:manage',
      'platform:form:design',
      'platform:config:manage',
      'platform:audit:view',
      'platform:export:execute',
      'platform:delete:execute',
      'platform:ops:view',
    ])
    expect(new Set(PLATFORM_PERMISSIONS)).toEqual(adminPermissions)
  })

  it('退出登录成功：清理工作区并跳转登录页', async () => {
    const session = useSessionViewStore()
    const workspace = useWorkspaceContextStore()
    const logoutSpy = vi.spyOn(session, 'logout').mockResolvedValue(undefined)
    const clearSpy = vi.spyOn(workspace, 'clearWorkspace').mockImplementation(() => {})
    const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined as never)

    const { vm } = mountHarness()
    await vm.handleLogout()

    expect(logoutSpy).toHaveBeenCalledTimes(1)
    expect(clearSpy).toHaveBeenCalledTimes(1)
    expect(pushSpy).toHaveBeenCalledWith('/login')
    expect(beforeRedirectMock).toHaveBeenCalledTimes(1)
  })

  it('退出登录失败（OIDC 网络异常）：仍清理工作区并跳转登录页（finally）', async () => {
    const session = useSessionViewStore()
    const workspace = useWorkspaceContextStore()
    const logoutSpy = vi.spyOn(session, 'logout').mockRejectedValue(new Error('oidc down'))
    const clearSpy = vi.spyOn(workspace, 'clearWorkspace').mockImplementation(() => {})
    const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined as never)

    const { vm } = mountHarness()
    await expect(vm.handleLogout()).rejects.toThrow('oidc down')

    expect(logoutSpy).toHaveBeenCalledTimes(1)
    expect(clearSpy).toHaveBeenCalledTimes(1)
    expect(pushSpy).toHaveBeenCalledWith('/login')
    expect(beforeRedirectMock).toHaveBeenCalledTimes(1)
  })
})
