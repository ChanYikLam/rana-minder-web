import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001', jointId: 'jnt-1' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import JointInterviewPage from './JointInterviewPage.vue'

describe('JointInterviewPage 联合面试管理', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染联合面试列表', async () => {
    // onMounted 顺序：interviews → applications+slots（并行）→ interviewers+candidates（并行）
    // mockResolvedValueOnce 优先于默认值，按调用顺序设置
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ id: 'jiv-1', applicantName: '张三', roundName: '一轮', status: 'pending', departmentName: '技术部' }] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [] } })
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { defaultReviewers: [{ id: 'u1', name: '李思颖', source: 'department_leader' }], tasks: [] },
    })
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
    const wrapper = mount(JointInterviewPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/joint/jnt-1/interviews')
    expect(wrapper.text()).toContain('张三')
    // 默认面试官按契约渲染（防 mock 形状漂移导致渲染崩溃）
    expect(wrapper.text()).toContain('李思颖')
    wrapper.unmount()
  })

  it('加载失败：不渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(JointInterviewPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('张三')
  })
})
