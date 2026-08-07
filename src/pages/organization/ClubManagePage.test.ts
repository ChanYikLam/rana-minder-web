import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import ClubManagePage from './ClubManagePage.vue'

describe('ClubManagePage 社团管理', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：请求社团列表并渲染页面', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ clubId: 'club-001', clubName: '计算机协会', status: 'enabled', memberCount: 128 }] },
    })
    const wrapper = mount(ClubManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/admin/clubs')
    expect(wrapper.text()).toContain('社团接入管理')
  })

  it('加载失败：不渲染列表', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(ClubManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('计算机协会')
  })

  it('向导回显已存 wizard 的 dept/role/leaderRoleGroup，并在切换负责人时 save-step 携带完整字段（P1 修复）', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/admin/clubs') {
        return Promise.resolve({
          kind: 'completed',
          data: {
            items: [{
              clubId: 'club-004', clubName: '摄影协会', status: 'wizard_pending', groupId: null, memberCount: 3,
              wizardStep: 2,
              // 负责人尚未指定：回显部门/职位选择后，用户点选负责人触发 save-step
              wizard: { selectedGroupId: 'grp-004', leaderGroupId: null, email: '', deptGroups: ['grp-dept-004'], roleGroups: ['grp-vice-004'], leaderRoleGroup: '' },
            }],
          },
        })
      }
      if (path === '/admin/groups/grp-004') {
        return Promise.resolve({
          kind: 'completed',
          data: {
            id: 'grp-004', name: '摄影协会', stableId: 'G-PHOTO-CLUB', path: '/学校学生组织/摄影协会', parentId: 'grp-root',
            purpose: 'club', boundClubId: null, members: [],
            leaderGroups: [{ id: 'grp-lead-004', name: '摄影协会负责人', memberCount: 1 }],
          },
        })
      }
      return Promise.resolve({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(ClubManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    await flushPromises()

    // 回显的部门/职位选择应保留在本地状态（P1 修复：不再因仅切负责人而丢失）
    const leaderRadio = wrapper.find('input[type="radio"]')
    expect(leaderRadio.exists()).toBe(true)
    await leaderRadio.setValue()
    await flushPromises()

    const postCall = mockPost.mock.calls.find((c) => c[0] === '/admin/clubs/wizard/save-step')
    expect(postCall).toBeTruthy()
    if (!postCall) return
    const body = postCall[1] as { step: number; selectedGroupId: string; leaderGroupId: string; deptGroups: string[]; roleGroups: string[]; leaderRoleGroup: string }
    expect(body.step).toBe(2)
    expect(body.selectedGroupId).toBe('grp-004')
    expect(body.leaderGroupId).toBe('grp-lead-004')
    // P1 修复核心：save-step 携带此前已选的部门/职位，避免 complete 时映射丢失
    expect(body.deptGroups).toEqual(['grp-dept-004'])
    expect(body.roleGroups).toEqual(['grp-vice-004'])
    expect(body.leaderRoleGroup).toBe('grp-lead-004')
  })
})
