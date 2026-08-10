import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'
import App from './App.vue'

// 布局组件 stub 化，以便断言 App 为 404 页选择了哪个布局
const DefaultLayout = { name: 'DefaultLayout', template: '<div class="layout-default" data-test="default" />' } as Component
const PublicLayout = { name: 'PublicLayout', template: '<div class="layout-public" data-test="public" />' } as Component
const AuthLayout = { name: 'AuthLayout', template: '<div class="layout-auth" data-test="auth" />' } as Component

const loadUnreadCount = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
}))

vi.mock('@/state/sessionViewStore', () => ({
  useSessionViewStore: () => sessionMock,
}))

vi.mock('@/state/notificationViewStore', () => ({
  useNotificationViewStore: () => ({ loadUnreadCount }),
}))

// 由每个用例注入
let routeMock: { name: unknown; meta: Record<string, unknown> }
let sessionMock: { isAuthenticated: boolean }

function mountApp() {
  return mount(App, {
    global: {
      stubs: {
        RouterView: { template: '<div />' },
        Toaster: { template: '<div />' },
        // 命中断言目标：通过真实布局组件名区分
        DefaultLayout,
        PublicLayout,
        AuthLayout,
      },
    },
  })
}

describe('App 动态布局', () => {
  it('404 页已登录时使用 DefaultLayout 保留导航', () => {
    routeMock = { name: 'P-GEN-01', meta: { layout: 'public', public: true } }
    sessionMock = { isAuthenticated: true }
    const wrapper = mountApp()
    expect(wrapper.find('[data-test="default"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="public"]').exists()).toBe(false)
  })

  it('404 页未登录时使用 PublicLayout', () => {
    routeMock = { name: 'P-GEN-01', meta: { layout: 'public', public: true } }
    sessionMock = { isAuthenticated: false }
    const wrapper = mountApp()
    expect(wrapper.find('[data-test="public"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="default"]').exists()).toBe(false)
  })

  it('普通公开页未登录仍走 PublicLayout（meta 驱动）', () => {
    routeMock = { name: 'P-IDN-01', meta: { layout: 'public', public: true } }
    sessionMock = { isAuthenticated: false }
    const wrapper = mountApp()
    expect(wrapper.find('[data-test="public"]').exists()).toBe(true)
  })

  it('普通页面默认使用 DefaultLayout', () => {
    routeMock = { name: 'P-IDN-03', meta: { layout: 'default' } }
    sessionMock = { isAuthenticated: true }
    const wrapper = mountApp()
    expect(wrapper.find('[data-test="default"]').exists()).toBe(true)
  })

  it('auth 布局路由使用 AuthLayout', () => {
    routeMock = { name: 'P-IDN-02', meta: { layout: 'auth' } }
    sessionMock = { isAuthenticated: false }
    const wrapper = mountApp()
    expect(wrapper.find('[data-test="auth"]').exists()).toBe(true)
  })
})
