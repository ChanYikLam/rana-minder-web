import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001', activityId: 'act-1' } }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import ActivityManagePage from './ActivityManagePage.vue'

const detail = {
  id: 'act-1', title: '秋季招新', status: 'recruiting', channelStatus: 'open',
  deadline: '2026-09-01T00:00:00Z', clubName: '计算机协会', applicantCount: 12,
  allowAdjustmentDefault: true, formId: 'form-1',
}

describe('ActivityManagePage 招新活动管理', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染活动详情', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: detail })
    const wrapper = mount(ActivityManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/recruitment/act-1')
    expect(wrapper.text()).toContain('秋季招新')
  })

  it('加载失败：不渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(ActivityManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('秋季招新')
  })
})
