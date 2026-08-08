import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({ mockToastSuccess: vi.fn(), mockToastError: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { invitationId: 'jinv-1' }, meta: {} }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}))

import JointInvitationPage from './JointInvitationPage.vue'

// 工厂函数：组件 loadDetail 直接持有传入对象引用，共享 fixture 会被测试内操作改写（跨用例污染）
function makeDetail(): {
  id: string; jointId: string; jointTitle: string; clubName: string; applicantName: string
  type: string; status: string; sentAt: string; expiredAt: string
  reviewFlag: boolean; casdoorSync: string | null
} {
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
    mockToastSuccess.mockReset()
    mockToastError.mockReset()
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
    expect(mockToastError).toHaveBeenCalledWith('活动已结束')
  })

  // 新-2：已接受且同步中展示「确认生效」按钮，点击后调用申请人侧 sync-confirm
  it('已接受同步中：展示确认生效按钮并调用 sync-confirm', async () => {
    const detail = makeDetail()
    detail.status = 'accepted'
    detail.casdoorSync = 'processing'
    mockGet.mockResolvedValue({ kind: 'completed', data: detail })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(JointInvitationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('确认生效'))
    expect(confirmBtn, '同步中应渲染确认生效按钮').toBeTruthy()
    await confirmBtn!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/me/invitations/joint/jinv-1/sync-confirm')
    expect(wrapper.text()).toContain('已生效，欢迎加入')
  })

  it('已确认生效：不再渲染确认生效按钮', async () => {
    const detail = makeDetail()
    detail.status = 'accepted'
    detail.casdoorSync = 'confirmed'
    mockGet.mockResolvedValue({ kind: 'completed', data: detail })
    const wrapper = mount(JointInvitationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.findAll('button').some((b) => b.text().includes('确认生效'))).toBe(false)
    expect(wrapper.text()).toContain('已生效，欢迎加入')
  })
})
