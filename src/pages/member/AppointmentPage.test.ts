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

import AppointmentPage from './AppointmentPage.vue'

const appointData = {
  items: [{ id: 'mem-001', name: '陈雨桐', departmentName: '技术部', title: '干事' }],
  departments: [{ id: 'dept-1', name: '技术部' }],
  titles: ['部长', '副部长'],
  commands: [{ id: 'apc-1', memberName: '王浩然', action: 'appoint', status: 'pending_exec', scheduledAt: null }],
}

describe('AppointmentPage 任命调岗免职', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染成员与待执行命令', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: appointData })
    const wrapper = mount(AppointmentPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/members/appointments')
    expect(wrapper.text()).toContain('陈雨桐')
    expect(wrapper.text()).toContain('王浩然')
  })

  it('加载失败：不渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(AppointmentPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('陈雨桐')
  })
})
