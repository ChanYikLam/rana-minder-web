import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { toast } from 'vue-sonner'
import RetentionPage from './RetentionPage.vue'

describe('RetentionPage 数据保留策略', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染保留策略', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { policies: [{ id: 'rt-1', scope: 'application', retentionDays: 180, action: 'archive' }] },
    })
    const wrapper = mount(RetentionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/admin/retention')
    expect(wrapper.text()).toContain('application')
    expect(wrapper.text()).toContain('180')
  })

  it('加载失败：不渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(RetentionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('180')
  })

  it('执行保留策略被 202 异步受理：提示已受理并关闭执行弹窗，不误报失败', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { policies: [{ id: 'rt-1', scope: 'application', retentionDays: 180, action: 'archive', status: 'draft', version: 1, updatedAt: '2026-08-01', publishedAt: null }] },
    })
    mockPost.mockResolvedValue({ kind: 'accepted', data: { taskId: 'task-1', status: 'pending' } })
    const wrapper = mount(RetentionPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('立即执行'))!.trigger('click')
    expect(wrapper.find('.hrc').exists()).toBe(true)
    await wrapper.find('.hrc-confirm').trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/admin/retention/execute', expect.objectContaining({ reauthProof: 'mock-reauth-proof' }))
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('已受理'))
    expect(toast.error).not.toHaveBeenCalled()
    expect(wrapper.find('.hrc').exists()).toBe(false)
    wrapper.unmount()
  })

  it('执行保留策略失败：错误传入弹窗展示而非永久卡“正在执行”', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { policies: [{ id: 'rt-1', scope: 'application', retentionDays: 180, action: 'archive', status: 'draft', version: 1, updatedAt: '2026-08-01', publishedAt: null }] },
    })
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: '执行被中断' } })
    const wrapper = mount(RetentionPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('立即执行'))!.trigger('click')
    await wrapper.find('.hrc-confirm').trigger('click')
    await flushPromises()
    expect(wrapper.find('.hrc').exists()).toBe(true)
    expect(wrapper.find('.hrc').text()).toContain('执行被中断')
    wrapper.unmount()
  })

  it('草稿发布流被异步受理（accepted）：提示已受理并刷新列表', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { policies: [{ id: 'rt-draft', scope: '新策略', retentionDays: 90, action: 'clean', status: 'draft', version: 1, updatedAt: '', publishedAt: null }] },
    })
    const wrapper = mount(RetentionPage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 重新验证身份（mock reauth）
    mockPost.mockResolvedValueOnce({ kind: 'completed', data: { proof: 'proof-1', expiresAt: '' } })
    const reauthBtn = wrapper.findAll('button').find((b) => b.text().includes('重新验证身份'))
    expect(reauthBtn, '未找到重新验证身份按钮').toBeTruthy()
    await reauthBtn!.trigger('click')
    await flushPromises()

    // 预览影响
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { scope: '新策略', fromDays: null, toDays: 90, action: 'clean', affectedObjects: { records: 10, members: 3 }, bufferDays: 0, previewVersion: 1 },
    })
    const previewBtn = wrapper.findAll('button').find((b) => b.text().includes('预览影响'))
    expect(previewBtn, '未找到预览影响按钮').toBeTruthy()
    await previewBtn!.trigger('click')
    await flushPromises()

    // 填写发布原因
    const textarea = wrapper.find('textarea')
    await textarea.setValue('缩短保留期限，定期清理临时数据')

    // 点击确认发布，弹出 HighRiskConfirm 并确认 → mock accepted
    mockPost.mockResolvedValue({ kind: 'accepted', data: { taskId: 't-1', status: 'processing' } })
    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('确认发布'))
    expect(confirmBtn, '未找到确认发布按钮').toBeTruthy()
    await confirmBtn!.trigger('click')
    await flushPromises()

    const hrcConfirm = wrapper.find('.hrc-confirm')
    expect(hrcConfirm.exists(), '未找到 HighRiskConfirm 确认按钮').toBe(true)
    await hrcConfirm.trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith(
      '/admin/retention/rt-draft/publish',
      expect.objectContaining({ reason: '缩短保留期限，定期清理临时数据', reauthProof: 'proof-1', previewVersion: 1 }),
    )
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('已受理'))
    expect(mockGet).toHaveBeenCalledWith('/admin/retention')
  })
})
