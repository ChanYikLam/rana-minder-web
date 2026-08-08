import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
const routeState = vi.hoisted(() => ({ value: { params: { clubId: 'club-001' }, meta: { view: 'manage' } } }))
vi.mock('vue-router', () => ({
  useRoute: () => routeState.value,
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import MembershipInvitePage from './MembershipInvitePage.vue'

describe('MembershipInvitePage 常规入社邀请', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('管理视图：加载邀请列表与部门', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'inv-1', candidateName: '周明轩', status: 'sent', departmentName: '技术部' }], departments: [{ id: 'dept-1', name: '技术部' }] },
    })
    const wrapper = mount(MembershipInvitePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/members/invite')
    expect(wrapper.text()).toContain('周明轩')
  })

  it('加载失败：不渲染列表', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(MembershipInvitePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('周明轩')
  })

  it('sync_failed 状态：被邀请人视角显示“确认生效”重试按钮（SM-MEM-004 sync_failed -> retry）', async () => {
    routeState.value = { params: { clubId: 'club-001' }, meta: { view: 'invitee' } }
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'inv-2', candidateName: '周明轩', candidateStudentId: '20240010', clubName: '计算机协会', status: 'sync_failed', departmentName: '技术部', sentAt: '2026-08-01T04:00:00Z', acceptedAt: '2026-08-02T04:00:00Z', expiredAt: '2026-08-08T04:00:00Z' }] },
    })
    const wrapper = mount(MembershipInvitePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.findAll('button').some((b) => b.text().includes('确认生效'))).toBe(true)
    expect(wrapper.text()).toContain('同步失败')
    wrapper.unmount()
    routeState.value = { params: { clubId: 'club-001' }, meta: { view: 'manage' } }
  })
})
