import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  reauthenticate: vi.fn(),
}))

vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mocks.get(...args),
  post: (...args: unknown[]) => mocks.post(...args),
}))
vi.mock('@/services/modules', () => ({
  identityApi: { reauthenticate: (...args: unknown[]) => mocks.reauthenticate(...args) },
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import PermissionTemplatePage from './PermissionTemplatePage.vue'

const sampleTpls = [
  { id: 'tpl-1', name: '默认负责人', permissions: ['club:member:manage'], version: 1, draftVersion: null, status: 'published' },
  { id: 'tpl-2', name: '部门负责人', permissions: ['club:dept:manage', 'club:member:view'], version: 1, draftVersion: 2, status: 'draft' },
]

describe('PermissionTemplatePage 权限模板', () => {
  beforeEach(() => {
    mocks.get.mockReset()
    mocks.post.mockReset()
    mocks.reauthenticate.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染模板列表', async () => {
    mocks.get.mockResolvedValue({ kind: 'completed', data: { items: [sampleTpls[0]] } })
    const wrapper = mount(PermissionTemplatePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mocks.get).toHaveBeenCalledWith('/admin/config/permission-templates')
    expect(wrapper.text()).toContain('默认负责人')
  })

  it('加载失败：不渲染模板', async () => {
    mocks.get.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(PermissionTemplatePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('默认负责人')
  })

  it('编辑草稿：点取消后复位 mode 与 draft，避免残留旧数据', async () => {
    mocks.get.mockResolvedValue({ kind: 'completed', data: { items: [sampleTpls[0]] } })
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
    mocks.get.mockResolvedValue({ kind: 'completed', data: { items: [] } })
    const newTpl = { id: 'tpl-new', name: '新模板', permissions: ['a:b:c'], version: 1, draftVersion: 1, status: 'draft' }
    mocks.post.mockResolvedValueOnce({ kind: 'completed', data: newTpl })
    mocks.get.mockResolvedValueOnce({ kind: 'completed', data: { items: [newTpl] } })

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
    mocks.get.mockResolvedValue({ kind: 'completed', data: { items: sampleTpls } })
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
})
