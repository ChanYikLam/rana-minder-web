import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/me/corrections', meta: { view: 'self' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import CorrectionPage from './CorrectionPage.vue'

const correction = {
  id: 'c-1', targetType: 'application', targetId: 'app-1', reason: '状态显示错误',
  evidence: '截图', status: 'pending', submittedAt: '2026-08-01T04:00:00Z', submitterName: '张三',
}

describe('CorrectionPage 事实纠错', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('个人视图：加载纠错列表', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [correction] } })
    const wrapper = mount(CorrectionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/me/corrections')
    expect(wrapper.text()).toContain('状态显示错误')
  })

  it('空列表：展示空态', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
    const wrapper = mount(CorrectionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('暂无')
  })

  it('加载失败：不渲染列表', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(CorrectionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('状态显示错误')
  })
})
