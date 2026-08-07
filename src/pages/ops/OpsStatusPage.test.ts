import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
}))

import OpsStatusPage from './OpsStatusPage.vue'

describe('OpsStatusPage 运维状态', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染版本、依赖状态与任务队列', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: {
        appVersion: '1.2.3', uptime: '12小时',
        dependencies: [{ name: 'PostgreSQL', status: 'ok', latency: 12 }],
        taskQueue: { pending: 3, processing: 1, failed: 0 },
        lastCheckAt: '2026-08-07T04:00:00Z',
      },
    })
    const wrapper = mount(OpsStatusPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/admin/ops-status')
    expect(wrapper.text()).toContain('运维状态')
    expect(wrapper.text()).toContain('1.2.3')
    expect(wrapper.text()).toContain('PostgreSQL')
    expect(wrapper.text()).toContain('12ms')
  })

  it('加载失败：不渲染数据', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(OpsStatusPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('1.2.3')
  })
})
