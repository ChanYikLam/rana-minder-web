import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import AdminRecruitmentListPage from './AdminRecruitmentListPage.vue'

describe('AdminRecruitmentListPage 平台招新列表', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染跨社团招新列表', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'act-1', title: '联合招新', clubName: '网络协会', status: 'recruiting', applicantCount: 20, canForceComplete: true }] },
    })
    const wrapper = mount(AdminRecruitmentListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/admin/recruitment')
    expect(wrapper.text()).toContain('联合招新')
    expect(wrapper.text()).toContain('网络协会')
  })

  it('强制结束：未填原因被拦截', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'act-1', title: '联合招新', clubName: '网络协会', status: 'recruiting', applicantCount: 1, canForceComplete: true }] },
    })
    mount(AdminRecruitmentListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockPost).not.toHaveBeenCalled()
  })
})
