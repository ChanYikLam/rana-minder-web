import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { invitationId: 'jinv-1' }, meta: {} }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import JointInvitationPage from './JointInvitationPage.vue'

// 工厂函数：组件 loadDetail 直接持有传入对象引用，共享 fixture 会被测试内操作改写（跨用例污染）
function makeDetail() {
  return {
    id: 'jinv-1', jointId: 'jnt-1', jointTitle: '联合招新', clubName: '网络协会',
    applicantName: '张三', type: 'joint', status: 'sent', sentAt: '2026-08-01T04:00:00Z',
    expiredAt: '2026-08-08T04:00:00Z', reviewFlag: false, casdoorSync: null,
  }
}

describe('JointInvitationPage 联合邀请', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染邀请详情', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: makeDetail() })
    const wrapper = mount(JointInvitationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/me/invitations/joint/jinv-1')
    expect(wrapper.text()).toContain('联合招新')
  })

  it('接受邀请成功：状态更新', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: makeDetail() })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(JointInvitationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    const acceptBtn = wrapper.findAll('button').find((b) => b.text().includes('接受邀请'))
    expect(acceptBtn, '待处理邀请应渲染接受按钮').toBeTruthy()
    await acceptBtn!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/me/invitations/joint/jinv-1/respond', { action: 'accept' })
    expect(wrapper.text()).toContain('您已接受联合邀请')
  })

  it('拒绝失败：展示服务端错误', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: makeDetail() })
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-006', message: '活动已结束' } })
    const wrapper = mount(JointInvitationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    const rejectBtn = wrapper.findAll('button').find((b) => b.text().includes('拒绝'))
    expect(rejectBtn, '待处理邀请应渲染拒绝按钮').toBeTruthy()
    await rejectBtn!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('活动已结束')
  })
})
