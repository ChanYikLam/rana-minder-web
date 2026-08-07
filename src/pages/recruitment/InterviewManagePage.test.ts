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
    // 面试官接口契约：{ defaultReviewers, tasks }
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: {
        defaultReviewers: [{ id: 'u1', name: '李思颖', source: 'department_leader' }],
        tasks: [{ taskId: 't1', userName: '王浩然', status: 'active' }],
      },
    })
    const wrapper = mount(InterviewManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/interviews')
    expect(wrapper.text()).toContain('张三')
    // 默认面试官按契约渲染（防 mock 形状漂移导致渲染崩溃）
    expect(wrapper.text()).toContain('李思颖')
    wrapper.unmount()
  })

  it('加载失败：进入错误态不渲染面试记录', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(InterviewManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('张三')
    wrapper.unmount()
  })
})
