import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

// 使用 vi.hoisted 确保 mock 函数在 vi.mock 工厂之前可用
const { mockGet, mockPost, mockPush, mockBack } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPush: vi.fn(),
  mockBack: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { activityId: 'act-001' }, meta: {} }),
  useRouter: () => ({ push: mockPush, back: mockBack }),
}))

vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import ApplicationPage from './ApplicationPage.vue'

// 通用 mock 数据
const mockActivity = { id: 'act-001', title: '测试活动', clubName: '测试社团', deadline: '2099-12-31T23:59:59Z', departments: [{ id: 'dept-1', name: '技术部' }], formId: 'form-001' }
const mockFormFields = [{ id: 'f1', type: 'text', label: '姓名', description: null, required: true, readonly: false, permission: 'read_write', options: null }]

function mockApplication(status: string, extra: Record<string, unknown> = {}) {
  return { status, answers: {}, preferences: [], recoveryWindowDeadline: null, ...extra }
}

/** 设置 mock 返回值 */
function setupGetMocks(applicationStatus: string | null, applicationExtra: Record<string, unknown> = {}) {
  mockGet.mockReset()
  // 第一次 get：活动详情
  mockGet.mockResolvedValueOnce({ kind: 'completed' as const, data: mockActivity })
  // 第二次 get：表单字段
  mockGet.mockResolvedValueOnce({ kind: 'completed' as const, data: { versions: [{ fields: mockFormFields }] } })
  // 第三次 get：我的申请
  if (applicationStatus) {
    mockGet.mockResolvedValueOnce({ kind: 'completed' as const, data: mockApplication(applicationStatus, applicationExtra) })
  } else {
    mockGet.mockRejectedValueOnce(new Error('not found'))
  }
}

const commonStubs = {
  PageStateBoundary: { template: '<div><slot /></div>' },
  Card: { template: '<div class="card"><slot /></div>' },
  Button: { template: '<button><slot /></button>' },
  ResponsiveActionRegion: { template: '<div class="actions"><slot /></div>' },
}

describe('ApplicationPage 状态渲染', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('已提交态：展示已提交卡片，隐藏表单与操作按钮', async () => {
    setupGetMocks('submitted')

    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    // 已提交卡片可见（合并 dev 后文案为“您已提交报名”，含只读回显与撤销）
    expect(wrapper.text()).toContain('您已提交报名')
    expect(wrapper.text()).toContain('已提交')

    // 表单区域不可见（"提交报名"会作为"已提交报名申请"子串出现，改用表单标题验证）
    expect(wrapper.text()).not.toContain('意向方向')
    expect(wrapper.text()).not.toContain('报名表单')
    expect(wrapper.text()).not.toContain('保存草稿')
  })

  it('已归档态：展示已归档卡片，隐藏表单与操作按钮', async () => {
    setupGetMocks('archived')

    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    // 已归档卡片可见
    expect(wrapper.text()).toContain('您的报名申请已归档')
    expect(wrapper.text()).toContain('已归档')

    // 表单区域不可见
    expect(wrapper.text()).not.toContain('意向方向')
    expect(wrapper.text()).not.toContain('报名表单')
  })

  it('草稿态：展示草稿提示，表单与操作按钮可见', async () => {
    setupGetMocks('draft')

    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    // 草稿提示可见
    expect(wrapper.text()).toContain('您有已保存的草稿')

    // 表单区域可见
    expect(wrapper.text()).toContain('意向方向')
    expect(wrapper.text()).toContain('报名表单')

    // 操作按钮可见
    expect(wrapper.text()).toContain('保存草稿')
    expect(wrapper.text()).toContain('提交报名')
  })

  it('无申请记录：无状态卡片，表单与操作按钮可见', async () => {
    setupGetMocks(null)

    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    // 无状态卡片（“草稿”会作为“保存草稿”按钮子串出现，改用完整提示文案验证）
    expect(wrapper.text()).not.toContain('您已提交报名')
    expect(wrapper.text()).not.toContain('已归档')
    expect(wrapper.text()).not.toContain('您有已保存的草稿')

    // 表单区域可见
    expect(wrapper.text()).toContain('意向方向')
    expect(wrapper.text()).toContain('报名表单')

    // 操作按钮可见
    expect(wrapper.text()).toContain('保存草稿')
    expect(wrapper.text()).toContain('提交报名')
  })

  it('需修订态：展示修订提示，表单与操作按钮可见', async () => {
    setupGetMocks('revision_requested')

    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    // 修订提示可见
    expect(wrapper.text()).toContain('需修订')
    expect(wrapper.text()).toContain('请修改后重新提交')
    expect(wrapper.text()).toContain('您的报名需补充材料')

    // 表单区域可见
    expect(wrapper.text()).toContain('意向方向')
    expect(wrapper.text()).toContain('报名表单')

    // 操作按钮可见（需修订态提交按钮为“重新提交”）
    expect(wrapper.text()).toContain('保存草稿')
    expect(wrapper.text()).toContain('重新提交')
  })

  it('已退出态（无恢复窗口）：展示终态卡片与原因提示，隐藏表单', async () => {
    setupGetMocks('exited')

    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    // 终态卡片可见，并给出“恢复窗口”原因说明（替代笼统的不可编辑文案）
    expect(wrapper.text()).toContain('已退出')
    expect(wrapper.text()).toContain('恢复窗口未开放或已过期')

    // 表单区域不可见
    expect(wrapper.text()).not.toContain('意向方向')
    expect(wrapper.text()).not.toContain('报名表单')
    expect(wrapper.text()).not.toContain('保存草稿')
  })

  it('已退出态（恢复窗口已过期）：展示终态卡片与原因提示，隐藏表单，且守卫保证不发起请求', async () => {
    setupGetMocks('exited', { recoveryWindowDeadline: new Date(Date.now() - 86_400_000).toISOString() })

    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('已退出')
    expect(wrapper.text()).toContain('恢复窗口未开放或已过期')

    // 渲染层无表单，代码层守卫同样拦截（即便直接调用也不会发请求）
    const vm = wrapper.vm as unknown as { handleSubmit: () => Promise<void>; handleSaveDraft: () => Promise<void> }
    await vm.handleSubmit()
    await vm.handleSaveDraft()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('已退出态（恢复窗口有效期内）：放行表单与提交，恢复窗口内重新提交（recovery_resubmit）', async () => {
    setupGetMocks('exited', { recoveryWindowDeadline: new Date(Date.now() + 86_400_000).toISOString(), answers: { f1: '初版内容' } })

    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    // 恢复窗口提示可见，表单与操作按钮放行
    expect(wrapper.text()).toContain('恢复窗口期内可重新提交报名')
    expect(wrapper.text()).toContain('意向方向')
    expect(wrapper.text()).toContain('报名表单')
    expect(wrapper.text()).toContain('保存草稿')

    // 已填内容回填，可修改后重新提交
    const input = wrapper.find('input[type="text"]')
    expect((input.element as HTMLInputElement).value).toBe('初版内容')

    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    await input.setValue('修改后内容')
    await wrapper.findAll('button').find((b) => b.text().includes('技术部'))!.trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('提交报名'))!.trigger('click')

    // payload 与 mock submitApplication 契约对齐（answers 而非 formData）
    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(mockPost).toHaveBeenCalledWith('/activity/recruitment/act-001/apply', {
      answers: { f1: '修改后内容' },
      preferences: [{ departmentId: 'dept-1', departmentName: '技术部' }],
      allowAdjustment: true,
    })
  })

  it('调整超期态：展示终态卡片与原因提示，隐藏表单', async () => {
    setupGetMocks('adjustment_overdue')

    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    // 终态卡片可见，并给出“联系管理员延长窗口”的指引
    expect(wrapper.text()).toContain('调整超期')
    expect(wrapper.text()).toContain('请联系管理员延长窗口或处理')

    // 表单区域不可见
    expect(wrapper.text()).not.toContain('意向方向')
    expect(wrapper.text()).not.toContain('报名表单')
  })

  it('身份异常态：展示终态卡片，隐藏表单', async () => {
    setupGetMocks('identity_anomaly')

    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    // 终态卡片可见
    expect(wrapper.text()).toContain('身份异常')
    expect(wrapper.text()).toContain('该状态下不可编辑或提交报名')

    // 表单区域不可见
    expect(wrapper.text()).not.toContain('意向方向')
    expect(wrapper.text()).not.toContain('报名表单')
  })
})
