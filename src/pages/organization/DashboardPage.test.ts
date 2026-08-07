import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPush } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPush: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001' } }),
  useRouter: () => ({ push: mockPush }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
}))

import DashboardPage from './DashboardPage.vue'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'

describe('DashboardPage 社团工作台', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染社团名与待办', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', ['club:recruitment:manage', 'club:member:manage'], 'user-001')
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: {
        club: { id: 'club-001', name: '计算机协会' }, role: 'club_leader', permissions: [],
        metrics: { pendingReviews: 3, pendingInterviews: 2, pendingResults: 1, syncErrors: 0 },
        todos: [{ id: 't1', type: 'application_review', title: '待评审申请', count: 3 }], recentActivities: [],
      },
    })
    const wrapper = mount(DashboardPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/dashboard')
    expect(wrapper.text()).toContain('计算机协会')
    expect(wrapper.text()).toContain('待评审申请')
  })

  it('无权限的待办类型被过滤', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'member', ['club:recruitment:manage'], 'user-001')
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: {
        club: { id: 'club-001', name: '计算机协会' }, role: 'member', permissions: [],
        todos: [{ id: 't1', type: 'application_review', title: '待评审申请', count: 3 }, { id: 't2', type: 'interview_schedule', title: '待排期面试', count: 1 }],
        recentActivities: [],
      },
    })
    const wrapper = mount(DashboardPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('待评审申请')
    expect(wrapper.text()).toContain('待排期面试')
  })

  it('加载失败：不渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(DashboardPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('计算机协会')
  })
})
