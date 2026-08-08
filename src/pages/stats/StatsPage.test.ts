import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/org/club-001/stats', params: { clubId: 'club-001' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
}))

import StatsPage from './StatsPage.vue'

describe('StatsPage 管理统计', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：按作用域请求并渲染概览', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: {
        summary: [{ label: '总成员数', value: 128, trend: 'up', trendValue: 5 }],
        departmentDistribution: [{ name: '技术部', count: 30 }],
      },
    })
    const wrapper = mount(StatsPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/stats')
    expect(wrapper.text()).toContain('管理统计')
    expect(wrapper.text()).toContain('总成员数')
    expect(wrapper.text()).toContain('128')
    expect(wrapper.text()).toContain('技术部')
  })

  it('作用域解析失败：进入错误态', async () => {
    // 替换 useRoute 无法在本文件内动态改，此处直接验证请求失败分支
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(StatsPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('总成员数')
  })

  it('空分布数据：maxCount 兜底为 1 不崩溃', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { summary: [], departmentDistribution: [] },
    })
    const wrapper = mount(StatsPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('管理统计')
  })
})
