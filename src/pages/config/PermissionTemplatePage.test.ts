import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost, mockToastSuccess, mockToastError, mockToastInfo } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockToastInfo: vi.fn(),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: (...a: unknown[]) => mockToastSuccess(...a), error: (...a: unknown[]) => mockToastError(...a), info: (...a: unknown[]) => mockToastInfo(...a) },
}))

import PermissionTemplatePage from './PermissionTemplatePage.vue'

const draftTemplate = {
  id: 'tpl-1', name: '默认负责人', permissions: ['club:member:manage'], status: 'draft', version: 1, draftVersion: 2,
}

describe('PermissionTemplatePage 权限模板', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockToastSuccess.mockReset()
    mockToastError.mockReset()
    mockToastInfo.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  function mountPage() {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [draftTemplate] } })
    return mount(PermissionTemplatePage, { global: { stubs: pageStubs } })
  }

  it('加载成功：渲染模板列表', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'tpl-1', name: '默认负责人', permissions: ['club:member:manage'], status: 'published', version: 1 }] },
    })
    const wrapper = mount(PermissionTemplatePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/admin/config/permission-templates')
    expect(wrapper.text()).toContain('默认负责人')
  })

  it('加载失败：不渲染模板', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(PermissionTemplatePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('默认负责人')
  })

  it('发布草稿被异步受理（accepted）：提示已受理并刷新列表', async () => {
    const wrapper = mountPage()
    await flushPromises()

    // 选中草稿模板，进入发布流程（重新认证 + 预览差异）
    const card = wrapper.findAll('.card').find((c) => c.text().includes('默认负责人'))
    await card!.trigger('click')
    await flushPromises()

    // 重新验证身份（mock reauth）
    const reauthBtn = wrapper.findAll('button').find((b) => b.text().includes('重新验证身份'))
    expect(reauthBtn, '未找到重新验证身份按钮').toBeTruthy()
    mockPost.mockResolvedValueOnce({ kind: 'completed', data: { proof: 'proof-1', expiresAt: '' } })
    await reauthBtn!.trigger('click')
    await flushPromises()

    // 预览差异
    const previewBtn = wrapper.findAll('button').find((b) => b.text().includes('预览差异'))
    expect(previewBtn, '未找到预览差异按钮').toBeTruthy()
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { added: ['club:member:manage'], removed: [], affectedGroups: ['技术部'], affectedMembers: 12, previewVersion: 1 },
    })
    await previewBtn!.trigger('click')
    await flushPromises()

    // 填写发布原因
    const textarea = wrapper.find('textarea')
    await textarea.setValue('安全加固，收紧权限范围')

    // 确认发布 → mock accepted
    mockPost.mockResolvedValue({ kind: 'accepted', data: { taskId: 't-1', status: 'processing' } })
    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('确认发布草稿'))
    expect(confirmBtn, '未找到确认发布草稿按钮').toBeTruthy()
    await confirmBtn!.trigger('click')
    await flushPromises()

    // 弹出 HighRiskConfirm，点击确认
    const hrcConfirm = wrapper.find('.hrc-confirm')
    expect(hrcConfirm.exists(), '未找到 HighRiskConfirm 确认按钮').toBe(true)
    await hrcConfirm.trigger('click')
    await flushPromises()

    // HighRiskConfirm stub 的 confirm 会触发 handlePublish
    expect(mockPost).toHaveBeenCalledWith(
      '/admin/config/permission-templates/tpl-1/publish',
      expect.objectContaining({ reason: '安全加固，收紧权限范围', reauthProof: 'proof-1', previewVersion: 1 }),
    )
    expect(mockToastInfo).toHaveBeenCalledWith('发布已受理，正在后台处理')
    // accepted 后刷新列表（loadData 再次 get）
    expect(mockGet).toHaveBeenCalledWith('/admin/config/permission-templates')
  })
})
