import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost, mockRoute, mockPush } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockRoute: { params: { clubId: 'club-001', jointId: 'jnt-1' }, meta: { mode: 'manage' as 'manage' | 'create' } },
  mockPush: vi.fn(),
}))
const { mockToastError } = vi.hoisted(() => ({ mockToastError: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: mockPush }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: mockToastError, info: vi.fn() },
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
    mockPush.mockReset()
    mockToastError.mockReset()
    mockRoute.meta.mode = 'manage'
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

  it('draft 状态不显示“发布活动”按钮（SM-JNT-001 需先 confirm_all -> confirmed）', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { ...detail, status: 'draft' } })
    const wrapper = mount(JointManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.findAll('button').some((b) => b.text().includes('发布活动'))).toBe(false)
    wrapper.unmount()
  })

  it('confirmed 状态显示“发布活动”按钮（可 first_publish）', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { ...detail, status: 'confirmed' } })
    const wrapper = mount(JointManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.findAll('button').some((b) => b.text().includes('发布活动'))).toBe(true)
    wrapper.unmount()
  })

  it('取消活动成功后关闭弹窗并置 succeeded（避免 HighRiskConfirm 永久转圈）', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: detail })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(JointManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    const cancelBtn = wrapper.findAll('button').find((b) => b.text().includes('取消活动'))
    expect(cancelBtn).toBeDefined()
    await cancelBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.find('.hrc').exists()).toBe(true)

    const confirmBtn = wrapper.find('.hrc-confirm')
    expect(confirmBtn.exists()).toBe(true)
    await confirmBtn.trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/org/club-001/joint/jnt-1/cancel', { confirm: true, reason: '发起方取消联合活动' })
    expect(wrapper.find('.hrc').exists()).toBe(false)

    wrapper.unmount()
  })

  it('创建态：成功后跳转详情页', async () => {
    mockRoute.meta.mode = 'create'
    mockPost.mockResolvedValue({ kind: 'completed', data: { id: 'jnt-new' } })
    const wrapper = mount(JointManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    expect(wrapper.text()).toContain('发起联合活动')

    await wrapper.find('input[type="text"]').setValue('计算机+电子联合招新')
    await wrapper.find('input[type="datetime-local"]').setValue('2026-09-01T00:00')
    await flushPromises()

    const createBtn = wrapper.findAll('button').find((b) => b.text().includes('创建联合活动'))
    expect(createBtn).toBeDefined()
    await createBtn!.trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/org/club-001/joint', expect.objectContaining({ title: '计算机+电子联合招新' }))
    expect(mockPush).toHaveBeenCalledWith('/org/club-001/joint/jnt-new')
    expect(mockToastError).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('创建失败：toast 错误提示且不跳转（之前 kind!==completed 完全静默）', async () => {
    mockRoute.meta.mode = 'create'
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'JNT-001', message: '标题重复' } })
    const wrapper = mount(JointManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.find('input[type="text"]').setValue('计算机+电子联合招新')
    await wrapper.find('input[type="datetime-local"]').setValue('2026-09-01T00:00')
    await flushPromises()

    const createBtn = wrapper.findAll('button').find((b) => b.text().includes('创建联合活动'))
    expect(createBtn).toBeDefined()
    await createBtn!.trigger('click')
    await flushPromises()

    expect(mockToastError).toHaveBeenCalledWith('标题重复')
    expect(mockPush).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('创建失败：服务端 message 缺失时回退到「创建失败，请稍后重试」', async () => {
    mockRoute.meta.mode = 'create'
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'JNT-001' } })
    const wrapper = mount(JointManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.find('input[type="text"]').setValue('计算机+电子联合招新')
    await wrapper.find('input[type="datetime-local"]').setValue('2026-09-01T00:00')
    await flushPromises()

    const createBtn = wrapper.findAll('button').find((b) => b.text().includes('创建联合活动'))
    expect(createBtn).toBeDefined()
    await createBtn!.trigger('click')
    await flushPromises()

    expect(mockToastError).toHaveBeenCalledWith('创建失败，请稍后重试')
    expect(mockPush).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
