import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

// 使用 vi.hoisted 确保 mock 函数在 vi.mock 工厂之前可用
const { mockGet, mockPost, mockPush } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPush: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001', formId: 'form-001' }, path: '/org/club-001/forms/designer/form-001', meta: {} }),
  useRouter: () => ({ push: mockPush }),
  onBeforeRouteLeave: () => {},
}))

vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({ mockToastSuccess: vi.fn(), mockToastError: vi.fn() }))
vi.mock('vue-sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}))

import FormDesignerPage from './FormDesignerPage.vue'

const commonStubs = {
  PageStateBoundary: { template: '<div><slot /></div>' },
  Card: { template: '<div class="card"><slot /></div>' },
}

function mockDesigner(status: string, version = 1, fields = [{ id: 'f1', type: 'text', label: '姓名', required: true, readonly: false, permission: 'read_write', options: null, description: null }]) {
  return {
    id: 'form-001',
    title: '招新报名表',
    status,
    version,
    fields,
  }
}

/** 渲染组件并等待首屏数据加载完成 */
async function mountPage(status: string, version = 1) {
  mockGet.mockResolvedValueOnce({ kind: 'completed' as const, data: mockDesigner(status, version) })
  const wrapper = mount(FormDesignerPage, { global: { stubs: commonStubs } })
  await flushPromises()
  await nextTick()
  return wrapper
}

describe('FormDesignerPage P2-1：发布按钮状态收敛（SM-FORM-001）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('draft 态：展示发布按钮', async () => {
    const wrapper = await mountPage('draft')
    const publishBtn = wrapper.findAll('button').find((b) => b.text().includes('发布'))
    expect(publishBtn).toBeTruthy()
  })

  it('published 态：不展示发布按钮（已发布不可再发布）', async () => {
    const wrapper = await mountPage('published')
    const publishBtn = wrapper.findAll('button').find((b) => b.text().includes('发布'))
    expect(publishBtn).toBeUndefined()
    // 停用/克隆按钮仍可见
    expect(wrapper.text()).toContain('停用')
    expect(wrapper.text()).toContain('克隆')
  })

  it('deprecated 态：不展示发布按钮（停用后需先复用）', async () => {
    const wrapper = await mountPage('deprecated')
    const publishBtn = wrapper.findAll('button').find((b) => b.text().includes('发布'))
    expect(publishBtn).toBeUndefined()
    // 复用/克隆按钮仍可见
    expect(wrapper.text()).toContain('复用')
    expect(wrapper.text()).toContain('克隆')
  })

  it('字段操作：添加字段、编辑标签/必填/权限、删除字段', async () => {
    const wrapper = await mountPage('draft')
    // 从字段库添加"短文本"
    const addBtn = wrapper.findAll('button').find((b) => b.text().includes('短文本'))
    expect(addBtn, '字段库短文本按钮').toBeTruthy()
    await addBtn!.trigger('click')
    expect(wrapper.text()).toContain('新字段')
    // 新字段自动选中，属性配置面板出现
    expect(wrapper.text()).toContain('字段标签')

    // 编辑标签（定位"属性配置"面板卡，避免依赖卡片排列索引）
    const cards = wrapper.findAll('.card')
    const propCard = cards.find((c) => c.text().includes('属性配置'))
    expect(propCard, '属性配置面板').toBeTruthy()
    const labelInput = propCard!.find('input[type="text"]')
    await labelInput.setValue('联系手机')
    await nextTick()
    expect(wrapper.text()).toContain('联系手机')

    // 勾选必填（checkbox @change）
    const requiredBox = propCard!.find('input[type="checkbox"]')
    await requiredBox.setValue(true)
    await nextTick()

    // 删除新字段（新加的字段位于画布最后一行，取画布卡内最后一个删除按钮）
    const canvasCard = cards.find((c) => c.text().includes('表单画布'))
    expect(canvasCard, '表单画布').toBeTruthy()
    const canvasButtons = canvasCard!.findAll('button')
    const removeBtn = canvasButtons[canvasButtons.length - 1]
    expect(removeBtn, '删除字段按钮').toBeTruthy()
    await removeBtn!.trigger('click')
    expect(wrapper.text()).not.toContain('联系手机')
    wrapper.unmount()
  })

  it('保存成功：提交新版本并提示', async () => {
    const wrapper = await mountPage('draft', 2)
    mockPost.mockResolvedValue({ kind: 'completed' as const, data: { version: 3, status: 'draft' } })
    await wrapper.findAll('button').find((b) => b.text().includes('保存'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/forms/designer/form-001/save', expect.objectContaining({ version: 3, expectedVersion: 2 }))
    expect(mockToastSuccess).toHaveBeenCalledWith('表单已保存（v3）')
    expect(wrapper.text()).toContain('v3')
    wrapper.unmount()
  })

  it('保存版本冲突：提示刷新重试', async () => {
    const wrapper = await mountPage('draft')
    mockPost.mockResolvedValue({ kind: 'concurrency_conflict' as const, error: { code: 'IFC-ERR-008', message: '表单已被其他操作修改' } })
    await wrapper.findAll('button').find((b) => b.text().includes('保存'))!.trigger('click')
    await flushPromises()
    expect(mockToastError).toHaveBeenCalledWith('表单已被其他操作修改')
    wrapper.unmount()
  })

  it('发布成功：调用 publish 并重载（draft → published）', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: mockDesigner('draft', 1) })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: mockDesigner('published', 1) })
    const wrapper = mount(FormDesignerPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    await wrapper.findAll('button').find((b) => b.text().includes('发布'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/forms/designer/form-001/publish', { version: 1 })
    expect(mockToastSuccess).toHaveBeenCalledWith('表单 v1 已发布')
    // 重载后显示已发布状态，发布按钮消失
    expect(wrapper.text()).toContain('已发布')
    expect(wrapper.findAll('button').find((b) => b.text().includes('发布'))).toBeUndefined()
    wrapper.unmount()
  })

  it('发布失败：展示后端错误且仍为草稿态', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: mockDesigner('draft', 1) })
    mockPost.mockResolvedValue({ kind: 'rejected' as const, error: { code: 'IFC-ERR-009', message: '存在必填字段未配置选项' } })
    const wrapper = mount(FormDesignerPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    await wrapper.findAll('button').find((b) => b.text().includes('发布'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/forms/designer/form-001/publish', { version: 1 })
    expect(mockToastError).toHaveBeenCalledWith('存在必填字段未配置选项')
    // 未重载，仍为草稿态且发布按钮保留
    expect(wrapper.text()).toContain('草稿')
    expect(wrapper.findAll('button').find((b) => b.text().includes('发布'))).toBeTruthy()
    wrapper.unmount()
  })

  it('未保存更改时发布被拦截（P1-17）', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: mockDesigner('draft', 1) })
    const wrapper = mount(FormDesignerPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    // 修改字段触发 dirty → 发布被拦截且不发请求
    const addBtn = wrapper.findAll('button').find((b) => b.text().includes('短文本'))
    await addBtn!.trigger('click')
    await nextTick()
    await wrapper.findAll('button').find((b) => b.text().includes('发布'))!.trigger('click')
    await flushPromises()
    expect(mockPost).not.toHaveBeenCalled()
    expect(mockToastError).toHaveBeenCalledWith('存在未保存的更改，请先保存后再发布')
    wrapper.unmount()
  })

  it('空标签字段发布被拦截（P2-62）', async () => {
    mockGet.mockResolvedValueOnce({
      kind: 'completed' as const,
      data: mockDesigner('draft', 1, [{ id: 'f1', type: 'text', label: '', required: false, readonly: false, permission: 'read_write', options: null, description: null }]),
    })
    const wrapper = mount(FormDesignerPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    await wrapper.findAll('button').find((b) => b.text().includes('发布'))!.trigger('click')
    await flushPromises()
    expect(mockPost).not.toHaveBeenCalled()
    expect(mockToastError).toHaveBeenCalledWith('存在未填写标签的字段，请完善后再发布')
    wrapper.unmount()
  })

  it('生命周期：停用 published → 克隆 → 复用 deprecated → draft', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: mockDesigner('published', 1) })
    mockPost.mockResolvedValueOnce({ kind: 'completed', data: {} })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: mockDesigner('deprecated', 1) })
    const wrapper = mount(FormDesignerPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    // 停用（published → deprecated）
    await wrapper.findAll('button').find((b) => b.text().includes('停用'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/forms/designer/form-001/deprecate', {})
    expect(wrapper.text()).toContain('已停用')

    // 克隆（deprecated 态有克隆按钮；返回新 id 时跳转）
    mockPost.mockResolvedValueOnce({ kind: 'completed', data: { id: 'form-002' } })
    await wrapper.findAll('button').find((b) => b.text().includes('克隆'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/forms/designer/form-001/clone', { title: '招新报名表（副本）' })
    expect(mockPush).toHaveBeenCalledWith('/org/club-001/forms/designer/form-002')

    // 复用（deprecated → draft）
    mockPost.mockResolvedValueOnce({ kind: 'completed', data: {} })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: mockDesigner('draft', 1) })
    await wrapper.findAll('button').find((b) => b.text().includes('复用'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/forms/designer/form-001/reuse', {})
    expect(wrapper.text()).toContain('草稿')
    // draft 态展示发布按钮，停用/克隆按钮消失
    expect(wrapper.findAll('button').find((b) => b.text().includes('发布'))).toBeTruthy()
    wrapper.unmount()
  })
})
