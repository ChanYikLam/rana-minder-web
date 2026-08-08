import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
const { mockToastSuccess, mockToastError, mockToastWarning } = vi.hoisted(() => ({ mockToastSuccess: vi.fn(), mockToastError: vi.fn(), mockToastWarning: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError, warning: mockToastWarning },
}))
vi.mock('@/utils/toastError', () => ({
  toastError: mockToastError,
}))

import ClubManagePage from './ClubManagePage.vue'

const enabledClub = {
  clubId: 'club-001', clubName: '计算机协会', status: 'enabled', memberCount: 128,
  createdAt: '2025-09-01T00:00:00Z', readonly: false, groupId: 'g1', groupName: '计算机协会',
  leaderName: '李思颖', boundAt: '2025-09-02T00:00:00Z', freezeExtensionMs: 0,
  hasActiveBusiness: false, importedCount: 0, importedAt: null, syncEvents: [], wizard: null, wizardStep: 0,
}

describe('ClubManagePage 社团管理', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('加载成功：请求社团列表并渲染页面', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [enabledClub] },
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

  it('接入向导：搜索 Group → 选中 → 指定负责人 → 完成接入并切到管理页', async () => {
    vi.useFakeTimers()
    const pendingClub = { ...enabledClub, status: 'wizard_pending', wizard: null, wizardStep: 0, importedCount: 0 }
    const groupDetail = {
      id: 'g1', name: '计算机协会', stableId: 'S-GDMU-001', path: '/社团/计算机协会', parentId: null,
      purpose: 'club', boundClubId: null,
      members: [{ id: 'm1', name: '张三' }, { id: 'm2', name: '李四' }],
      leaderGroups: [{ id: 'l1', name: '会长', memberCount: 1 }],
    }
    // GET 顺序：clubs(初始) → groups/search → clubs(save-step 后重载) → groups/{id}(详情)
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [pendingClub] } })
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { items: [{ id: 'g1', name: '计算机协会', stableId: 'S-GDMU-001', path: '/社团/计算机协会', parentId: null, purpose: 'club', boundClubId: null, memberCount: 2, match: 'exact', score: 1 }] },
    })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [pendingClub] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: groupDetail })
    // 后续重载（selectLeader/complete 后 loadData）一律返回 clubs 列表，保证 items 恒为数组
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [pendingClub] } })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })

    const wrapper = mount(ClubManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    // 向导卡片出现
    expect(wrapper.text()).toContain('接入向导')
    expect(wrapper.text()).toContain('计算机协会')

    // 搜索 Group（NameSearch 输入触发防抖搜索；dropdown 需 focus 才展开）
    const searchInput = wrapper.find('input[aria-label="搜索名称"]')
    await searchInput.trigger('focus')
    await searchInput.setValue('计算机')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/admin/groups/search', { q: '计算机' })

    // 点击搜索结果 → save-step + 拉取详情
    // 注：NameSearch（真实组件）在 mousedown 上触发选中（NameSearch.vue 用 @mousedown.prevent），
    // 该事件序列等同真实用户点击（mousedown→mouseup→click 的首发事件）；选中结果由下方 save-step 请求断言。
    const optionBtn = wrapper.findAll('button[role="option"]').find((b) => b.text().includes('计算机协会'))
    expect(optionBtn, '搜索结果选项').toBeTruthy()
    await optionBtn!.trigger('mousedown')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/admin/clubs/wizard/save-step', expect.objectContaining({ step: 1, selectedGroupId: 'g1' }))

    // 指定负责人
    const leaderRadio = wrapper.find('input[type="radio"]')
    expect(leaderRadio.exists(), '负责人单选').toBe(true)
    await leaderRadio.setValue('l1')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/admin/clubs/wizard/save-step', expect.objectContaining({ step: 2, leaderGroupId: 'l1' }))

    // 完成接入
    const completeBtn = wrapper.findAll('button').find((b) => b.text().includes('完成接入并启用'))
    expect(completeBtn, '完成接入按钮').toBeTruthy()
    await completeBtn!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/admin/clubs/wizard/complete', { clubId: 'club-001' })
    expect(mockToastSuccess).toHaveBeenCalledWith('接入完成，社团已启用')
    wrapper.unmount()
  })

  it('接入向导：未选 Group 直接完成时拦截', async () => {
    const pendingClub = { ...enabledClub, status: 'wizard_pending', wizard: null, wizardStep: 0 }
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [pendingClub] } })
    const wrapper = mount(ClubManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('完成接入并启用'))!.trigger('click')
    expect(mockToastWarning).toHaveBeenCalledWith('请先选择要接入的 Group')
    wrapper.unmount()
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

  it('普通停用：打开高危确认 → 填原因 → 确认执行', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [enabledClub] } })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(ClubManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 切到社团管理页
    await wrapper.findAll('button').find((b) => b.text().includes('社团管理'))!.trigger('click')
    expect(wrapper.text()).toContain('当前成员 128 名')

    await wrapper.findAll('button').find((b) => b.text().includes('普通停用'))!.trigger('click')
    // 停用原因输入框出现 + 高危确认打开
    const reasonInput = wrapper.find('input[placeholder="请输入停用原因"]')
    expect(reasonInput.exists(), '停用原因输入').toBe(true)
    await reasonInput.setValue('业务调整')
    await wrapper.find('.hrc-confirm').trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/admin/clubs/club-001/normal-suspend', { reason: '业务调整' })
    expect(mockToastSuccess).toHaveBeenCalledWith('操作已执行')
    wrapper.unmount()
  })

  it('修复/重绑：sync_abnormal_ro 态修复原 Group', async () => {
    const abnormalClub = { ...enabledClub, status: 'sync_abnormal_ro' }
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [abnormalClub] } })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(ClubManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('社团管理'))!.trigger('click')
    const repairBtn = wrapper.findAll('button').find((b) => b.text().includes('修复原 Group'))
    expect(repairBtn, '修复按钮').toBeTruthy()
    await repairBtn!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/admin/clubs/club-001/repair')
    expect(mockToastSuccess).toHaveBeenCalledWith('已修复原 Group 并进入停用状态')
    wrapper.unmount()
  })
})
