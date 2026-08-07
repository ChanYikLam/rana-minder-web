import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import AdminRecruitmentListPage from './AdminRecruitmentListPage.vue'

describe('AdminRecruitmentListPage 平台招新列表', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染跨社团招新列表', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'act-1', title: '联合招新', clubName: '网络协会', status: 'recruiting', applicantCount: 20, canForceComplete: true }] },
    })
    const wrapper = mount(AdminRecruitmentListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/admin/recruitment')
    expect(wrapper.text()).toContain('联合招新')
    expect(wrapper.text()).toContain('网络协会')
  })

  it('强制结束：空原因点确认被拦截并提示', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'act-1', title: '联合招新', clubName: '网络协会', status: 'recruiting', applicantCount: 1, canForceComplete: true }] },
    })
    const wrapper = mount(AdminRecruitmentListPage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 打开强制结束确认弹窗（HighRiskConfirm stub）
    await wrapper.findAll('button').find((b) => b.text().includes('强制结束'))!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.hrc').exists()).toBe(true)

    // 原因留空直接确认 → 被拦截
    await wrapper.find('.hrc-confirm').trigger('click')
    await flushPromises()

    expect(wrapper.find('.hrc').text()).toContain('请填写强制结束原因')
    expect(mockPost).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('强制结束：填写原因后提交并关闭弹窗', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'act-1', title: '联合招新', clubName: '网络协会', status: 'recruiting', applicantCount: 1, canForceComplete: true }] },
    })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(AdminRecruitmentListPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('强制结束'))!.trigger('click')
    await wrapper.find('input[placeholder*="强制结束原因"]').setValue('活动异常终止')
    await wrapper.find('.hrc-confirm').trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/admin/recruitment/act-1/force-complete', { reason: '活动异常终止' })
    // 成功后关闭弹窗（重新加载列表触发第二次 get）
    expect(mockGet).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})
