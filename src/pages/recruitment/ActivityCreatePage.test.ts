import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost, mockPush } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn(), mockPush: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001' } }),
  useRouter: () => ({ push: mockPush }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import ActivityCreatePage from './ActivityCreatePage.vue'

describe('ActivityCreatePage 创建招新活动', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载已发布表单供选择', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'form-1', title: '报名表', status: 'published' }, { id: 'form-2', title: '草稿表', status: 'draft' }] },
    })
    const wrapper = mount(ActivityCreatePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/forms')
    expect(wrapper.text()).toContain('报名表')
    // 草稿表单不展示
    expect(wrapper.text()).not.toContain('草稿表')
  })

  it('表单加载失败：展示错误态', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(ActivityCreatePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('创建招新活动')
  })
})
