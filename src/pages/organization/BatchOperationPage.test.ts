import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import BatchOperationPage from './BatchOperationPage.vue'

describe('BatchOperationPage 批量操作', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染批量类型选项与步骤一', async () => {
    // 调用顺序：candidates（Once）→ interviewers（默认）
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ memberId: 'mem-001', name: '陈雨桐' }] } })
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [{ id: 'u1', name: '李思颖' }] } })
    const wrapper = mount(BatchOperationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/batch/candidates', undefined, expect.anything())
    expect(wrapper.text()).toContain('1. 选择类型')
    expect(wrapper.text()).toContain('批量分配面试官')
    expect(wrapper.text()).toContain('批量发送邀请')
    wrapper.unmount()
  })

  it('候选加载失败：选择类型进入预览后展示加载失败提示', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(BatchOperationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    // 选择批量类型进入预览步骤后才展示候选加载失败区域（类型为可点击卡片）
    const typeCard = wrapper.findAll('.card').find((c) => c.text().includes('批量分配面试官'))
    expect(typeCard).toBeTruthy()
    await typeCard!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('候选人列表加载失败')
    wrapper.unmount()
  })
})
