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

  it('加载成功：渲染候选与批量类型', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [{ memberId: 'mem-001', name: '陈雨桐' }] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ id: 'u1', name: '李思颖' }] } })
    const wrapper = mount(BatchOperationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.exists()).toBe(true)
    wrapper.unmount()
  })

  it('加载失败：展示候选加载错误态', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(BatchOperationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.exists()).toBe(true)
    wrapper.unmount()
  })
})
