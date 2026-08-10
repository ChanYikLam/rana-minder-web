import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost, mockPut } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn(), mockPut: vi.fn() }))
// 共享可变 route，供 P1-19 切换活动用例触发路由 watch
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const route = reactive({ params: { clubId: 'club-001', activityId: 'act-1' } })
  ;(globalThis as Record<string, unknown>).__testRoute = route
  return { useRoute: () => route }
})
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
  put: (...args: unknown[]) => mockPut(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { toast } from 'vue-sonner'
import InterviewManagePage from './InterviewManagePage.vue'

const interviewRow = { id: 'iv-1', activityId: 'act-1', roundId: 'r1', roundName: '一轮', applicantId: 'a1', applicantName: '张三', studentId: '2023001', status: 'scheduled', slotId: 's1', scheduledTime: '2026-08-10T10:00:00Z', endTime: '', attendance: 'none', invalidReason: null }

const openRound = { id: 'r1', name: '一轮', status: 'open', selectDeadline: '2026-08-08T00:00:00Z', slots: [{ id: 's1', startAt: '2026-08-10T10:00:00Z', endAt: '2026-08-10T11:00:00Z', capacity: 10, available: 3 }], bookedCount: 1 }

// GET 调用顺序（onMounted）：interviews → rounds → applications → interviewers → candidates。
// 每个测试必须按此顺序显式 mock 前 5 个 Once，后续 reload 用默认值。
function mockPageGet(interviews: unknown[] = [interviewRow], rounds: unknown[] = [openRound], applications: unknown[] = []) {
  mockGet.mockReset()
  mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: interviews } })
  mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: rounds } })
  mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: applications } })
  mockGet.mockResolvedValueOnce({ kind: 'completed', data: { defaultReviewers: [], tasks: [] } })
  mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [] } })
  mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
}

describe('InterviewManagePage 面试管理', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    vi.clearAllMocks()
    // 恢复默认路由参数，避免 P1-19 用例修改后串扰后续用例
    const route = (globalThis as Record<string, unknown>).__testRoute as { params: Record<string, string> }
    if (route) route.params = { clubId: 'club-001', activityId: 'act-1' }
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：并行加载面试列表/轮次/面试官', async () => {
    // mockResolvedValueOnce 优先于默认值，按调用顺序设置：interviews → rounds → interviewers
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ id: 'iv-1', applicantName: '张三', roundName: '一轮', status: 'pending', departmentName: '技术部' }] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ id: 'r1', name: '一轮', status: 'active' }] } })
    // 面试官接口契约：{ defaultReviewers, tasks }
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: {
        defaultReviewers: [{ id: 'u1', name: '李思颖', source: 'department_leader' }],
        tasks: [{ taskId: 't1', userName: '王浩然', status: 'active' }],
      },
    })
    const wrapper = mount(InterviewManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/interviews')
    expect(wrapper.text()).toContain('张三')
    // 默认面试官按契约渲染（防 mock 形状漂移导致渲染崩溃）
    expect(wrapper.text()).toContain('李思颖')
    wrapper.unmount()
  })

  it('加载失败：进入错误态不渲染面试记录', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(InterviewManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('张三')
    wrapper.unmount()
  })

  it('代预约：选申请人/轮次/时段后提交成功并刷新列表', async () => {
    mockPageGet([interviewRow], [openRound], [{ applicantId: 'a1', applicantName: '张三', status: 'submitted' }])
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(InterviewManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    const bookBtn = wrapper.findAll('button').find((b) => b.text().includes('代预约面试'))
    expect(bookBtn, '代预约按钮').toBeTruthy()
    await bookBtn!.trigger('click')
    expect(wrapper.text()).toContain('代申请人预约面试')

    const selects = wrapper.findAll('select')
    await selects[0].setValue('a1')
    await selects[1].setValue('r1')
    await selects[2].setValue('s1')
    await flushPromises()

    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('确认预约'))
    expect(confirmBtn, '确认预约按钮').toBeTruthy()
    await confirmBtn!.trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/interviews/book', { applicantId: 'a1', slotId: 's1' })
    // 成功后关闭面板并刷新列表
    expect(wrapper.text()).not.toContain('代申请人预约面试')
    expect(mockGet).toHaveBeenLastCalledWith('/org/club-001/recruitment/act-1/interviews')
    wrapper.unmount()
  })

  it('代预约失败：展示后端错误信息（toast）', async () => {
    mockPageGet([interviewRow], [openRound], [{ applicantId: 'a1', applicantName: '张三', status: 'submitted' }])
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'BOOK-001', message: '时段已被约满' } })
    const wrapper = mount(InterviewManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.find('tbody tr[role="row"]').trigger('click')
    const bookBtn = wrapper.findAll('button').find((b) => b.text().includes('代预约面试'))
    await bookBtn!.trigger('click')
    const selects = wrapper.findAll('select')
    await selects[0].setValue('a1')
    await selects[1].setValue('r1')
    await selects[2].setValue('s1')
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('确认预约'))!.trigger('click')
    await flushPromises()

    expect(toast.error).toHaveBeenCalledWith('时段已被约满')
    expect(wrapper.text()).not.toContain('时段已被约满')
    // 失败后面板保持打开
    expect(wrapper.text()).toContain('代申请人预约面试')
    wrapper.unmount()
  })

  it('行操作：点击行选中后开始面试并刷新', async () => {
    mockPageGet([interviewRow], [openRound])
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(InterviewManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 点击数据行（tbody 内非 skeleton 行）
    const dataRow = wrapper.find('tbody tr[role="row"]')
    expect(dataRow.exists(), '数据行存在').toBe(true)
    await dataRow.trigger('click')
    expect(wrapper.text()).toContain('2023001')

    const startBtn = wrapper.findAll('button').find((b) => b.text().includes('开始面试'))
    expect(startBtn, '开始面试按钮').toBeTruthy()
    await startBtn!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/interviews/iv-1/start', {})
    expect(mockGet).toHaveBeenLastCalledWith('/org/club-001/recruitment/act-1/interviews')
    wrapper.unmount()
  })

  it('行操作失败：展示后端错误信息（toast）', async () => {
    mockPageGet([interviewRow], [openRound])
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'OP-001', message: '该面试已作废' } })
    const wrapper = mount(InterviewManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.find('tbody tr[role="row"]').trigger('click')
    const startBtn = wrapper.findAll('button').find((b) => b.text().includes('开始面试'))
    await startBtn!.trigger('click')
    await flushPromises()
    expect(toast.error).toHaveBeenCalledWith('该面试已作废')
    expect(wrapper.text()).not.toContain('该面试已作废')
    wrapper.unmount()
  })

  it('轮次管理：创建轮次校验/成功、改截止、取消轮次（无原因拦截）', async () => {
    mockPageGet([interviewRow], [openRound])
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    mockPut.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(InterviewManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 展开轮次管理
    await wrapper.findAll('button').find((b) => b.text().includes('轮次管理'))!.trigger('click')
    expect(wrapper.text()).toContain('新建轮次')

    // 校验：缺字段时拦截
    await wrapper.findAll('button').find((b) => b.text().includes('创建轮次'))!.trigger('click')
    expect(wrapper.text()).toContain('请完整填写轮次名称、截止时间与面试时段')

    // 填完整后创建成功（创建成功后 loadRounds 再发一次 GET，mock 返回含新轮次的列表）
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('二面')
    await inputs[1].setValue('2026-08-15T00:00:00Z')
    await inputs[2].setValue('2026-08-15T10:00:00Z')
    await inputs[3].setValue('2026-08-15T12:00:00Z')
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [openRound, { id: 'r2', name: '二面', status: 'open', selectDeadline: '2026-08-15T00:00:00Z', slots: [], bookedCount: 0 }] } })
    await wrapper.findAll('button').find((b) => b.text().includes('创建轮次'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith(
      '/org/club-001/recruitment/act-1/rounds',
      expect.objectContaining({ name: '二面', selectDeadline: '2026-08-15T00:00:00Z', slots: expect.any(Array) })
    )

    // 改截止：输入新日期后保存（PUT，成功后 loadRounds 再发一次 GET）
    await wrapper.findAll('button').find((b) => b.text().includes('改截止'))!.trigger('click')
    const deadlineInput = wrapper.findAll('input').find((i) => i.attributes('placeholder') === '新选时截止（ISO）')
    expect(deadlineInput, '改截止输入框').toBeTruthy()
    await deadlineInput!.setValue('2026-08-16T00:00:00Z')
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [openRound] } })
    await wrapper.findAll('button').find((b) => b.text().includes('保存'))!.trigger('click')
    await flushPromises()
    expect(mockPut).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/rounds/r1', { selectDeadline: '2026-08-16T00:00:00Z' })

    // 取消轮次：无原因时按钮禁用（无法触发校验分支，改为断言 disabled）
    await wrapper.findAll('button').find((b) => b.text().includes('取消轮次'))!.trigger('click')
    const cancelBtn = wrapper.findAll('button').find((b) => b.text().includes('确认取消'))
    expect(cancelBtn!.attributes('disabled'), '无原因时禁用').toBeDefined()

    // 填原因后取消成功
    const reasonInput = wrapper.findAll('input').find((i) => i.attributes('placeholder') === '请填写取消原因（必填）')
    await reasonInput!.setValue('排期冲突')
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('确认取消'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/rounds/r1/cancel', { reason: '排期冲突' })
    wrapper.unmount()
  })

  it('轮次创建失败：展示后端错误信息', async () => {
    mockPageGet([interviewRow], [openRound])
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'ROUND-001', message: '截止时间已过，无法创建' } })
    const wrapper = mount(InterviewManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('轮次管理'))!.trigger('click')
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('二面')
    await inputs[1].setValue('2026-08-15T00:00:00Z')
    await inputs[2].setValue('2026-08-15T10:00:00Z')
    await inputs[3].setValue('2026-08-15T12:00:00Z')
    await wrapper.findAll('button').find((b) => b.text().includes('创建轮次'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith(
      '/org/club-001/recruitment/act-1/rounds',
      expect.objectContaining({ name: '二面', selectDeadline: '2026-08-15T00:00:00Z', slots: expect.any(Array) })
    )
    expect(toast.error).toHaveBeenCalledWith('截止时间已过，无法创建')
    expect(wrapper.text()).not.toContain('截止时间已过，无法创建')
    wrapper.unmount()
  })

  it('跳轮/免试：填写申请人+原因后提交成功', async () => {
    mockPageGet([interviewRow], [openRound], [{ applicantId: 'a2', applicantName: '李四', status: 'submitted' }])
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(InterviewManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 展开轮次管理以显示跳轮表单（select 顺序：0=创建轮次mode 1=跳轮申请人 2=跳轮目标轮次）
    await wrapper.findAll('button').find((b) => b.text().includes('轮次管理'))!.trigger('click')
    const skipBtn = wrapper.findAll('button').find((b) => b.text().includes('执行跳轮'))
    expect(skipBtn, '执行跳轮按钮').toBeTruthy()

    const selects = wrapper.findAll('select')
    await selects[1].setValue('a2')
    await selects[2].setValue('r1')
    const reasonInput = wrapper.findAll('input').find((i) => i.attributes('placeholder') === '跳轮原因（必填）')
    await reasonInput!.setValue('已有实习offer')
    await flushPromises()
    await skipBtn!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/rounds/r1/skip', { applicantId: 'a2', reason: '已有实习offer' })
    wrapper.unmount()
  })

  it('P1-20：跳轮未选目标轮次时按钮禁用，不再默认首个轮次', async () => {
    mockPageGet([interviewRow], [openRound], [{ applicantId: 'a2', applicantName: '李四', status: 'submitted' }])
    const wrapper = mount(InterviewManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('轮次管理'))!.trigger('click')
    const selects = wrapper.findAll('select')
    await selects[1].setValue('a2')
    const reasonInput = wrapper.findAll('input').find((i) => i.attributes('placeholder') === '跳轮原因（必填）')
    await reasonInput!.setValue('已有实习offer')
    await flushPromises()

    const skipBtn = wrapper.findAll('button').find((b) => b.text().includes('执行跳轮'))
    expect(skipBtn!.attributes('disabled'), '未选轮次时禁用').toBeDefined()

    // 显式选择目标轮次后才可用
    await selects[2].setValue('r1')
    await flushPromises()
    expect(skipBtn!.attributes('disabled'), '选中轮次后可用').toBeUndefined()
    wrapper.unmount()
  })

  it('P1-19：切换活动时重置本地状态并全量重载，不残留上一活动数据', async () => {
    const route = (globalThis as Record<string, unknown>).__testRoute as { params: Record<string, string> }
    mockPageGet([interviewRow], [openRound], [{ applicantId: 'a1', applicantName: '张三', status: 'submitted' }])
    const wrapper = mount(InterviewManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('张三')

    // 制造本地残留：选中一行 + 打开代预约面板
    await wrapper.find('tbody tr[role="row"]').trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('代预约面试'))!.trigger('click')
    expect(wrapper.text()).toContain('代申请人预约面试')

    // 切换到另一活动：应重置面板/选中项并全量重载新活动数据
    route.params = { clubId: 'club-001', activityId: 'act-2' }
    mockGet.mockReset()
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ id: 'iv-9', applicantName: '王五', roundName: '一轮', status: 'pending', departmentName: '技术部' }] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [openRound] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { defaultReviewers: [], tasks: [] } })
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
    await nextTick()
    await flushPromises()
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith('/org/club-001/recruitment/act-2/interviews')
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/recruitment/act-2/rounds')
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/recruitment/act-2/interviewers')
    expect(wrapper.text()).toContain('王五')
    expect(wrapper.text()).not.toContain('张三')
    // 面板已关闭、选中行已清空
    expect(wrapper.text()).not.toContain('代申请人预约面试')
    expect(wrapper.text()).not.toContain('2023001')
    wrapper.unmount()
  })

  it('P1-202：操作返回 accepted 时提示已受理，不误报失败（跳轮为例）', async () => {
    mockPageGet([interviewRow], [openRound], [{ applicantId: 'a2', applicantName: '李四', status: 'submitted' }])
    mockPost.mockResolvedValue({ kind: 'accepted', data: { taskId: 'task-1', status: 'processing' } })
    const wrapper = mount(InterviewManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('轮次管理'))!.trigger('click')
    const selects = wrapper.findAll('select')
    await selects[1].setValue('a2')
    await selects[2].setValue('r1')
    const reasonInput = wrapper.findAll('input').find((i) => i.attributes('placeholder') === '跳轮原因（必填）')
    await reasonInput!.setValue('已有实习offer')
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('执行跳轮'))!.trigger('click')
    await flushPromises()

    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalledWith('跳轮已受理，正在后台处理')
    wrapper.unmount()
  })

  it('面试官：指派活动级/轮次级、撤销任务', async () => {
    // 调用顺序：interviews → rounds → applications → interviewers → candidates(候选人)
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [interviewRow] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [openRound] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { defaultReviewers: [], tasks: [] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ id: 'm1', name: '王浩然', role: '干事' }] } })
    // 指派成功后的重载（loadInterviewers 两次 GET：interviewers + candidates）
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { defaultReviewers: [], tasks: [{ id: 't1', userId: 'm1', userName: '王浩然', scope: 'activity', roundId: '', roundName: '', status: 'active' }] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ id: 'm1', name: '王浩然', role: '干事' }] } })
    // 轮次级指派成功后的重载（任务列表出现轮次级任务 t2）
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { defaultReviewers: [], tasks: [{ id: 't2', userId: 'm1', userName: '王浩然', scope: 'round', roundId: 'r1', roundName: '一轮', status: 'active' }] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ id: 'm1', name: '王浩然', role: '干事' }] } })
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(InterviewManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 展开指派面板
    await wrapper.findAll('button').find((b) => b.text().includes('指派临时面试官'))!.trigger('click')
    // 未选成员时按钮 disabled
    const assignBtn = wrapper.findAll('button').find((b) => b.text().includes('确认指派'))
    expect(assignBtn!.attributes('disabled'), '未选成员时禁用').toBeDefined()

    // 活动级指派成功（面板内 select：0=userId 1=scope 2=roundId）
    const selects = wrapper.findAll('select')
    await selects[0].setValue('m1')
    await flushPromises()
    await assignBtn!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/interviewers', expect.objectContaining({ userId: 'm1', userName: '王浩然', scope: 'activity' }))
    // 任务列表出现撤销按钮
    const revokeBtn = wrapper.findAll('button').find((b) => b.text().includes('撤销'))
    expect(revokeBtn, '撤销按钮').toBeTruthy()

    // 轮次级：未选轮次拦截（userId 已选故按钮可用）
    await selects[0].setValue('m1')
    await selects[1].setValue('round')
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('确认指派'))!.trigger('click')
    expect(wrapper.text()).toContain('轮次级任务必须指定轮次')

    // 轮次级指派成功：必须携带 roundId（scope 切为 round 后重查 select 列表）
    const selects3 = wrapper.findAll('select')
    await selects3[2].setValue('r1')
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('确认指派'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/interviewers', { userId: 'm1', userName: '王浩然', scope: 'round', roundId: 'r1' })

    // 撤销任务：确认后调用 revoke（此时列表为轮次级任务 t2）
    const revokeBtn2 = wrapper.findAll('button').find((b) => b.text().includes('撤销'))
    expect(revokeBtn2, '撤销按钮').toBeTruthy()
    await revokeBtn2!.trigger('click')
    const confirmRevoke = wrapper.findAll('button').find((b) => b.text().trim() === '确认')
    expect(confirmRevoke, '撤销确认按钮').toBeTruthy()
    await confirmRevoke!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/interviewers/t2/revoke', {})
    wrapper.unmount()
  })
})
