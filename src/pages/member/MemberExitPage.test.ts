import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'vue-sonner'
import MemberExitPage from './MemberExitPage.vue'

const exitData = {
  items: [{ id: 'mem-001', name: '陈雨桐', departmentName: '技术部', title: '干事', status: 'active' }],
  resignations: [{ id: 'res-1', memberName: '王浩然', departmentName: '技术部', title: '副部长', reason: '学业', status: 'under_review' }],
  exitRequestsWithFlags: [
    { id: 'ex-1', memberId: 'mem-002', memberName: '赵子墨', reason: '毕业', status: 'under_review', submittedAt: '2026-01-01T00:00:00.000Z', decidedAt: null, decidedBy: null, confirmedAt: null, dueAt: '2026-01-04', canWithdraw: true },
    { id: 'ex-2', memberId: 'mem-001', memberName: '陈雨桐', reason: '转学', status: 'approved', submittedAt: '2026-01-01T00:00:00.000Z', decidedAt: '2026-01-02T00:00:00.000Z', decidedBy: '李四', confirmedAt: null, dueAt: '2026-01-04', canConfirm: true },
  ],
}

describe('MemberExitPage 成员退出与移除', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染成员与辞职申请', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: exitData })
    const wrapper = mount(MemberExitPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/members/exit')
    expect(wrapper.text()).toContain('陈雨桐')
    expect(wrapper.text()).toContain('王浩然')
  })

  it('加载失败：不渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(MemberExitPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('陈雨桐')
  })

  it('标记退出成功：填写原因后请求 exit 端点并提示', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: exitData })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(MemberExitPage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 打开标记退出确认
    await wrapper.findAll('button').find((b) => b.text().includes('标记退出'))!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('确认标记退出')

    // 填写原因并确认
    await wrapper.find('textarea').setValue('毕业离校')
    await wrapper.findAll('button').find((b) => b.text().includes('确认标记退出'))!.trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/org/club-001/members/exit', {
      memberId: 'mem-001',
      action: 'mark_exit',
      reason: '毕业离校',
    })
    expect(toast.success).toHaveBeenCalledWith('已标记退出')
    wrapper.unmount()
  })

  it('标记退出：原因必填被拦截', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: exitData })
    const wrapper = mount(MemberExitPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('标记退出'))!.trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('确认标记退出'))!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('原因不能为空')
    expect(mockPost).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('主动退出（MEM-001）：提交申请走 exit-requests 端点', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: exitData })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(MemberExitPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('申请退出'))!.trigger('click')
    const buttons = wrapper.findAll('button')
    await wrapper.find('textarea').setValue('毕业离校')
    await buttons.find((b) => b.text().includes('确认提交'))!.trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/org/club-001/members/exit-requests', { reason: '毕业离校' })
    expect(toast.success).toHaveBeenCalledWith('退出申请已提交，等待负责人/人事审批')
    wrapper.unmount()
  })

  it('主动退出（MEM-001）：原因必填被拦截', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: exitData })
    const wrapper = mount(MemberExitPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('申请退出'))!.trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('确认提交'))!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('请填写退出原因')
    expect(mockPost).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('主动退出（MEM-001）：本人可撤回未审批申请', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: exitData })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(MemberExitPage, { global: { stubs: pageStubs } })
    await flushPromises()

    expect(wrapper.text()).toContain('赵子墨')
    await wrapper.findAll('button').find((b) => b.text().includes('撤回申请'))!.trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/org/club-001/members/exit-requests/ex-1/withdraw')
    expect(toast.success).toHaveBeenCalledWith('已撤回退出申请')
    wrapper.unmount()
  })

  it('主动退出（MEM-001）：批准后可二次确认', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: exitData })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(MemberExitPage, { global: { stubs: pageStubs } })
    await flushPromises()

    expect(wrapper.text()).toContain('陈雨桐')
    await wrapper.findAll('button').find((b) => b.text().includes('二次确认退出'))!.trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/org/club-001/members/exit-requests/ex-2/confirm')
    expect(toast.success).toHaveBeenCalledWith('已确认退出，正式离社')
    wrapper.unmount()
  })
})
