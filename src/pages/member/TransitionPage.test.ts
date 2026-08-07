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
  toast: { success: vi.fn(), error: vi.fn() },
}))

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
})
