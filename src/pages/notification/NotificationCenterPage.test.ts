import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { pageStubs } from '@/test-utils/pageStubs'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  getUnreadCount: vi.fn(),
}))

vi.mock('@/services', () => ({
  notificationApi: { list: (...a: unknown[]) => mocks.list(...a), markRead: (...a: unknown[]) => mocks.markRead(...a), markAllRead: (...a: unknown[]) => mocks.markAllRead(...a), getUnreadCount: (...a: unknown[]) => mocks.getUnreadCount(...a) },
}))

import NotificationCenterPage from './NotificationCenterPage.vue'
import { useNotificationViewStore } from '@/state/notificationViewStore'

describe('NotificationCenterPage 通知中心', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染通知列表', async () => {
    mocks.list.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'n1', type: 'application', title: '报名状态更新', body: '你的报名已通过', read: false, createdAt: '2026-08-01T04:00:00Z', link: null, clubName: '计算机协会' }], nextCursor: null },
    })
    mocks.getUnreadCount.mockResolvedValue({ kind: 'completed', data: { count: 1 } })
    const wrapper = mount(NotificationCenterPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('报名状态更新')
    expect(wrapper.text()).toContain('你的报名已通过')
  })

  it('加载失败：不渲染列表', async () => {
    mocks.list.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(NotificationCenterPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('报名状态更新')
  })

  it('加载失败（IFC-ERR-003 无权限）：PageStateBoundary 进入 forbidden', async () => {
    mocks.list.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-003', message: '无权限' } })
    const wrapper = mount(NotificationCenterPage, {
      global: {
        stubs: {
          ...pageStubs,
          PageStateBoundary: {
            props: ['state'],
            template: '<div class="psb" :data-state="state"><slot /></div>',
          },
        },
      },
    })
    await flushPromises()
    expect(wrapper.find('.psb').attributes('data-state')).toBe('forbidden')
  })

  it('加载失败（IFC-ERR-016 普通错误）：PageStateBoundary 进入 error', async () => {
    mocks.list.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(NotificationCenterPage, {
      global: {
        stubs: {
          ...pageStubs,
          PageStateBoundary: {
            props: ['state'],
            template: '<div class="psb" :data-state="state"><slot /></div>',
          },
        },
      },
    })
    await flushPromises()
    expect(wrapper.find('.psb').attributes('data-state')).toBe('error')
  })

  it('全部已读失败：进入 error 而非 forbidden（写操作语义固定为 error）', async () => {
    mocks.list.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'n1', type: 'application', title: '报名状态更新', body: '你的报名已通过', read: false, createdAt: '2026-08-01T04:00:00Z', link: null, clubName: '计算机协会' }], nextCursor: null },
    })
    mocks.getUnreadCount.mockResolvedValue({ kind: 'completed', data: { count: 1 } })
    mocks.markAllRead.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-003', message: '无权限' } })
    // 预置未读数，使“全部已读”按钮可见（hasUnread 依赖 unreadCount）
    useNotificationViewStore().unreadCount = 1
    const wrapper = mount(NotificationCenterPage, {
      global: {
        stubs: {
          ...pageStubs,
          PageStateBoundary: {
            props: ['state'],
            template: '<div class="psb" :data-state="state"><slot /></div>',
          },
        },
      },
    })
    await flushPromises()
    const btn = wrapper.findAll('button').find((b) => b.text().includes('全部已读'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.psb').attributes('data-state')).toBe('error')
  })
})
