import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({ mockToastSuccess: vi.fn(), mockToastError: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { invitationId: 'inv-1' }, meta: {} }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}))

import InvitationPage from './InvitationPage.vue'

// 工厂函数：组件 loadDetail 直接持有传入对象引用，共享 fixture 会被测试内操作改写（跨用例污染）
function makeDetail() {
  return {
    id: 'inv-1', activityId: 'act-1', activityTitle: '秋季招新', clubName: '计算机协会',
    applicantName: '张三', status: 'sent', sentAt: '2026-08-01T04:00:00Z', expiredAt: '2026-08-08T04:00:00Z', departmentName: '技术部',
    casdoorSync: 'none',
  }
}

describe('InvitationPage 招新邀请', () => {
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
    const wrapper = mount(InvitationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/me/invitations/recruitment/inv-1')
    expect(wrapper.text()).toContain('秋季招新')
    expect(wrapper.text()).toContain('技术部')
  })

  it('接受邀请：状态更新为已接受', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: makeDetail() })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(InvitationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    const acceptBtn = wrapper.findAll('button').find((b) => b.text().includes('接受邀请'))
    expect(acceptBtn, '待处理邀请应渲染接受按钮').toBeTruthy()
    await acceptBtn!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/me/invitations/recruitment/inv-1/respond', { action: 'accept' })
    expect(wrapper.text()).toContain('您已接受邀请')
  })

  it('拒绝失败：展示错误提示', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: makeDetail() })
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(InvitationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    const rejectBtn = wrapper.findAll('button').find((b) => b.text().includes('拒绝'))
    expect(rejectBtn, '待处理邀请应渲染拒绝按钮').toBeTruthy()
    await rejectBtn!.trigger('click')
    await flushPromises()
    expect(mockToastError).toHaveBeenCalledWith('操作失败，请稍后重试')
  })

  it('加载失败：不渲染详情', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(InvitationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('秋季招新')
  })

  // 新-2：已接受且同步中展示「确认生效」按钮，点击后调用申请人侧 sync-confirm
  it('已接受同步中：展示确认生效按钮并调用 sync-confirm，成功后刷新为已生效', async () => {
    const detail = makeDetail()
    detail.status = 'accepted'
    detail.casdoorSync = 'processing'
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: detail })
    // 确认成功后 handleSyncConfirm 重新拉取详情 → 返回已确认状态
    const confirmed = makeDetail()
    confirmed.status = 'accepted'
    confirmed.casdoorSync = 'confirmed'
    mockGet.mockResolvedValue({ kind: 'completed', data: confirmed })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(InvitationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('确认生效'))
    expect(confirmBtn, '同步中应渲染确认生效按钮').toBeTruthy()
    await confirmBtn!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/me/invitations/recruitment/inv-1/sync-confirm')
    expect(wrapper.text()).toContain('已生效，欢迎加入')
  })

  it('sync_failed 状态：展示重试确认按钮并调用 sync-confirm，成功后刷新为已生效（P2-3 申请人侧重试）', async () => {
    const detail = makeDetail()
    detail.status = 'sync_failed'
    detail.casdoorSync = 'failed'
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: detail })
    // 重试成功后 handleSyncConfirm 重新拉取详情 → 已确认
    const confirmed = makeDetail()
    confirmed.status = 'accepted'
    confirmed.casdoorSync = 'confirmed'
    mockGet.mockResolvedValue({ kind: 'completed', data: confirmed })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(InvitationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('确认生效'))
    expect(confirmBtn, 'sync_failed 应渲染重试确认按钮').toBeTruthy()
    expect(wrapper.text()).toContain('同步失败')
    await confirmBtn!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/me/invitations/recruitment/inv-1/sync-confirm')
    expect(wrapper.text()).toContain('已生效，欢迎加入')
    wrapper.unmount()
  })

  it('已确认生效：不再渲染确认生效按钮', async () => {
    const detail = makeDetail()
    detail.status = 'accepted'
    detail.casdoorSync = 'confirmed'
    mockGet.mockResolvedValue({ kind: 'completed', data: detail })
    const wrapper = mount(InvitationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.findAll('button').some((b) => b.text().includes('确认生效'))).toBe(false)
    expect(wrapper.text()).toContain('已生效，欢迎加入')
  })
})
