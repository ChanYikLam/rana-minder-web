import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001', activityId: 'act-1' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import ReviewPage from './ReviewPage.vue'

const review = {
  id: 'rv-1', applicantId: 'app-1', applicantName: '张三', departmentName: '技术部',
  status: 'in_progress', rating: null, comment: null, concludedAt: null, concludedBy: null,
  myRating: null, myComment: null, peerViewLocked: false, reviews: [],
}

describe('ReviewPage 评审页', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染评审列表', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [review] } })
    const wrapper = mount(ReviewPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('张三')
    expect(wrapper.text()).toContain('技术部')
  })

  it('加载失败：不渲染列表', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(ReviewPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('张三')
  })
})
