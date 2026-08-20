import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import BatchOperationPage from './BatchOperationPage.vue'

describe('BatchOperationPage 批量操作', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染批量类型选项与步骤一', async () => {
    // 调用顺序：candidates（Once）→ interviewers（默认）
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ memberId: 'mem-001', name: '陈雨桐' }] } })
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [{ id: 'u1', name: '李思颖' }] } })
    const wrapper = mount(BatchOperationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/batch/candidates', undefined, expect.anything())
    expect(wrapper.text()).toContain('1. 选择类型')
    expect(wrapper.text()).toContain('批量分配面试官')
    expect(wrapper.text()).toContain('批量发送邀请')
    wrapper.unmount()
  })

  it('候选加载失败：选择类型进入预览后展示加载失败提示', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(BatchOperationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    // 选择批量类型进入预览步骤后才展示候选加载失败区域（类型为可点击卡片）
    const typeCard = wrapper.findAll('.card').find((c) => c.text().includes('批量分配面试官'))
    expect(typeCard).toBeTruthy()
    await typeCard!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('候选人列表加载失败')
    wrapper.unmount()
  })

  it('批量执行：接重认证组件，填原因 → 确认 → 携带 reauthProof 调用', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ id: 'mem-001', name: '陈雨桐', studentId: '2025001', department: '计算机', status: 'pending' }] } })
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [{ id: 'u1', name: '李思颖' }] } })
    mockPost.mockResolvedValue({ kind: 'completed', data: { results: [{ memberId: 'mem-001', success: true, message: '已处理' }] } })
    const wrapper = mount(BatchOperationPage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 选择类型进入预览
    const typeCard = wrapper.findAll('.card').find((c) => c.text().includes('批量发送邀请'))
    await typeCard!.trigger('click')
    await flushPromises()
    // 勾选候选人
    const checkbox = wrapper.find('input[type="checkbox"]')
    await checkbox.setValue(true)
    await flushPromises()
    // 点击 BatchActionBar 的执行按钮 → 打开高危确认
    const actionBar = wrapper.findComponent({ name: 'BatchActionBar' })
    await actionBar.vm.$emit('execute')
    await flushPromises()

    const hrc = wrapper.find('.hrc')
    expect(hrc.exists(), '批量执行高危确认弹窗').toBe(true)
    // 空原因点确认被拦截
    await hrc.find('.hrc-confirm').trigger('click')
    await flushPromises()
    expect(hrc.text()).toContain('请填写批量执行原因')
    expect(mockPost).not.toHaveBeenCalled()

    // 填原因后确认
    const reasonInput = hrc.find('input[placeholder*="执行原因"]')
    expect(reasonInput.exists(), '原因输入').toBe(true)
    await reasonInput.setValue('社团开放日集中发送邀请')
    await hrc.find('.hrc-confirm').trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/org/club-001/batch/execute', expect.objectContaining({
      action: 'send_invitation',
      memberIds: ['mem-001'],
      reason: '社团开放日集中发送邀请',
      reauthProof: 'mock-reauth-proof',
    }))
    wrapper.unmount()
  })
})

describe('BatchOperationPage 重试失败项', () => {
  beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); vi.clearAllMocks() })
  afterEach(() => vi.restoreAllMocks())

  async function mountWithCandidates() {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [
      { id: 'mem-001', name: '甲', studentId: '1', department: '计算机', status: 'submitted' },
      { id: 'mem-002', name: '乙', studentId: '2', department: '计算机', status: 'submitted' },
    ] } })
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [{ id: 'u1', name: '李思颖' }] } })
    const wrapper = mount(BatchOperationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    return wrapper
  }

  it('部分失败后重试：重新走重认证确认，不再复用旧 proof（一次性 proof 已被消费）', async () => {
    const wrapper = await mountWithCandidates()
    // 每次 batch/execute 均返回部分成功（mem-002 失败），用于验证重试只提交失败项
    mockPost.mockResolvedValue({ kind: 'completed', data: { results: [
      { memberId: 'mem-001', success: true, message: '已发送' },
      { memberId: 'mem-002', success: false, message: '申请人存在身份异常' },
    ] } })

    // 选择类型 → 预览 → 勾选全部 → 执行
    const typeCard = wrapper.findAll('.card').find((c) => c.text().includes('批量发送邀请'))
    await typeCard!.trigger('click')
    await flushPromises()
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    for (const cb of checkboxes) { await cb.setValue(true) }
    await flushPromises()
    const actionBar = wrapper.findComponent({ name: 'BatchActionBar' })
    await actionBar.vm.$emit('execute')
    await flushPromises()

    let hrc = wrapper.find('.hrc')
    await hrc.find('input[placeholder*="执行原因"]').setValue('社团开放日集中发送邀请')
    await hrc.find('.hrc-confirm').trigger('click')
    await flushPromises()

    // 第一次执行携带 proof
    const firstCall = mockPost.mock.calls.find((c) => c[0] === '/org/club-001/batch/execute')!
    const firstBody = firstCall[1] as { reauthProof: string }
    expect(firstBody.reauthProof).toBe('mock-reauth-proof')

    // 结果页部分成功 → 点重试
    expect(wrapper.text()).toContain('部分成功')
    const retryBtn = wrapper.findAll('button').find((b) => b.text().includes('重试失败项'))
    expect(retryBtn, '重试按钮').toBeTruthy()
    const callsBeforeRetry = mockPost.mock.calls.length
    await retryBtn!.trigger('click')
    await flushPromises()

    // 修复前：retryFailed 直接用旧 proof 重发（mockPost 立即 +1）
    // 修复后：重新打开高危确认，等待用户重新认证后再提交
    expect(mockPost.mock.calls.length, '重试不应立即用旧 proof 重发请求').toBe(callsBeforeRetry)
    hrc = wrapper.find('.hrc')
    expect(hrc.exists(), '重试应重新打开高危确认').toBe(true)
    expect(hrc.find('input[placeholder*="执行原因"]').exists(), '重试确认应有原因输入').toBe(true)

    // 重新填写原因并确认 → 携带新的 reauthProof 提交，且只提交失败项
    await hrc.find('input[placeholder*="执行原因"]').setValue('重试身份异常失败项')
    await hrc.find('.hrc-confirm').trigger('click')
    await flushPromises()

    const retryCall = mockPost.mock.calls.find((c) => c[0] === '/org/club-001/batch/execute' && c !== firstCall)!
    const retryBody = retryCall[1] as { memberIds: string[]; reauthProof: string }
    expect(retryBody.memberIds).toEqual(['mem-002'])
    expect(retryBody.reauthProof).toBe('mock-reauth-proof')
    wrapper.unmount()
  })
})

describe('BatchOperationPage 候选加载代次复位', () => {
  beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); vi.clearAllMocks() })
  afterEach(() => vi.restoreAllMocks())

  it('P2-16：并发重新加载时旧请求的 finally 不覆盖在途请求的 loading（按代次复位）', async () => {
    // 首次加载失败 → 进入失败态（出现「重新加载」按钮）
    mockGet.mockResolvedValueOnce({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    // 面试官列表立即返回
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [{ id: 'u1', name: '李思颖' }] } })
    // B1 / B2 均悬起，用可手动 resolve 的 promise 模拟在途请求
    let resolveB1!: (v: unknown) => void
    let resolveB2!: (v: unknown) => void
    mockGet.mockImplementationOnce(() => new Promise((res) => { resolveB1 = res }))
    mockGet.mockImplementationOnce(() => new Promise((res) => { resolveB2 = res }))

    const wrapper = mount(BatchOperationPage, { global: { stubs: pageStubs } })
    await flushPromises()
    // 选择批量类型进入预览后候选卡片才渲染（含重新加载按钮）
    const typeCard = wrapper.findAll('.card').find((c) => c.text().includes('批量发送邀请'))!
    await typeCard.trigger('click')
    await flushPromises()
    const reloadBtn = wrapper.findAll('button').find((b) => b.text().includes('重新加载'))!
    expect(reloadBtn, '首次失败后出现重新加载按钮').toBeTruthy()

    // 同一渲染帧内连点两次：B1 启动后立刻被 B2 abort（B1/B2 同时在途）
    reloadBtn.element.dispatchEvent(new Event('click'))
    reloadBtn.element.dispatchEvent(new Event('click'))
    await flushPromises()
    expect(wrapper.text()).toContain('正在加载候选人...')

    // 旧请求（B1，代次已过期）先完成：不得复位 loading、不得覆盖候选数据
    resolveB1({ kind: 'completed', data: { items: [{ id: 'mem-001', name: '甲', studentId: '1', department: '计算机', status: 'submitted' }] } })
    await flushPromises()
    expect(wrapper.text()).toContain('正在加载候选人...')
    expect(wrapper.text()).not.toContain('甲')

    // 最新请求（B2）完成：才复位 loading 并写入最新数据
    resolveB2({ kind: 'completed', data: { items: [{ id: 'mem-002', name: '乙', studentId: '2', department: '计算机', status: 'submitted' }] } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('正在加载候选人...')
    expect(wrapper.text()).toContain('乙')
    wrapper.unmount()
  })
})

