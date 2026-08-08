import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/org/club-001/audit/logs', params: { clubId: 'club-001' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
}))

import AuditLogPage from './AuditLogPage.vue'

describe('AuditLogPage 审计日志', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染日志条目', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'log-1', actorName: '张明远', action: 'approve', targetType: 'application', targetId: 'a1', detail: '通过申请', createdAt: '2026-08-01T04:00:00Z' }] },
    })
    const wrapper = mount(AuditLogPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/audit/logs', { search: undefined })
    expect(wrapper.text()).toContain('张明远')
    expect(wrapper.text()).toContain('通过申请')
  })

  it('加载失败：清空旧结果并进入错误态', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(AuditLogPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('张明远')
  })
})
