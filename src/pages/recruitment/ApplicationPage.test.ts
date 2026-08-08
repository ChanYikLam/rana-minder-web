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

import { toast } from 'vue-sonner'
import type { FileMeta } from '@/types/domain/form'

import ApplicationPage from './ApplicationPage.vue'

// 通用 mock 数据
const mockActivity = { id: 'act-001', title: '测试活动', clubName: '测试社团', deadline: '2099-12-31T23:59:59Z', departments: [{ id: 'dept-1', name: '技术部' }], formId: 'form-001' }
const mockFormFields = [{ id: 'f1', type: 'text', label: '姓名', description: null, required: true, readonly: false, permission: 'read_write', options: null }]
const fileField = { id: 'f2', type: 'file', label: '简历', description: null, required: false, readonly: false, permission: 'read_write', options: null }

/** 文件上传接口（/files/upload，client 拼 BASE_URL 后为 /api/files/upload）的成功响应 */
function uploadOk(fileId: string) {
  return { kind: 'completed' as const, data: { fileId, name: 'resume.pdf', size: 1024, mimeType: 'application/pdf', status: 'clean', uploadedAt: '2026-08-07T00:00:00Z' } }
}

function mockApplication(status: string, extra: Record<string, unknown> = {}) {
  return { status, answers: {}, preferences: [], recoveryWindowDeadline: null, ...extra }
}

/** 设置 mock 返回值 */
function setupGetMocks(applicationStatus: string | null, applicationExtra: Record<string, unknown> = {}, fields: unknown[] = mockFormFields) {
  mockGet.mockReset()
  // 第一次 get：活动详情
  mockGet.mockResolvedValueOnce({ kind: 'completed' as const, data: mockActivity })
  // 第二次 get：表单字段
  mockGet.mockResolvedValueOnce({ kind: 'completed' as const, data: { versions: [{ fields }] } })
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
  RouterLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
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

  it('无报名资格（403）：展示阻断提示，隐藏表单与操作按钮（Issue-4.0-2）', async () => {
    mockGet.mockReset()
    mockGet.mockResolvedValueOnce({ kind: 'completed' as const, data: mockActivity })
    mockGet.mockResolvedValueOnce({ kind: 'completed' as const, data: { versions: [{ fields: mockFormFields }] } })
    mockGet.mockResolvedValueOnce({ kind: 'rejected' as const, error: { code: 'IFC-ERR-003', message: '您没有执行此操作的权限' } })

    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    // 阻断提示可见
    expect(wrapper.text()).toContain('当前账号无报名资格')

    // 表单区域与操作按钮不可见
    expect(wrapper.text()).not.toContain('意向方向')
    expect(wrapper.text()).not.toContain('报名表单')
    expect(wrapper.text()).not.toContain('保存草稿')
    expect(wrapper.text()).not.toContain('提交报名')
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

  it('已提交态：image 附件字段只读回显为可点击的文件名链接，而非 FileMeta 原始 JSON', async () => {
    const imageField = { id: 'img', type: 'image', label: '证件照', description: null, required: false, readonly: false, permission: 'read_write', options: null }
    const imageMeta = { id: 'image-meta-001', name: 'a.jpg', size: 1024, mimeType: 'image/jpeg', status: 'approved', uploadedAt: '', checkedAt: null, downloadUrl: null }
    setupGetMocks('submitted', { answers: { f1: '张三', img: [imageMeta] } }, [...mockFormFields, imageField])

    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('证件照')
    // 文件字段渲染为可点击的文件名链接，可跳转 FilePreviewPage 下载（修复：不再只显示“已上传附件”占位文案）
    expect(wrapper.text()).toContain('a.jpg')
    expect(wrapper.find('a[href="/files/image-meta-001"]').exists()).toBe(true)
    // 不再把 FileMeta[] 序列化成原始 JSON 展示
    expect(wrapper.text()).not.toContain('已上传附件')
    expect(wrapper.text()).not.toContain('image-meta-001')
    expect(wrapper.text()).not.toContain('{"id"')
  })

  it('草稿态：number 草稿值回填进数字输入框（不再被静默清空）', async () => {
    const numberField = { id: 'n1', type: 'number', label: '年级', description: null, required: false, readonly: false, permission: 'read_write', options: null }
    setupGetMocks('draft', { answers: { n1: 2024 } }, [...mockFormFields, numberField])

    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    const numInput = wrapper.find('input[type="number"]')
    expect((numInput.element as HTMLInputElement).value).toBe('2024')
    wrapper.unmount()
  }, 10_000)
})

describe('ApplicationPage 交互流程', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function buttonWithText(wrapper: ReturnType<typeof mount>, text: string) {
    return wrapper.findAll('button').find((b) => b.text().includes(text))!
  }

  async function fillFormAndPreference(wrapper: ReturnType<typeof mount>) {
    await wrapper.find('input[type="text"]').setValue('张三')
    await buttonWithText(wrapper, '技术部').trigger('click')
  }

  it('活动/表单加载失败：进入错误态，不渲染表单', async () => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: '网络异常' } })

    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).not.toContain('意向方向')
    expect(wrapper.text()).not.toContain('报名表单')
  })

  it('必填项为空且未选意向方向：校验拦截，不发请求', async () => {
    setupGetMocks('draft')
    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    await buttonWithText(wrapper, '提交报名').trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('姓名为必填项')
    expect(wrapper.text()).toContain('请至少选择一个意向方向')
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('提交成功：校验通过后按契约发送 payload 并跳转个人中心进行中', async () => {
    setupGetMocks('draft')
    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    await fillFormAndPreference(wrapper)
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })

    await buttonWithText(wrapper, '提交报名').trigger('click')
    await flushPromises()
    await nextTick()

    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(mockPost).toHaveBeenCalledWith('/activity/recruitment/act-001/apply', {
      answers: { f1: '张三' },
      preferences: [{ departmentId: 'dept-1', departmentName: '技术部' }],
      allowAdjustment: true,
    })
    expect(mockPush).toHaveBeenCalledWith('/me/ongoing')
  })

  it('提交被拒绝：展示服务端错误信息，不跳转', async () => {
    setupGetMocks('draft')
    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    await fillFormAndPreference(wrapper)
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'REC-CLOSED', message: '报名已截止' } })

    await buttonWithText(wrapper, '提交报名').trigger('click')
    await flushPromises()
    await nextTick()

    expect(toast.error).toHaveBeenCalledWith('报名已截止')
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('保存草稿成功：展示已保存状态', async () => {
    setupGetMocks('draft')
    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    mockPost.mockResolvedValue({ kind: 'completed', data: { savedAt: '2026-08-07T12:00:00Z' } })
    await buttonWithText(wrapper, '保存草稿').trigger('click')
    await flushPromises()
    await nextTick()

    expect(mockPost).toHaveBeenCalledWith('/activity/recruitment/act-001/draft', { answers: {} })
    expect(toast.success).toHaveBeenCalled()
  })

  it('保存草稿失败：toast 提示错误，不进入已保存态', async () => {
    setupGetMocks('draft')
    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'X', message: 'boom' } })
    await buttonWithText(wrapper, '保存草稿').trigger('click')
    await flushPromises()
    await nextTick()

    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith('草稿保存失败，请稍后重试')
    expect(wrapper.text()).not.toContain('草稿已保存')
  })

  it('保存草稿：瞬态附件不落库——uploading 丢弃、checking 降级 uploaded，approved 保留', async () => {
    const now = '2026-08-07T00:00:00Z'
    const checkingFile = { id: 'file-9', name: 'a.pdf', size: 1024, mimeType: 'application/pdf', status: 'checking', uploadedAt: now, checkedAt: null, downloadUrl: null }
    const uploadingFile = { id: 'pending-1', name: 'b.pdf', size: 1024, mimeType: 'application/pdf', status: 'uploading', uploadedAt: now, checkedAt: null, downloadUrl: null }
    const approvedFile = { id: 'file-10', name: 'c.pdf', size: 1024, mimeType: 'application/pdf', status: 'approved', uploadedAt: now, checkedAt: now, downloadUrl: null }
    setupGetMocks('draft', { answers: { f1: '张三' } }, [...mockFormFields, fileField])
    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    // 模拟 AttachmentUpload 在检查窗口内 emit 出含瞬态状态的附件数组
    const upload = wrapper.findComponent({ name: 'AttachmentUpload' })
    expect(upload.exists()).toBe(true)
    upload.vm.$emit('update:modelValue', [checkingFile, uploadingFile, approvedFile])
    await nextTick()

    mockPost.mockResolvedValue({ kind: 'completed', data: { savedAt: '2026-08-07T12:00:00Z' } })
    await buttonWithText(wrapper, '保存草稿').trigger('click')
    await flushPromises()
    await nextTick()

    expect(mockPost).toHaveBeenCalledWith('/activity/recruitment/act-001/draft', {
      answers: { f1: '张三', f2: [{ ...checkingFile, status: 'uploaded', checkedAt: null }, approvedFile] },
    })
  })

  it('撤销提交：两段式确认，5 秒未确认自动复位且不发起请求', async () => {
    vi.useFakeTimers()
    try {
      setupGetMocks('submitted')
      const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
      await flushPromises()
      await nextTick()

      const withdrawBtn = buttonWithText(wrapper, '撤销提交')
      await withdrawBtn.trigger('click')
      await nextTick()
      expect(wrapper.text()).toContain('再次点击确认撤销')

      vi.advanceTimersByTime(5000)
      await nextTick()
      expect(wrapper.text()).toContain('撤销提交')
      expect(mockPost).not.toHaveBeenCalled()
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('撤销提交：确认态二次点击执行撤销并提示成功', async () => {
    setupGetMocks('submitted')
    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    // 撤销成功后 loadData 重新拉取：为刷新提供兜底响应
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: '网络异常' } })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const withdrawBtn = buttonWithText(wrapper, '撤销提交')
    await withdrawBtn.trigger('click')
    await nextTick()
    await withdrawBtn.trigger('click')
    await flushPromises()
    await nextTick()

    expect(mockPost).toHaveBeenCalledWith('/activity/recruitment/act-001/apply/withdraw', {})
    expect(toast.success).toHaveBeenCalledWith('已撤销提交，可修改后重新提交')
    wrapper.unmount()
  })

  it('文件上传成功：经上传接口取得真实 fileId，mock 安全检查通过后提交', async () => {
    vi.useFakeTimers()
    try {
      setupGetMocks('draft', {}, [...mockFormFields, fileField])
      const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
      await flushPromises()
      await nextTick()

      mockPost.mockResolvedValueOnce(uploadOk('file-upload-001'))
      const fileInput = wrapper.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', { value: [new File(['x'], 'resume.pdf', { type: 'application/pdf' })], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await nextTick()
      expect(wrapper.text()).toContain('resume.pdf')
      expect(wrapper.text()).toContain('安全检查中')

      await vi.advanceTimersByTimeAsync(1500)
      await nextTick()
      expect(wrapper.text()).toContain('已通过安全检测')

      mockPost.mockResolvedValue({ kind: 'completed', data: {} })
      await fillFormAndPreference(wrapper)
      await buttonWithText(wrapper, '提交报名').trigger('click')
      await flushPromises()
      await nextTick()

      // 附件先经 /files/upload 换取真实 fileId（不带 /api 前缀，client 会统一包 input），提交时 payload 携带该元数据
      expect(mockPost).toHaveBeenCalledTimes(2)
      expect(mockPost).toHaveBeenNthCalledWith(1, '/files/upload', { purpose: 'form-attachment', name: 'resume.pdf' })
      const [url, body] = mockPost.mock.calls[1] as [string, { answers: Record<string, unknown> }]
      expect(url).toBe('/activity/recruitment/act-001/apply')
      const f2 = body.answers.f2 as FileMeta[]
      expect(f2).toHaveLength(1)
      expect(f2[0].name).toBe('resume.pdf')
      expect(f2[0].id).toBe('file-upload-001')
      expect(f2[0].status).toBe('approved')
    } finally {
      vi.useRealTimers()
    }
  })

  it('文件安全检查中提交：校验拦截，不发提交请求', async () => {
    vi.useFakeTimers()
    try {
      setupGetMocks('draft', {}, [...mockFormFields, fileField])
      const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
      await flushPromises()
      await nextTick()

      // 上传接口返回真实 fileId 后进入检查中；不推进时间，检查保持未完成
      mockPost.mockResolvedValueOnce(uploadOk('file-upload-002'))
      const fileInput = wrapper.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', { value: [new File(['x'], 'a.pdf', { type: 'application/pdf' })], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await nextTick()
      expect(wrapper.text()).toContain('a.pdf')
      expect(wrapper.text()).toContain('安全检查中')

      await buttonWithText(wrapper, '技术部').trigger('click')
      await buttonWithText(wrapper, '提交报名').trigger('click')
      await nextTick()

      expect(wrapper.text()).toContain('文件安全检查中，请稍候再提交')
      expect(mockPost).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('文件上传失败：标记已拒绝并提示，提交被校验拦截', async () => {
    setupGetMocks('draft', {}, [...mockFormFields, fileField])
    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: '网络连接异常' } })
    const fileInput = wrapper.find('input[type="file"]')
    Object.defineProperty(fileInput.element, 'files', { value: [new File(['x'], 'resume.pdf', { type: 'application/pdf' })], configurable: true })
    await fileInput.trigger('change')
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('resume.pdf')
    expect(wrapper.text()).toContain('已拒绝')

    await buttonWithText(wrapper, '技术部').trigger('click')
    await buttonWithText(wrapper, '提交报名').trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('文件上传失败，请重新上传')
    expect(mockPost).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('文件类型不符合要求：标记已拒绝并提示，提交被校验拦截', async () => {
    setupGetMocks('draft', {}, [...mockFormFields, fileField])
    const wrapper = mount(ApplicationPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    const fileInput = wrapper.find('input[type="file"]')
    Object.defineProperty(fileInput.element, 'files', { value: [new File(['x'], 'a.exe', { type: 'application/x-msdownload' })], configurable: true })
    await fileInput.trigger('change')
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('a.exe')
    expect(wrapper.text()).toContain('已拒绝')

    await buttonWithText(wrapper, '技术部').trigger('click')
    await buttonWithText(wrapper, '提交报名').trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('文件上传失败，请重新上传')
    expect(mockPost).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
