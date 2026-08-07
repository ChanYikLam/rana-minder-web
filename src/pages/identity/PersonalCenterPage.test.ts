import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, meta: { tab: 'todo' } }),
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
})
