import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001' } }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import TransitionPage from './TransitionPage.vue'

const transitionData = {
  currentLeader: { id: 'mem-004', name: '张明远', title: '负责人' },
  candidates: [{ memberId: 'mem-002', name: '王浩然', currentTitle: '副部长', proposedTitle: '负责人', department: '技术部' }],
  appointments: [],
  canExecute: true,
  executedAt: null,
  results: [],
}

const membersPayload = {
  items: [
    { id: 'mem-001', name: '赵一', studentId: 'S001', department: '技术部', title: '干事', status: 'active' },
    { id: 'mem-002', name: '王浩然', studentId: 'S002', department: '技术部', title: '副部长', status: 'active' },
    { id: 'mem-003', name: '李思颖', studentId: 'S003', department: '人事部', title: '部长', status: 'active' },
  ],
}

function mockBothGets() {
  // 深拷贝避免 addPlanItem 等就地修改污染后续测试
  mockGet.mockImplementation(async (url: string) => {
    if (url === '/org/club-001/members/transition') {
      return { kind: 'completed', data: JSON.parse(JSON.stringify(transitionData)) }
    }
    if (url === '/org/club-001/members') return { kind: 'completed', data: JSON.parse(JSON.stringify(membersPayload)) }
    return { kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } }
  })
}

async function addPlanItemViaUI(wrapper: VueWrapper, memberId: string, title: string) {
  // 1. 点击"编辑方案"打开编辑器
  const openBtn = wrapper.findAll('button').find((b) => b.text().includes('编辑方案'))
  expect(openBtn, '编辑方案按钮').toBeTruthy()
  await openBtn!.trigger('click')
  await flushPromises()

  // 2. 通过 select/input 的 v-model 写入编辑态
  const selects = wrapper.findAll('select')
  // 第一个 select 是方案类型（默认 candidates），第二个是成员下拉
  const memberSelect = selects[1]
  expect(memberSelect.exists(), '成员下拉').toBe(true)
  await memberSelect.setValue(memberId)

  const titleInput = wrapper.find('input[aria-label="目标职位"]')
  expect(titleInput.exists(), '目标职位输入').toBe(true)
  await titleInput.setValue(title)

  // 3. 点击"加入方案"
  const addBtn = wrapper.findAll('button').find((b) => b.text().trim() === '加入方案')
  expect(addBtn, '加入方案按钮').toBeTruthy()
  await addBtn!.trigger('click')
  await flushPromises()
}

describe('TransitionPage 换届管理', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染换届方案', async () => {
    mockBothGets()
    const wrapper = mount(TransitionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/members/transition')
    expect(wrapper.text()).toContain('张明远')
    expect(wrapper.text()).toContain('王浩然')
  })

  it('已执行：展示执行结果', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/org/club-001/members/transition') {
        return { kind: 'completed', data: { ...JSON.parse(JSON.stringify(transitionData)), executedAt: '2026-08-01T04:00:00Z', results: [{ memberId: 'mem-002', name: '王浩然', action: 'promote', targetTitle: '负责人', success: true, message: '完成' }] } }
      }
      if (url === '/org/club-001/members') return { kind: 'completed', data: JSON.parse(JSON.stringify(membersPayload)) }
      return { kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } }
    })
    const wrapper = mount(TransitionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('完成')
  })

  it('加载失败：不渲染方案', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(TransitionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('张明远')
  })

  it('越权码（IFC-ERR-003）映射 forbidden：不渲染方案', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-003', message: '无权限' } })
    const wrapper = mount(TransitionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('张明远')
    wrapper.unmount()
  })
})

describe('TransitionPage 未保存方案与执行拦截', () => {
  const wrappers: VueWrapper[] = []
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => {
    wrappers.forEach((w) => w.unmount())
    wrappers.length = 0
    vi.restoreAllMocks()
  })

  function trackedMount(): VueWrapper {
    const w = mount(TransitionPage, { global: { stubs: pageStubs } })
    wrappers.push(w)
    return w
  }

  it('加载完成且未编辑时：不展示"未保存"提示', async () => {
    mockBothGets()
    const wrapper = trackedMount()
    await flushPromises()
    expect(wrapper.find('[data-testid="plan-dirty"]').exists()).toBe(false)
  })

  it('编辑后未保存：展示"未保存"提示', async () => {
    mockBothGets()
    const wrapper = trackedMount()
    await flushPromises()
    await addPlanItemViaUI(wrapper, 'mem-001', '部长')
    expect(wrapper.find('[data-testid="plan-dirty"]').exists()).toBe(true)
  })

  it('执行且有未保存：先调用 plan 接口保存，成功后才打开确认弹窗', async () => {
    mockBothGets()
    const wrapper = trackedMount()
    await flushPromises()
    mockPost.mockResolvedValue({ kind: 'completed', data: { saved: true } })
    await addPlanItemViaUI(wrapper, 'mem-001', '部长')
    expect(wrapper.find('[data-testid="plan-dirty"]').exists()).toBe(true)

    // 点击"保存并执行换届"
    const execBtn = wrapper.findAll('button').find((b) => b.text().includes('保存并执行换届'))
    expect(execBtn, '保存并执行换届按钮').toBeTruthy()
    await execBtn!.trigger('click')
    await flushPromises()

    // 已触发自动保存
    const planCalls = mockPost.mock.calls.filter((c) => String(c[0]).endsWith('/transition/plan'))
    expect(planCalls).toHaveLength(1)
    // 确认弹窗已打开
    expect(wrapper.find('.hrc').exists()).toBe(true)
  })

  it('执行且有未保存但保存失败：不打开确认弹窗', async () => {
    mockBothGets()
    const wrapper = trackedMount()
    await flushPromises()
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: '保存失败' } })
    await addPlanItemViaUI(wrapper, 'mem-001', '部长')

    const execBtn = wrapper.findAll('button').find((b) => b.text().includes('保存并执行换届'))
    expect(execBtn, '保存并执行换届按钮').toBeTruthy()
    await execBtn!.trigger('click')
    await flushPromises()

    const planCalls = mockPost.mock.calls.filter((c) => String(c[0]).endsWith('/transition/plan'))
    expect(planCalls).toHaveLength(1)
    // 保存失败，弹窗不打开
    expect(wrapper.find('.hrc').exists()).toBe(false)
  })

  it('保存成功后脏标记被清除', async () => {
    mockBothGets()
    const wrapper = trackedMount()
    await flushPromises()
    mockPost.mockResolvedValue({ kind: 'completed', data: { saved: true } })
    await addPlanItemViaUI(wrapper, 'mem-001', '部长')
    expect(wrapper.find('[data-testid="plan-dirty"]').exists()).toBe(true)

    const saveBtn = wrapper.findAll('button').find((b) => b.text().trim() === '保存方案')
    expect(saveBtn, '保存方案按钮').toBeTruthy()
    await saveBtn!.trigger('click')
    await flushPromises()
    // 保存成功后，loadData 又被调用一次并把脏标记清掉
    expect(wrapper.find('[data-testid="plan-dirty"]').exists()).toBe(false)
  })

  it('执行且无未保存：直接打开确认弹窗，不触发 plan 接口', async () => {
    mockBothGets()
    const wrapper = trackedMount()
    await flushPromises()

    const execBtn = wrapper.findAll('button').find((b) => b.text().includes('确认执行换届'))
    expect(execBtn, '确认执行换届按钮').toBeTruthy()
    await execBtn!.trigger('click')
    await flushPromises()

    // 未触发自动保存
    const planCalls = mockPost.mock.calls.filter((c) => String(c[0]).endsWith('/transition/plan'))
    expect(planCalls).toHaveLength(0)
    // 确认弹窗已打开
    expect(wrapper.find('.hrc').exists()).toBe(true)
  })
})
