import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost, routeMeta } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  routeMeta: { tab: 'todo' },
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, meta: routeMeta }),
  useRouter: () => ({ push: vi.fn() }),
  // navigateByLink → safeLink → router/index 依赖的符号
  createRouter: vi.fn(() => ({ push: vi.fn(), beforeEach: vi.fn() })),
  createWebHistory: vi.fn(),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import PersonalCenterPage from './PersonalCenterPage.vue'

const ongoingItem = {
  id: 'app-1', type: 'application', title: '报名计算机协会', description: '',
  submittedAt: '2026-08-07T04:00:00Z', link: '/x', activityId: 'act-001', status: 'submitted',
}

describe('PersonalCenterPage 个人中心', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：并行请求四个 tab 数据并渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [{ id: 't1', type: 'review', title: '待处理评审', description: '有 3 条待评审', deadline: '2026-08-10T00:00:00Z', link: '/x' }] } })
    const wrapper = mount(PersonalCenterPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/me/todo')
    expect(mockGet).toHaveBeenCalledWith('/me/ongoing')
    expect(mockGet).toHaveBeenCalledWith('/me/history')
    expect(mockGet).toHaveBeenCalledWith('/me/schedule')
    expect(wrapper.text()).toContain('待处理评审')
  })

  it('部分请求失败：进入错误态', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
    mockGet.mockResolvedValueOnce({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(PersonalCenterPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('待处理评审')
  })

  it('P2-42：非激活 tab 失败不拖垮整页', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [{ id: 't1', type: 'review', title: '待处理评审', description: '有 3 条待评审', deadline: '2026-08-10T00:00:00Z', link: '/x' }] } })
    // 第 2 个请求（/me/ongoing）失败，但当前激活 tab 是 todo
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ id: 't1', type: 'review', title: '待处理评审', description: '有 3 条待评审', deadline: '2026-08-10T00:00:00Z', link: '/x' }] } })
    mockGet.mockResolvedValueOnce({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [] } })
    const wrapper = mount(PersonalCenterPage, { global: { stubs: pageStubs } })
    await flushPromises()
    // 当前 tab（todo）数据正常，页面仍渲染
    expect(wrapper.text()).toContain('待处理评审')
  })
})

describe('PersonalCenterPage 退出招新确认态', () => {
  beforeEach(() => {
    routeMeta.tab = 'ongoing'
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  async function mountWithOngoing() {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [ongoingItem] } })
    const wrapper = mount(PersonalCenterPage, { global: { stubs: pageStubs } })
    await flushPromises()
    return wrapper
  }

  it('P2-16：首次点击进入确认态，5 秒后自动复位且不触发退出', async () => {
    vi.useFakeTimers()
    const wrapper = await mountWithOngoing()

    const btn = wrapper.findAll('button').find((b) => b.text().includes('退出招新'))!
    await btn.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('再点一次确认退出')
    expect(mockPost).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5000)
    await flushPromises()
    expect(wrapper.text()).toContain('退出招新')
    expect(wrapper.text()).not.toContain('再点一次确认退出')
    expect(mockPost).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('P2-16：确认态内再次点击才执行退出请求', async () => {
    mockPost.mockResolvedValue({ kind: 'completed', data: null })
    const wrapper = await mountWithOngoing()

    const btn = wrapper.findAll('button').find((b) => b.text().includes('退出招新'))!
    await btn.trigger('click')
    await flushPromises()
    expect(mockPost).not.toHaveBeenCalled()

    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('再点一次确认退出'))!
    await confirmBtn.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/activity/recruitment/act-001/withdraw', { confirm: true })
    wrapper.unmount()
  })

  it('P2-16：切 tab 清理确认态，旧点击不再被误当“确认”', async () => {
    mockPost.mockResolvedValue({ kind: 'completed', data: null })
    const wrapper = await mountWithOngoing()

    const btn = wrapper.findAll('button').find((b) => b.text().includes('退出招新'))!
    await btn.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('再点一次确认退出')

    // 切换到其他 tab（switchTab 内清理确认态）
    const historyTab = wrapper.findAll('button').find((b) => b.text().includes('历史记录'))!
    await historyTab.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('退出招新')
    expect(wrapper.text()).not.toContain('再点一次确认退出')

    // 切回进行中 tab：再次点击应重新进入确认态而非直接执行
    const again = wrapper.findAll('button').find((b) => b.text().includes('退出招新'))!
    await again.trigger('click')
    await flushPromises()
    expect(mockPost).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('再点一次确认退出')
    wrapper.unmount()
  })
})
