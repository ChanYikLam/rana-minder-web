import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost, mockReauthenticate, mockToastSuccess, mockToastError, mockToastInfo } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockReauthenticate: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockToastInfo: vi.fn(),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('@/services/modules', () => ({
  identityApi: { reauthenticate: (...args: unknown[]) => mockReauthenticate(...args) },
}))
vi.mock('vue-sonner', () => ({
  toast: { success: (...a: unknown[]) => mockToastSuccess(...a), error: (...a: unknown[]) => mockToastError(...a), info: (...a: unknown[]) => mockToastInfo(...a) },
}))

import PermissionTemplatePage from './PermissionTemplatePage.vue'

const sampleTpls = [
  { id: 'tpl-1', name: '默认负责人', permissions: ['club:member:manage'], version: 1, draftVersion: null, status: 'published' },
  { id: 'tpl-2', name: '部门负责人', permissions: ['club:dept:manage', 'club:member:view'], version: 1, draftVersion: 2, status: 'draft' },
]

const draftTemplate = {
  id: 'tpl-1', name: '默认负责人', permissions: ['club:member:manage'], status: 'draft', version: 1, draftVersion: 2,
}

describe('PermissionTemplatePage 权限模板', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockReauthenticate.mockReset()
    mockToastSuccess.mockReset()
    mockToastError.mockReset()
    mockToastInfo.mockReset()
    vi.clearAllMocks()
    // reauth 默认成功：隔离发布流程副作用（与 dev 发布用例共用，走 identityApi mock）
    mockReauthenticate.mockResolvedValue({ kind: 'completed', data: { proof: 'proof-1', expiresAt: '' } })
  })
  afterEach(() => vi.restoreAllMocks())

  function mountPage() {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [draftTemplate] } })
    return mount(PermissionTemplatePage, { global: { stubs: pageStubs } })
  }

  it('加载成功：渲染模板列表', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [sampleTpls[0]] } })
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

  it('编辑草稿：点取消后复位 mode 与 draft，避免残留旧数据', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [sampleTpls[0]] } })
    const wrapper = mount(PermissionTemplatePage, { global: { stubs: pageStubs } })
    await flushPromises()

    const listCards = wrapper.findAll('.card')
    expect(listCards.length).toBeGreaterThan(0)
    await listCards[0].trigger('click')
    await flushPromises()

    const buttons = wrapper.findAll('button')
    const editBtn = buttons.find((b) => b.text().includes('编辑'))
    expect(editBtn).toBeTruthy()
    await editBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('编辑草稿')

    const cancelBtn = wrapper.findAll('button').find((b) => b.text() === '取消')
    expect(cancelBtn).toBeTruthy()
    await cancelBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('编辑草稿')
  })

  it('创建模板成功后复位 mode 与 draft', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
    const newTpl = { id: 'tpl-new', name: '新模板', permissions: ['a:b:c'], version: 1, draftVersion: 1, status: 'draft' }
    mockPost.mockResolvedValueOnce({ kind: 'completed', data: newTpl })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [newTpl] } })

    const wrapper = mount(PermissionTemplatePage, { global: { stubs: pageStubs } })
    await flushPromises()

    const newBtn = wrapper.findAll('button').find((b) => b.text().includes('新建模板'))
    expect(newBtn).toBeTruthy()
    await newBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('新建权限模板')

    await wrapper.find('input[type="text"]').setValue('新模板')
    await wrapper.find('textarea').setValue('a:b:c')
    await flushPromises()

    const createBtn = wrapper.findAll('button').find((b) => b.text().includes('创建草稿'))
    expect(createBtn).toBeTruthy()
    await createBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('新模板')
  })

  it('切换模板：编辑态在切换后不再渲染（避免与新模板详情卡互相覆盖）', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: sampleTpls } })
    const wrapper = mount(PermissionTemplatePage, { global: { stubs: pageStubs } })
    await flushPromises()

    const listCards = wrapper.findAll('.card')
    await listCards[0].trigger('click')
    await flushPromises()

    const editBtn = wrapper.findAll('button').find((b) => b.text().includes('编辑'))
    await editBtn!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('编辑草稿')

    const refreshed = wrapper.findAll('.card')
    await refreshed[1].trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('编辑草稿')
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
