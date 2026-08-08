import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import AdminJointListPage from './AdminJointListPage.vue'

const joint = {
  id: 'jnt-1', title: '联合招新', status: 'recruiting', participants: ['网络协会'],
  applicantCount: 10, canForceClose: true, clubs: [{ clubId: 'club-001', clubName: '计算机协会', suspended: false }],
}

describe('AdminJointListPage 平台联合活动列表', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染联合活动列表', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [joint] } })
    const wrapper = mount(AdminJointListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/admin/joint')
    expect(wrapper.text()).toContain('联合招新')
  })

  it('加载失败：按错误码映射状态', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-003', message: '无权限' } })
    const wrapper = mount(AdminJointListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('联合招新')
  })

  it('切换参与社团停用/恢复：请求对应端点', async () => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [joint] } })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(AdminJointListPage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 停用未挂起社团
    const suspendBtn = wrapper.findAll('button').find((b) => b.text().includes('停用'))
    expect(suspendBtn, '停用按钮应渲染').toBeTruthy()
    await suspendBtn!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/admin/joint/jnt-1/clubs/club-001/force-suspend', {})
  })

  it('恢复已挂起社团：请求 re-enable 端点', async () => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ ...joint, clubs: [{ clubId: 'club-001', clubName: '计算机协会', suspended: true }] }] },
    })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(AdminJointListPage, { global: { stubs: pageStubs } })
    await flushPromises()

    const restoreBtn = wrapper.findAll('button').find((b) => b.text().includes('恢复'))
    expect(restoreBtn, '恢复按钮应渲染').toBeTruthy()
    await restoreBtn!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/admin/joint/jnt-1/clubs/club-001/re-enable', {})
  })

  it('强制关闭联合活动：@confirm 携带 reauthProof 提交，reason 必填', async () => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [joint] } })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(AdminJointListPage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 打开强制关闭弹窗
    const forceBtn = wrapper.findAll('button').find((b) => b.text().includes('强制关闭'))
    expect(forceBtn, '强制关闭按钮').toBeTruthy()
    await forceBtn!.trigger('click')
    await flushPromises()

    const hrc = wrapper.find('.hrc')
    expect(hrc.exists(), '高危确认弹窗').toBe(true)
    // 空原因点确认被拦截
    await hrc.find('.hrc-confirm').trigger('click')
    await flushPromises()
    expect(hrc.text()).toContain('请填写强制关闭原因')
    expect(mockPost).not.toHaveBeenCalled()

    // 填原因后确认：携带 reauthProof
    const reasonInput = hrc.find('input[placeholder*="强制关闭原因"]')
    expect(reasonInput.exists(), '强制关闭原因输入').toBe(true)
    await reasonInput.setValue('合规问题紧急下线')
    await hrc.find('.hrc-confirm').trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/admin/joint/jnt-1/force-close', {
      reason: '合规问题紧急下线',
      reauthProof: 'mock-reauth-proof',
    })
  })
})
