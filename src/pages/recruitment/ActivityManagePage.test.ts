import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost, mockPut } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn(), mockPut: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001', activityId: 'act-1' } }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
  put: (...args: unknown[]) => mockPut(...args),
}))

import ActivityManagePage from './ActivityManagePage.vue'

function detail(status: string, channelStatus: string) {
  return {
    id: 'act-1', title: '秋季招新', description: '面向全校招新', status, channelStatus,
    deadline: '2026-09-01T00:00:00Z', applicantCount: 12, interviewCount: 3, invitationCount: 2,
    version: 2, departments: [{ id: 'd1', name: '技术部' }],
  }
}

async function mountPage(overrides: { status: string; channelStatus: string }) {
  mockGet.mockResolvedValue({ kind: 'completed', data: detail(overrides.status, overrides.channelStatus) })
  const wrapper = mount(ActivityManagePage, { global: { stubs: pageStubs } })
  await flushPromises()
  return wrapper
}

describe('ActivityManagePage 招新活动管理', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染活动详情', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: detail('in_progress', 'open') })
    const wrapper = mount(ActivityManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/recruitment/act-1')
    expect(wrapper.text()).toContain('秋季招新')
    // 统计卡片渲染（报名/面试/邀请数量绑定具体值）
    expect(wrapper.text()).toContain('报名申请')
    expect(wrapper.text()).toContain('12')
    expect(wrapper.text()).toContain('面试安排')
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('录取邀请')
    expect(wrapper.text()).toContain('2')
    wrapper.unmount()
  })

  it('加载失败：不渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(ActivityManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('秋季招新')
  })

  it('通道操作：开放/关闭/暂停通道', async () => {
    const wrapper = await mountPage({ status: 'in_progress', channelStatus: 'closed' })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    // 关闭态可开放通道
    const openBtn = wrapper.findAll('button').find((b) => b.text().includes('开放/重开通道'))
    expect(openBtn, '开放通道按钮').toBeTruthy()
    await openBtn!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/channel', expect.objectContaining({ action: 'open', newDeadline: expect.any(String) }))
    wrapper.unmount()
  })

  it('通道关闭与暂停：channelStatus=open 显示关闭/暂停/收紧按钮', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: detail('in_progress', 'open') })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: detail('in_progress', 'closed') })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(ActivityManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('关闭通道')
    expect(wrapper.text()).toContain('暂停通道')
    expect(wrapper.text()).toContain('收紧规则')

    await wrapper.findAll('button').find((b) => b.text().includes('关闭通道'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/channel', { action: 'close', reason: '报满关闭' })
    wrapper.unmount()
  })

  it('收紧规则：无原因拦截、成功提交并重载', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: detail('in_progress', 'open') })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: detail('in_progress', 'paused') })
    mockPost.mockResolvedValue({ kind: 'completed', data: { affectedCount: 5 } })
    const wrapper = mount(ActivityManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('收紧规则'))!.trigger('click')
    expect(wrapper.text()).toContain('补救窗口（天）')
    // 无原因拦截
    await wrapper.findAll('button').find((b) => b.text().includes('确认收紧'))!.trigger('click')
    expect(wrapper.text()).toContain('必须填写收紧原因')

    // 填原因后成功（成功后面板关闭并重载详情）
    const reasonTextarea = wrapper.find('textarea')
    await reasonTextarea.setValue('报名质量下降')
    await wrapper.findAll('button').find((b) => b.text().includes('确认收紧'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/rules/tighten', { reason: '报名质量下降', deadlineDays: 7 })
    expect(mockGet).toHaveBeenLastCalledWith('/org/club-001/recruitment/act-1')
    wrapper.unmount()
  })

  it('编辑活动：标题空拦截、保存成功调用 PUT', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: detail('in_progress', 'open') })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: detail('in_progress', 'open') })
    mockPut.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(ActivityManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('编辑活动'))!.trigger('click')
    expect(wrapper.text()).toContain('保存修改')
    // 清空标题拦截
    const titleInput = wrapper.find('input[placeholder="活动名称"]')
    await titleInput.setValue('')
    await wrapper.findAll('button').find((b) => b.text().includes('保存修改'))!.trigger('click')
    expect(wrapper.text()).toContain('活动名称不能为空')

    // 修改后保存成功
    await titleInput.setValue('秋季招新 2026')
    const descTextarea = wrapper.find('textarea')
    await descTextarea.setValue('新描述')
    await wrapper.findAll('button').find((b) => b.text().includes('保存修改'))!.trigger('click')
    await flushPromises()
    expect(mockPut).toHaveBeenCalledWith('/org/club-001/recruitment/act-1', { title: '秋季招新 2026', description: '新描述' })
    wrapper.unmount()
  })

  it('编辑活动：保存失败展示后端错误且面板不关闭', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: detail('in_progress', 'open') })
    mockPut.mockResolvedValue({ kind: 'rejected', error: { code: 'EDIT-001', message: '数据版本已过期' } })
    const wrapper = mount(ActivityManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('编辑活动'))!.trigger('click')
    const titleInput = wrapper.find('input[placeholder="活动名称"]')
    await titleInput.setValue('秋季招新 2026')
    await wrapper.findAll('button').find((b) => b.text().includes('保存修改'))!.trigger('click')
    await flushPromises()
    expect(mockPut).toHaveBeenCalledWith('/org/club-001/recruitment/act-1', { title: '秋季招新 2026', description: '面向全校招新' })
    expect(wrapper.text()).toContain('数据版本已过期')
    expect(wrapper.text()).toContain('保存修改')
    wrapper.unmount()
  })

  it('状态操作：暂停与结束活动（HighRiskConfirm 确认）', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: detail('in_progress', 'open') })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: detail('paused', 'open') })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(ActivityManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 暂停
    await wrapper.findAll('button').find((b) => b.text().includes('暂停活动'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/pause', { reason: '临时调整' })
    // 暂停后显示恢复按钮
    expect(wrapper.text()).toContain('恢复活动')

    // 恢复
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: detail('in_progress', 'open') })
    await wrapper.findAll('button').find((b) => b.text().includes('恢复活动'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/resume', {})
    wrapper.unmount()
  })

  it('结束活动：走 HighRiskConfirm 确认后调用 complete', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: detail('in_progress', 'open') })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: detail('completed', 'closed') })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(ActivityManagePage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('结束活动'))!.trigger('click')
    const hrcConfirm = wrapper.find('.hrc-confirm')
    expect(hrcConfirm.exists(), '高危确认按钮').toBe(true)
    await hrcConfirm.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/complete', {})
    wrapper.unmount()
  })
})
