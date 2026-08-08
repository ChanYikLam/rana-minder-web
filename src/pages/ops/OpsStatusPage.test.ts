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

  it('加载成功：渲染版本、依赖状态、任务队列与同步健康', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: {
        appVersion: '1.2.3', uptime: '12小时',
        dependencies: [{ name: 'PostgreSQL', status: 'ok', latency: 12 }],
        taskQueue: { pending: 3, processing: 1, failed: 0 },
        syncHealth: {
          abnormalClubs: 1,
          pendingCorrections: 2,
          recentEvents: [{ id: 'evt-1', kind: 'group_lost', clubId: 'club-005', clubName: '新媒体中心', at: '2026-08-07T04:00:00Z', note: '对账检测到 Group 删除/移动/失权' }],
        },
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
    expect(wrapper.text()).toContain('数据同步健康')
    expect(wrapper.text()).toContain('新媒体中心')
  })

  it('加载失败：不渲染数据', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(OpsStatusPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('1.2.3')
  })
})
