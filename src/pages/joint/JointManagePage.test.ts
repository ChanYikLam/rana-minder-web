import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001', jointId: 'jnt-1' }, meta: { mode: 'manage' } }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { toast } from 'vue-sonner'
import JointManagePage from './JointManagePage.vue'

const detail = {
  id: 'jnt-1', title: '联合招新', description: '跨社招新', status: 'recruiting', channelStatus: 'open',
  deadline: '2026-09-01T00:00:00Z',
  participants: [{ clubId: 'club-001', clubName: '计算机协会', status: 'active', concludedCount: 2 }],
  applicantCount: 10, version: 1,
}

describe('JointManagePage 联合活动管理', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('管理态：加载详情并渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: detail })
    const wrapper = mount(JointManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/joint/jnt-1')
    expect(wrapper.text()).toContain('联合招新')
    expect(wrapper.text()).toContain('计算机协会')
  })

  it('加载失败：不渲染详情', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(JointManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('联合招新')
  })

  it('越权码（IFC-ERR-003）映射 forbidden：不渲染详情', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-003', message: '无权限' } })
    const wrapper = mount(JointManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('联合招新')
    wrapper.unmount()
  })

  it('取消活动成功：置位 succeeded 并关闭高危弹窗，且可再次打开时重置 succeeded', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: detail })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(JointManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 打开取消弹窗（pageStubs 的 HighRiskConfirm 用 :succeeded prop，需断言状态已重置）
    const cancelBtn = wrapper.findAll('button').find((b) => b.text().includes('取消活动'))
    expect(cancelBtn).toBeTruthy()
    await cancelBtn!.trigger('click')
    expect(wrapper.find('.hrc').exists()).toBe(true)

    // 确认取消 → post 成功 → 关闭弹窗 + succeeded=true
    await wrapper.find('.hrc-confirm').trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/joint/jnt-1/cancel', expect.objectContaining({ confirm: true, reason: expect.any(String) }))
    expect(wrapper.find('.hrc').exists()).toBe(false)
    // 刷新后重新打开：succeeded 必须被重置为 false（避免重开直接跳 done）
    await cancelBtn!.trigger('click')
    const hrc = wrapper.findComponent({ name: 'HighRiskConfirm' })
    expect(hrc.props('succeeded')).toBe(false)
    expect(hrc.props('errorMessage')).toBe('')
    wrapper.unmount()
  })

  it('取消活动被 202 异步受理：提示已受理并关闭弹窗', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: detail })
    mockPost.mockResolvedValue({ kind: 'accepted', data: { taskId: 'task-1', status: 'pending' } })
    const wrapper = mount(JointManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('取消活动'))!.trigger('click')
    await wrapper.find('.hrc-confirm').trigger('click')
    await flushPromises()
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('已受理'))
    expect(wrapper.find('.hrc').exists()).toBe(false)
    wrapper.unmount()
  })

  it('取消活动遇并发冲突等未分类错误：兜底提示而非静默', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: detail })
    mockPost.mockResolvedValue({ kind: 'concurrency_conflict', error: { code: 'IFC-ERR-008', message: '数据已变更' }, currentData: {} })
    const wrapper = mount(JointManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('取消活动'))!.trigger('click')
    await wrapper.find('.hrc-confirm').trigger('click')
    await flushPromises()
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('操作失败'))
    wrapper.unmount()
  })
})
