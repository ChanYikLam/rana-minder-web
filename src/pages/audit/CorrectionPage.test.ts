import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({ mockToastSuccess: vi.fn(), mockToastError: vi.fn() }))
const routeState = vi.hoisted(() => ({ value: { path: '/me/corrections', meta: { view: 'self' }, params: {} } }))
vi.mock('vue-router', () => ({
  useRoute: () => routeState.value,
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}))
vi.mock('@/utils/toastError', () => ({
  toastError: mockToastError,
}))

import CorrectionPage from './CorrectionPage.vue'

const correction = {
  id: 'c-1', targetType: 'application', targetId: 'app-1', reason: '状态显示错误',
  evidence: '截图', status: 'pending', submittedAt: '2026-08-01T04:00:00Z', submitterName: '张三',
}

describe('CorrectionPage 事实纠错', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockToastSuccess.mockReset()
    mockToastError.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('个人视图：加载纠错列表', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [correction] } })
    const wrapper = mount(CorrectionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/me/corrections')
    expect(wrapper.text()).toContain('状态显示错误')
  })

  it('空列表：展示空态', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
    const wrapper = mount(CorrectionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('暂无')
  })

  it('加载失败：不渲染列表', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(CorrectionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('状态显示错误')
  })

  it('加载失败后重试恢复：错误态点重试成功渲染列表', async () => {
    // 局部 stub 暴露 PageStateBoundary 的 retry 事件（共享 pageStubs 不含，避免影响其他文件）
    mockGet.mockResolvedValueOnce({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [correction] } })
    const wrapper = mount(CorrectionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('状态显示错误')

    await wrapper.find('.psb-retry').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('状态显示错误')
    wrapper.unmount()
  })

  it('提交纠错成功：发送表单并展示提交提示', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(CorrectionPage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 打开提交表单并填写
    await wrapper.findAll('button').find((b) => b.text().includes('发起纠错'))!.trigger('click')
    const inputs = wrapper.findAll('input[type="text"]')
    await inputs[0].setValue('成员信息')
    await inputs[1].setValue('mem-001')
    await inputs[2].setValue('手机号有误')
    await inputs[3].setValue('截图')
    await wrapper.findAll('button').find((b) => b.text().includes('提交纠错'))!.trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/me/corrections', {
      targetType: '成员信息', targetId: 'mem-001', reason: '手机号有误', evidence: '截图',
    })
    expect(mockToastSuccess).toHaveBeenCalledWith('纠错申请已提交，等待审核')
    wrapper.unmount()
  })

  it('overdue 状态：审批视角显示批准/拒绝按钮（SM-AUD-001 允许 overdue -> approve/reject）', async () => {
    routeState.value = { path: '/org/club-001/corrections', meta: { view: 'manage' }, params: { clubId: 'club-001' } }
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [{ ...correction, status: 'overdue' }] } })
    const wrapper = mount(CorrectionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.findAll('button').some((b) => b.text().includes('批准'))).toBe(true)
    expect(wrapper.findAll('button').some((b) => b.text().includes('拒绝'))).toBe(true)
    wrapper.unmount()
    routeState.value = { path: '/me/corrections', meta: { view: 'self' }, params: {} }
  })

  it('overdue 状态：本人视角显示撤回按钮（SM-AUD-001 允许 overdue -> withdraw）', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [{ ...correction, status: 'overdue' }] } })
    const wrapper = mount(CorrectionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.findAll('button').some((b) => b.text().includes('撤回申请'))).toBe(true)
    wrapper.unmount()
  })
})
