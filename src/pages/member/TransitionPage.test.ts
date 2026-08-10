import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001' } }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { toast } from 'vue-sonner'
import TransitionPage from './TransitionPage.vue'

const transitionData = {
  currentLeader: { id: 'mem-004', name: '张明远', title: '负责人' },
  candidates: [{ memberId: 'mem-002', name: '王浩然', currentTitle: '副部长', proposedTitle: '负责人', department: '技术部' }],
  appointments: [],
  canExecute: true,
  executedAt: null,
  results: [],
}

describe('TransitionPage 换届管理', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染换届方案', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: transitionData })
    const wrapper = mount(TransitionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/members/transition')
    expect(wrapper.text()).toContain('张明远')
    expect(wrapper.text()).toContain('王浩然')
  })

  it('已执行：展示执行结果', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { ...transitionData, executedAt: '2026-08-01T04:00:00Z', results: [{ memberId: 'mem-002', name: '王浩然', action: 'promote', targetTitle: '负责人', success: true, message: '完成' }] },
    })
    const wrapper = mount(TransitionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('完成')
  })

  it('加载失败：不渲染方案', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(TransitionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('张明远')
  })

  it('越权码（IFC-ERR-003）映射 forbidden：不渲染方案', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-003', message: '无权限' } })
    const wrapper = mount(TransitionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('张明远')
    wrapper.unmount()
  })

  it('换届执行被 202 异步受理：提示已受理并关闭弹窗，不误报失败', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: transitionData })
    mockPost.mockResolvedValue({ kind: 'accepted', data: { taskId: 'task-1', status: 'pending' } })
    const wrapper = mount(TransitionPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('确认执行换届'))!.trigger('click')
    // 填写换届原因（必填校验）
    await wrapper.find('textarea[aria-label="换届原因"]').setValue('任期届满正常交接')
    // HighRiskConfirm stub：reauth-required → confirm 带 proof
    await wrapper.find('.hrc-confirm').trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/members/transition', expect.objectContaining({ reason: '任期届满正常交接', reauthProof: 'mock-reauth-proof' }))
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('已受理'))
    expect(toast.error).not.toHaveBeenCalled()
    expect(wrapper.find('.hrc').exists()).toBe(false)
    wrapper.unmount()
  })

  it('换届执行失败：错误传给 HighRiskConfirm 展示，弹窗保持打开不卡“正在执行”', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: transitionData })
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: '执行被中断' } })
    const wrapper = mount(TransitionPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('确认执行换届'))!.trigger('click')
    await wrapper.find('textarea[aria-label="换届原因"]').setValue('任期届满正常交接')
    await wrapper.find('.hrc-confirm').trigger('click')
    await flushPromises()
    // 弹窗保持打开并透出 errorMessage，而非提前关闭
    expect(wrapper.find('.hrc').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'HighRiskConfirm' }).props('errorMessage')).toContain('执行被中断')
    expect(toast.error).toHaveBeenCalled()
    wrapper.unmount()
  })
})
