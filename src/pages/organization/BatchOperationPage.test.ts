import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import BatchOperationPage from './BatchOperationPage.vue'

describe('BatchOperationPage 批量操作', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染批量类型选项与步骤一', async () => {
    // 调用顺序：candidates（Once）→ interviewers（默认）
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ memberId: 'mem-001', name: '陈雨桐' }] } })
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [{ id: 'u1', name: '李思颖' }] } })
    const wrapper = mount(BatchOperationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/batch/candidates', undefined, expect.anything())
    expect(wrapper.text()).toContain('1. 选择类型')
    expect(wrapper.text()).toContain('批量分配面试官')
    expect(wrapper.text()).toContain('批量发送邀请')
    wrapper.unmount()
  })

  it('候选加载失败：选择类型进入预览后展示加载失败提示', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(BatchOperationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    // 选择批量类型进入预览步骤后才展示候选加载失败区域（类型为可点击卡片）
    const typeCard = wrapper.findAll('.card').find((c) => c.text().includes('批量分配面试官'))
    expect(typeCard).toBeTruthy()
    await typeCard!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('候选人列表加载失败')
    wrapper.unmount()
  })

  it('批量执行：接重认证组件，填原因 → 确认 → 携带 reauthProof 调用', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ id: 'mem-001', name: '陈雨桐', studentId: '2025001', department: '计算机', status: 'pending' }] } })
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [{ id: 'u1', name: '李思颖' }] } })
    mockPost.mockResolvedValue({ kind: 'completed', data: { results: [{ memberId: 'mem-001', success: true, message: '已处理' }] } })
    const wrapper = mount(BatchOperationPage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 选择类型进入预览
    const typeCard = wrapper.findAll('.card').find((c) => c.text().includes('批量发送邀请'))
    await typeCard!.trigger('click')
    await flushPromises()
    // 勾选候选人
    const checkbox = wrapper.find('input[type="checkbox"]')
    await checkbox.setValue(true)
    await flushPromises()
    // 点击 BatchActionBar 的执行按钮 → 打开高危确认
    const actionBar = wrapper.findComponent({ name: 'BatchActionBar' })
    await actionBar.vm.$emit('execute')
    await flushPromises()

    const hrc = wrapper.find('.hrc')
    expect(hrc.exists(), '批量执行高危确认弹窗').toBe(true)
    // 空原因点确认被拦截
    await hrc.find('.hrc-confirm').trigger('click')
    await flushPromises()
    expect(hrc.text()).toContain('请填写批量执行原因')
    expect(mockPost).not.toHaveBeenCalled()

    // 填原因后确认
    const reasonInput = hrc.find('input[placeholder*="执行原因"]')
    expect(reasonInput.exists(), '原因输入').toBe(true)
    await reasonInput.setValue('社团开放日集中发送邀请')
    await hrc.find('.hrc-confirm').trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/org/club-001/batch/execute', expect.objectContaining({
      action: 'send_invitation',
      memberIds: ['mem-001'],
      reason: '社团开放日集中发送邀请',
      reauthProof: 'mock-reauth-proof',
    }))
    wrapper.unmount()
  })
})
