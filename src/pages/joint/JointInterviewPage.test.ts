import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001', jointId: 'jnt-1' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'vue-sonner'
import JointInterviewPage from './JointInterviewPage.vue'

const interview = { id: 'jiv-1', jointId: 'jnt-1', applicantId: 'a1', applicantName: '张三', status: 'scheduled', scheduledTime: '2026-08-10T10:00:00Z', attendance: 'none', invalidReason: null, attempt: 1, reviews: [] }

// GET 调用顺序（onMounted）：interviews → applications+slots（并行）→ interviewers+candidates（并行）
function mockPageGet(interviews: unknown[] = [interview], applications: unknown[] = [], slots: unknown[] = []) {
  mockGet.mockReset()
  mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: interviews } })
  mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: applications } })
  mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: slots } })
  mockGet.mockResolvedValueOnce({ kind: 'completed', data: { defaultReviewers: [], tasks: [] } })
  mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [] } })
  mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
}

describe('JointInterviewPage 联合面试管理', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染联合面试列表', async () => {
    // onMounted 顺序：interviews → applications+slots（并行）→ interviewers+candidates（并行）
    // mockResolvedValueOnce 优先于默认值，按调用顺序设置
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ id: 'jiv-1', applicantName: '张三', roundName: '一轮', status: 'pending', departmentName: '技术部' }] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [] } })
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { defaultReviewers: [{ id: 'u1', name: '李思颖', source: 'department_leader' }], tasks: [] },
    })
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
    const wrapper = mount(JointInterviewPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/joint/jnt-1/interviews')
    expect(wrapper.text()).toContain('张三')
    // 默认面试官按契约渲染（防 mock 形状漂移导致渲染崩溃）
    expect(wrapper.text()).toContain('李思颖')
    wrapper.unmount()
  })

  it('加载失败：不渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(JointInterviewPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('张三')
  })

  it('代预约：选申请人/时段后提交成功并刷新', async () => {
    mockPageGet([interview], [{ applicantId: 'a2', applicantName: '李四', status: 'submitted' }], [{ id: 's1', startAt: '2026-08-10T10:00:00Z', capacity: 10, available: 3 }])
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(JointInterviewPage, { global: { stubs: pageStubs } })
    await flushPromises()

    const bookBtn = wrapper.findAll('button').find((b) => b.text().includes('代预约面试'))
    expect(bookBtn, '代预约按钮').toBeTruthy()
    await bookBtn!.trigger('click')
    expect(wrapper.text()).toContain('代申请人预约联合面试')

    const selects = wrapper.findAll('select')
    await selects[0].setValue('a2')
    await selects[1].setValue('s1')
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('确认预约'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/joint/jnt-1/interviews/book', { applicantId: 'a2', slotId: 's1' })
    // 成功后关闭面板并刷新
    expect(wrapper.text()).not.toContain('代申请人预约联合面试')
    expect(mockGet).toHaveBeenLastCalledWith('/org/club-001/joint/jnt-1/interviews')
    wrapper.unmount()
  })

  it('代预约失败：展示后端错误且面板保持打开', async () => {
    mockPageGet([interview], [{ applicantId: 'a2', applicantName: '李四', status: 'submitted' }], [{ id: 's1', startAt: '2026-08-10T10:00:00Z', capacity: 10, available: 3 }])
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'BOOK-001', message: '时段已被约满' } })
    const wrapper = mount(JointInterviewPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('代预约面试'))!.trigger('click')
    const selects = wrapper.findAll('select')
    await selects[0].setValue('a2')
    await selects[1].setValue('s1')
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('确认预约'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/joint/jnt-1/interviews/book', { applicantId: 'a2', slotId: 's1' })
    // 失败以 toast 提示（操作结果反馈走独立反馈层）
    expect(toast.error).toHaveBeenCalledWith('时段已被约满')
    expect(wrapper.text()).not.toContain('时段已被约满')
    // 失败后面板保持打开
    expect(wrapper.text()).toContain('代申请人预约联合面试')
    wrapper.unmount()
  })

  it('行操作：开始面试成功后刷新', async () => {
    mockPageGet([interview])
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(JointInterviewPage, { global: { stubs: pageStubs } })
    await flushPromises()

    const startBtn = wrapper.findAll('button').find((b) => b.text().includes('开始面试'))
    expect(startBtn, '开始面试按钮').toBeTruthy()
    await startBtn!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/joint/jnt-1/interviews/a1/start', {})
    expect(mockGet).toHaveBeenLastCalledWith('/org/club-001/joint/jnt-1/interviews')
    wrapper.unmount()
  })

  it('行操作失败：展示后端错误信息', async () => {
    mockPageGet([interview])
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'OP-001', message: '联合面试已结束' } })
    const wrapper = mount(JointInterviewPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('开始面试'))!.trigger('click')
    await flushPromises()
    // 操作结果反馈统一走 toast，页面内联不再承载
    expect(toast.error).toHaveBeenCalledWith('联合面试已结束')
    expect(wrapper.text()).not.toContain('联合面试已结束')
    wrapper.unmount()
  })

  it('评价区：completed 状态渲染实时互见评价', async () => {
    const completed = {
      ...interview, status: 'completed',
      reviews: [{ clubId: 'club-001', clubName: '技术部', rating: 5, comment: '表现优秀', concludedAt: '2026-08-10T12:00:00Z' }],
    }
    mockPageGet([completed])
    const wrapper = mount(JointInterviewPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('跨社评价')
    expect(wrapper.text()).toContain('技术部')
    expect(wrapper.text()).toContain('表现优秀')
    wrapper.unmount()
  })

  it('面试官：指派成功与撤销任务', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [interview] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { defaultReviewers: [], tasks: [] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ id: 'm1', name: '王浩然', role: '干事' }] } })
    // 指派成功后的重载（interviewers + candidates）
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { defaultReviewers: [], tasks: [{ id: 't1', userId: 'm1', userName: '王浩然', scope: 'activity', status: 'active' }] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ id: 'm1', name: '王浩然', role: '干事' }] } })
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(JointInterviewPage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 展开指派面板
    await wrapper.findAll('button').find((b) => b.text().includes('指派临时面试官'))!.trigger('click')
    // 未选成员时按钮 disabled
    const assignBtn = wrapper.findAll('button').find((b) => b.text().includes('确认指派'))
    expect(assignBtn!.attributes('disabled'), '未选成员时禁用').toBeDefined()

    // 指派成功
    const select = wrapper.findAll('select')[0]
    await select.setValue('m1')
    await flushPromises()
    await assignBtn!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/joint/jnt-1/interviewers', { userId: 'm1', userName: '王浩然' })
    // 任务列表出现撤销按钮
    const revokeBtn = wrapper.findAll('button').find((b) => b.text().includes('撤销'))
    expect(revokeBtn, '撤销按钮').toBeTruthy()

    // 撤销任务
    await revokeBtn!.trigger('click')
    const confirmRevoke = wrapper.findAll('button').find((b) => b.text().trim() === '确认')
    expect(confirmRevoke, '撤销确认按钮').toBeTruthy()
    await confirmRevoke!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/joint/jnt-1/interviewers/t1/revoke', {})
    wrapper.unmount()
  })
})
