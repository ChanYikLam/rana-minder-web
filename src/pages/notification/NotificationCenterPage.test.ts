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
const mockToast = vi.hoisted(() => ({ error: vi.fn() }))

vi.mock('vue-sonner', () => ({ toast: { error: (...a: unknown[]) => mockToast.error(...a) } }))

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

  it('全部已读失败：页面不整页 loading、列表保持可见（写操作仅记日志）', async () => {
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
    // P2-54：写操作不整页 loading，列表保持可见
    expect(wrapper.find('.psb').attributes('data-state')).toBe('normal')
    expect(wrapper.text()).toContain('报名状态更新')
    // 评审 I2：失败不再静默，明确 toast 提示
    expect(mockToast.error).toHaveBeenCalledWith('标记已读失败，请稍后重试')
  })

  it('markRead 失败：不打断查看详情且无 unhandled rejection（openDetail 不依赖 throw）', async () => {
    mocks.list.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'n1', type: 'application', title: '报名状态更新', body: '你的报名已通过', read: false, createdAt: '2026-08-01T04:00:00Z', link: null, clubName: '计算机协会' }], nextCursor: null },
    })
    mocks.getUnreadCount.mockResolvedValue({ kind: 'completed', data: { count: 1 } })
    mocks.markRead.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-003', message: '无权限' } })
    const wrapper = mount(NotificationCenterPage, {
      global: {
        stubs: {
          ...pageStubs,
          // 转发 Card 点击以触发 openDetail；NotificationDetail 透出标题以验证详情已打开
          Card: { template: '<div class="card" @click="$emit(\'click\')"><slot /></div>' },
          NotificationDetail: { template: '<div class="ntf-detail">{{ notification?.title }}</div>', props: ['notification'] },
        },
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('报名状态更新')
    await wrapper.find('.card').trigger('click')
    await flushPromises()
    // 打开详情后页面仍处于 normal 态，未被错误打断
    expect(wrapper.find('.ntf-detail').text()).toContain('报名状态更新')
  })
})
