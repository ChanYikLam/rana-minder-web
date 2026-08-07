import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost, mockPush } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn(), mockPush: vi.fn() }))
const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({ mockToastSuccess: vi.fn(), mockToastError: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-004' } }),
  useRouter: () => ({ push: mockPush }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}))

import ClubAccessWizardPage from './ClubAccessWizardPage.vue'

// NameSearch stub：支持 v-model 输入与结果选择，供向导流程驱动
const wizardStubs = {
  ...pageStubs,
  NameSearch: {
    props: ['modelValue', 'results', 'loading', 'placeholder'],
    emits: ['update:modelValue', 'select'],
    template: '<div><input type="text" :value="modelValue" placeholder="搜索" @input="$emit(\'update:modelValue\', $event.target.value)" /><button v-for="r in results" :key="r.id" class="ns-result" @click="$emit(\'select\', r)">{{ r.name }}</button></div>',
  },
}

const clubGroup = {
  id: 'grp-1', name: '摄影协会', stableId: 'G-PHOTO', path: '/学校学生组织/摄影协会', parentId: null,
  purpose: 'club', boundClubId: null, memberCount: 10,
}

const groupDetail = {
  id: 'grp-1', name: '摄影协会', stableId: 'G-PHOTO', path: '/学校学生组织/摄影协会', purpose: 'club', boundClubId: null,
  members: [{ id: 'm1', name: '张三' }, { id: 'm2', name: '李四' }],
  leaderGroups: [],
  departments: [{ id: 'd1', name: '宣传部', stableId: 'G-D1', path: '/学校学生组织/摄影协会/宣传部', parentId: 'grp-1', purpose: 'department', boundClubId: null, memberCount: 5 }],
  positions: [{ id: 'r1', name: '会长', stableId: 'G-R1', path: '/学校学生组织/摄影协会/会长', parentId: 'grp-1', purpose: 'position', boundClubId: null, memberCount: 1 }],
}

describe('ClubAccessWizardPage 社团接入向导', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('加载成功：并行加载 Casdoor Group 与已有社团，进入步骤一', async () => {
    // mockResolvedValueOnce 优先于默认值，按调用顺序设置：groups → clubs
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { items: [clubGroup] },
    })
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ clubId: 'club-004', clubName: '摄影协会', status: 'wizard_pending' }] },
    })
    const wrapper = mount(ClubAccessWizardPage, { global: { stubs: wizardStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/admin/groups')
    expect(mockGet).toHaveBeenCalledWith('/admin/clubs')
    // 向导步骤一渲染
    expect(wrapper.text()).toContain('选择社团 Casdoor Group')
    expect(wrapper.text()).toContain('下一步')
    wrapper.unmount()
  })

  it('加载失败：请求已发出且页面可操作（向导步骤照常渲染）', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(ClubAccessWizardPage, { global: { stubs: wizardStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/admin/groups')
    expect(wrapper.text()).toContain('下一步')
    wrapper.unmount()
  })

  it('完整流程：选 Group → 填资料 → 选部门/职位/负责人 → 校验全通过 → 创建接入任务', async () => {
    vi.useFakeTimers()
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [clubGroup] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [] } })
    // 搜索
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [clubGroup] } })
    // Group 详情
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: groupDetail })
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
    mockPost.mockResolvedValue({ kind: 'completed', data: { id: 'club-new', status: 'wizard_pending' } })

    const wrapper = mount(ClubAccessWizardPage, { global: { stubs: wizardStubs } })
    await flushPromises()

    // 未选 Group 时下一步禁用
    const nextBtn = wrapper.findAll('button').find((b) => b.text().includes('下一步'))
    expect(nextBtn!.attributes('disabled'), '未选 Group 禁用').toBeDefined()

    // 输入关键字触发搜索（300ms 防抖）
    const searchInput = wrapper.find('input[placeholder="搜索"]')
    await searchInput.setValue('摄影')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/admin/groups/search', { q: '摄影' })

    // 选择搜索结果 → 拉取详情
    const resultBtn = wrapper.find('.ns-result')
    expect(resultBtn, '搜索结果按钮').toBeTruthy()
    await resultBtn!.trigger('click')
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/admin/groups/grp-1')
    expect(wrapper.text()).toContain('已选择 摄影协会')

    // 下一步 → 基本信息（名称默认取 Group 名）
    await nextBtn!.trigger('click')
    expect(wrapper.text()).toContain('配置社团展示资料')
    // 下一步 → 部门与职位
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    expect(wrapper.text()).toContain('配置部门与职位 Group')

    // 勾选部门 + 职位 + 选负责人
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    await checkboxes[0].setValue(true)
    await checkboxes[1].setValue(true)
    const leaderSelect = wrapper.find('select')
    await leaderSelect.setValue('r1')
    await flushPromises()

    // 下一步 → 校验
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    expect(wrapper.text()).toContain('接入前校验')
    expect(wrapper.text()).toContain('负责人职位已指定且在层级下')

    // 创建接入任务
    const createBtn = wrapper.findAll('button').find((b) => b.text().includes('创建接入任务'))
    expect(createBtn, '创建按钮').toBeTruthy()
    await createBtn!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/admin/clubs/wizard', expect.objectContaining({
      groupId: 'grp-1',
      name: '摄影协会',
      leaderRoleGroup: 'r1',
      deptGroups: ['d1'],
      roleGroups: ['r1'],
    }))
    expect(mockToastSuccess).toHaveBeenCalledWith('接入条目已创建')
    expect(wrapper.text()).toContain('接入条目已创建')
    wrapper.unmount()
  })

  it('校验拦截：Group 已被绑定 → 校验页显示未通过且创建按钮禁用', async () => {
    vi.useFakeTimers()
    // GET 顺序：groups → clubs → search → groups/{id}(detail)
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ ...clubGroup, boundClubId: 'club-001' }] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ ...clubGroup, boundClubId: 'club-001' }] } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { ...groupDetail, boundClubId: 'club-001' } })
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
    const wrapper = mount(ClubAccessWizardPage, { global: { stubs: wizardStubs } })
    await flushPromises()

    // 显式搜索并选择已被绑定的 Group（不依赖 mount 时的候选填充）
    const searchInput = wrapper.find('input[placeholder="搜索"]')
    await searchInput.setValue('摄影')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    const resultBtn = wrapper.find('.ns-result')
    expect(resultBtn, '搜索结果按钮').toBeTruthy()
    await resultBtn!.trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    // 勾选职位并选负责人
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    await checkboxes[0].setValue(true)
    await checkboxes[1].setValue(true)
    await wrapper.find('select').setValue('r1')
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    await flushPromises()

    // 校验页：无重复绑定未通过，创建按钮禁用
    expect(wrapper.text()).toContain('无重复绑定')
    const createBtn = wrapper.findAll('button').find((b) => b.text().includes('创建接入任务'))
    expect(createBtn!.attributes('disabled'), '校验未通过禁用').toBeDefined()
    wrapper.unmount()
  })
})
