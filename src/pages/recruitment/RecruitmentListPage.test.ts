import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPush } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPush: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001' } }),
  useRouter: () => ({ push: mockPush }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
}))

import RecruitmentListPage from './RecruitmentListPage.vue'

describe('RecruitmentListPage 社团招新列表', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染活动列表', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'act-1', title: '秋季招新', status: 'recruiting', channelStatus: 'open', deadline: '2026-09-01T00:00:00Z', applicantCount: 12, createdAt: '2026-08-01T00:00:00Z' }] },
    })
    const wrapper = mount(RecruitmentListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/recruitment')
    expect(wrapper.text()).toContain('秋季招新')
  })

  it('空列表：展示空态', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
    const wrapper = mount(RecruitmentListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('暂无招新活动')
  })

  it('加载失败：不渲染列表', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(RecruitmentListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('秋季招新')
  })

  it('点击活动卡片跳转管理页', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'act-1', title: '秋季招新', status: 'recruiting', channelStatus: 'open', deadline: '2026-09-01T00:00:00Z', applicantCount: 1, createdAt: '2026-08-01T00:00:00Z' }] },
    })
    const wrapper = mount(RecruitmentListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    await wrapper.find('.card').trigger('click')
    expect(mockPush).toHaveBeenCalled()
  })
})
