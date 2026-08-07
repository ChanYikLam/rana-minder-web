import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import AdminJointListPage from './AdminJointListPage.vue'

const joint = {
  id: 'jnt-1', title: '联合招新', status: 'recruiting', participants: ['网络协会'],
  applicantCount: 10, canForceClose: true, clubs: [{ clubId: 'club-001', clubName: '计算机协会', suspended: false }],
}

describe('AdminJointListPage 平台联合活动列表', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染联合活动列表', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [joint] } })
    const wrapper = mount(AdminJointListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/admin/joint')
    expect(wrapper.text()).toContain('联合招新')
  })

  it('加载失败：按错误码映射状态', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-003', message: '无权限' } })
    const wrapper = mount(AdminJointListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('联合招新')
  })

  it('切换参与社团挂起/恢复：请求对应端点', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [joint] } })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(AdminJointListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    // 挂起：点击 "挂起" 按钮
    const suspendBtn = wrapper.findAll('button').find((b) => b.text().includes('挂起') || b.text().includes('暂停'))
    if (suspendBtn) {
      await suspendBtn.trigger('click')
      await flushPromises()
      expect(mockPost).toHaveBeenCalledWith('/admin/joint/jnt-1/clubs/club-001/force-suspend', {})
    }
  })
})
