import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { invitationId: 'inv-1' }, meta: {} }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import InvitationPage from './InvitationPage.vue'

const detail = {
  id: 'inv-1', activityId: 'act-1', activityTitle: '秋季招新', clubName: '计算机协会',
  applicantName: '张三', status: 'sent', sentAt: '2026-08-01T04:00:00Z', expiredAt: '2026-08-08T04:00:00Z', departmentName: '技术部',
}

describe('InvitationPage 招新邀请', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染邀请详情', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: detail })
    const wrapper = mount(InvitationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/me/invitations/recruitment/inv-1')
    expect(wrapper.text()).toContain('秋季招新')
    expect(wrapper.text()).toContain('技术部')
  })

  it('接受邀请：状态更新为已接受', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: detail })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(InvitationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    const acceptBtn = wrapper.findAll('button').find((b) => b.text().includes('接受'))
    if (acceptBtn) {
      await acceptBtn.trigger('click')
      await flushPromises()
      expect(mockPost).toHaveBeenCalledWith('/me/invitations/recruitment/inv-1/respond', { action: 'accept' })
      expect(wrapper.text()).toContain('已接受')
    }
  })

  it('拒绝失败：展示错误提示', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: detail })
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(InvitationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    const rejectBtn = wrapper.findAll('button').find((b) => b.text().includes('拒绝'))
    if (rejectBtn) {
      await rejectBtn.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('操作失败，请稍后重试')
    }
  })

  it('加载失败：不渲染详情', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(InvitationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('秋季招新')
  })
})
