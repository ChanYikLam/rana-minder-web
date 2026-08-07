import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPush } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPush: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { activityId: 'act-1' }, meta: { variant: 'recruitment' } }),
  useRouter: () => ({ push: mockPush }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
}))

import PublicDetailPage from './PublicDetailPage.vue'

const detail = {
  id: 'act-1', clubId: 'club-001', clubName: '计算机协会', title: '秋季招新',
  description: '面向全校招新', status: 'recruiting', channelStatus: 'open',
  deadline: '2026-09-01T00:00:00Z', departments: [{ id: 'dept-1', name: '技术部' }], formId: 'form-1',
}

describe('PublicDetailPage 公开详情页', () => {
  beforeEach(() => {
    mockGet.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('招新详情：按活动接口加载并渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: detail })
    const wrapper = mount(PublicDetailPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/explore/activities/act-1')
    expect(wrapper.text()).toContain('秋季招新')
    expect(wrapper.text()).toContain('计算机协会')
    expect(wrapper.text()).toContain('技术部')
  })

  it('加载失败：不渲染详情', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(PublicDetailPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('秋季招新')
  })
})
