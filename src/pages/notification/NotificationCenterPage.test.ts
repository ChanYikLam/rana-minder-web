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
})
