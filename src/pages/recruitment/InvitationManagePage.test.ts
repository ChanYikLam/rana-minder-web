import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001', activityId: 'act-1' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import InvitationManagePage from './InvitationManagePage.vue'

describe('InvitationManagePage 录取邀请管理', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染邀请列表（三个接口契约齐全）', async () => {
    // onMounted 顺序：invitations → applications + departments（并行）
    // mockResolvedValueOnce 优先于默认值，按调用顺序设置
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { items: [{ id: 'inv-1', applicantId: 'app-1', applicantName: '张三', departmentId: 'dept-1', departmentName: '技术部', status: 'sent', sentAt: '2026-08-01T04:00:00Z', acceptedAt: null, expiredAt: '2026-08-08T04:00:00Z', version: 1 }] },
    })
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { items: [{ applicantId: 'app-1', applicantName: '张三', status: 'accepted' }] },
    })
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { departments: [{ id: 'dept-1', name: '技术部' }] },
    })
    const wrapper = mount(InvitationManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/invitations')
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/applications')
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/recruitment/act-1')
    expect(wrapper.text()).toContain('张三')
    expect(wrapper.text()).toContain('技术部')
    wrapper.unmount()
  })

  it('加载失败：不渲染列表', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(InvitationManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('张三')
  })
})
