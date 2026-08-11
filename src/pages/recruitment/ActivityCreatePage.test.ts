import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost, mockPush } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn(), mockPush: vi.fn() }))
const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({ mockToastSuccess: vi.fn(), mockToastError: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001' } }),
  useRouter: () => ({ push: mockPush }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}))

import ActivityCreatePage from './ActivityCreatePage.vue'

describe('ActivityCreatePage 创建招新活动', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockToastSuccess.mockReset()
    mockToastError.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载已发布表单供选择', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'form-1', title: '报名表', status: 'published' }, { id: 'form-2', title: '草稿表', status: 'draft' }] },
    })
    const wrapper = mount(ActivityCreatePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/forms')
    expect(wrapper.text()).toContain('报名表')
    // 草稿表单不展示
    expect(wrapper.text()).not.toContain('草稿表')
  })

  it('表单加载失败：展示错误态', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(ActivityCreatePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('创建招新活动')
  })

  it('步骤守卫：未填必填项时下一步禁用', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
    const wrapper = mount(ActivityCreatePage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 未填标题/截止时禁用
    const nextBtn = wrapper.findAll('button').find((b) => b.text().includes('下一步'))
    expect(nextBtn!.attributes('disabled'), '未填必填项禁用').toBeDefined()

    // 填写后可用
    await wrapper.find('#title').setValue('秋季招新')
    await wrapper.find('#deadline').setValue('2026-09-01T00:00')
    await flushPromises()
    expect(nextBtn!.attributes('disabled'), '填完必填项可用').toBeUndefined()
    wrapper.unmount()
  })

  it('完整流程：四步向导创建活动并跳转', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'form-1', title: '报名表', status: 'published' }] },
    })
    mockPost.mockResolvedValue({ kind: 'completed', data: { id: 'act-9' } })
    const wrapper = mount(ActivityCreatePage, { global: { stubs: pageStubs } })
    await flushPromises()

    // Step 1 → Step 2
    await wrapper.find('#title').setValue('秋季招新')
    await wrapper.find('#deadline').setValue('2026-09-01T00:00')
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    expect(wrapper.text()).toContain('报名表单')

    // Step 2：选择表单 → Step 3
    await wrapper.find('input[type="radio"]').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    expect(wrapper.text()).toContain('招新方向')

    // Step 3：添加部门 → Step 4
    const deptInput = wrapper.find('input[placeholder="输入方向名称"]')
    await deptInput.setValue('技术部')
    await wrapper.findAll('button').find((b) => b.text().includes('添加'))!.trigger('click')
    expect(wrapper.text()).toContain('技术部')
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    expect(wrapper.text()).toContain('预览确认')
    expect(wrapper.text()).toContain('秋季招新')
    expect(wrapper.text()).toContain('报名表')

    // 发布
    await wrapper.findAll('button').find((b) => b.text().includes('发布活动'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/recruitment', expect.objectContaining({ title: '秋季招新', formId: 'form-1', departments: [{ id: expect.any(String), name: '技术部' }] }))
    // P2-22：deadline 由 datetime-local 本地值转为 ISO 契约（不再原样发送）
    expect((mockPost.mock.calls[0]![1] as { deadline: string }).deadline).toMatch(/Z$/)
    expect(mockPush).toHaveBeenCalledWith('/org/club-001/recruitment/act-9')
    wrapper.unmount()
  })

  it('发布失败：展示错误提示不跳转', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [{ id: 'form-1', title: '报名表', status: 'published' }] } })
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'PUB-001', message: 'x' } })
    const wrapper = mount(ActivityCreatePage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.find('#title').setValue('秋季招新')
    await wrapper.find('#deadline').setValue('2026-09-01T00:00')
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    await wrapper.find('input[type="radio"]').trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    const deptInput = wrapper.find('input[placeholder="输入方向名称"]')
    await deptInput.setValue('技术部')
    await wrapper.findAll('button').find((b) => b.text().includes('添加'))!.trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('发布活动'))!.trigger('click')
    await flushPromises()
    // P2-23：展示服务端 error.message（'x'）而非仅 fallback
    expect(mockToastError).toHaveBeenCalledWith('x')
    expect(mockPush).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
