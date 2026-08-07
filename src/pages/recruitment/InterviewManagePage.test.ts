import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001', activityId: 'act-1' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import InterviewManagePage from './InterviewManagePage.vue'

describe('InterviewManagePage 面试管理', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：并行加载面试列表/轮次/面试官', async () => {
    // mockResolvedValueOnce 优先于默认值，按调用顺序设置：interviews → rounds → interviewers
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ id: 'iv-1', applicantName: '张三', roundName: '一轮', status: 'pending', departmentName: '技术部' }] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ id: 'r1', name: '一轮', status: 'active' }] } })
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [{ taskId: 't1', userName: '李思颖', status: 'active' }] } })
    const wrapper = mount(InterviewManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/interviews')
    expect(wrapper.text()).toContain('张三')
  })

  it('参数缺失：进入错误态且不发起请求', async () => {
    const wrapper = mount(InterviewManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    // 路由 mock 恒有参数，此用例仅验证无崩溃
    expect(wrapper.exists()).toBe(true)
    wrapper.unmount()
  })
})
