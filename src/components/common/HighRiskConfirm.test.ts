import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn() }))
vi.mock('@/services/client', () => ({
  post: (...args: unknown[]) => mockPost(...args),
}))

import HighRiskConfirm from './HighRiskConfirm.vue'

// reka-ui Dialog 在 happy-dom 下不稳定，用透传 stub；open 由 prop 控制
const dialogStubs = {
  Dialog: { props: ['open'], template: '<div v-if="open"><slot /></div>' },
  DialogContent: { template: '<div class="hrc-content"><slot /></div>' },
  DialogHeader: { template: '<div><slot /></div>' },
  DialogTitle: { template: '<div><slot /></div>' },
  DialogDescription: { template: '<div><slot /></div>' },
  DialogFooter: { template: '<div class="hrc-footer"><slot /></div>' },
}

function mountDialog(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(HighRiskConfirm, {
    props: {
      open: true,
      title: '高风险操作',
      description: '此操作不可撤销',
      targets: [{ id: 't1', label: '删除社团', detail: '3 条记录' }],
      impactSummary: '影响所有关联数据',
      ...props,
    },
    slots,
    global: { stubs: { ...pageStubs, ...dialogStubs } },
  })
}

describe('HighRiskConfirm 高风险确认', () => {
  beforeEach(() => {
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('预览步骤：渲染影响范围与重认证提示', () => {
    const wrapper = mountDialog({ reauthRequired: true })
    expect(wrapper.text()).toContain('高风险操作')
    expect(wrapper.text()).toContain('删除社团')
    expect(wrapper.text()).toContain('影响所有关联数据')
    expect(wrapper.text()).toContain('此操作需要重新认证')
  })

  it('下一步进入确认步骤', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    expect(wrapper.text()).toContain('请确认操作')
    expect(wrapper.text()).toContain('确认执行')
  })

  it('无重认证确认：emit confirm 并进入执行中', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('确认执行'))!.trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('confirm')?.[0]).toEqual([])
    expect(wrapper.text()).toContain('正在执行...')
  })

  it('取消：emit cancel 并关闭', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('button').find((b) => b.text().includes('取消'))!.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
  })

  it('重认证：空密码被拦截', async () => {
    const wrapper = mountDialog({ reauthRequired: true })
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('验证并执行'))!.trigger('click')
    expect(wrapper.text()).toContain('请输入密码完成身份验证')
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('重认证成功：携带 proof 发送 confirm', async () => {
    mockPost.mockResolvedValue({ kind: 'completed', data: { proof: 'proof-1' } })
    const wrapper = mountDialog({ reauthRequired: true })
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    await wrapper.find('input[type="password"]').setValue('secret')
    await wrapper.findAll('button').find((b) => b.text().includes('验证并执行'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/auth/reauth', { password: 'secret' })
    expect(wrapper.emitted('confirm')?.[0]).toEqual(['proof-1'])
  })

  it('重认证失败：展示服务端 fieldErrors', async () => {
    mockPost.mockResolvedValue({
      kind: 'rejected',
      error: { code: 'IFC-ERR-002', message: '认证失败', fieldErrors: { password: ['密码不正确'] } },
    })
    const wrapper = mountDialog({ reauthRequired: true })
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    await wrapper.find('input[type="password"]').setValue('wrong')
    await wrapper.findAll('button').find((b) => b.text().includes('验证并执行'))!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('密码不正确')
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('执行失败：展示错误与重试，重试回到确认步骤', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('确认执行'))!.trigger('click')

    // 父组件置 executing=false + errorMessage
    await wrapper.setProps({ executing: false, errorMessage: '服务器超时' })
    await flushPromises()
    expect(wrapper.text()).toContain('操作失败')
    expect(wrapper.text()).toContain('服务器超时')

    await wrapper.findAll('button').find((b) => b.text().includes('重试'))!.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
    expect(wrapper.emitted('update:errorMessage')?.[0]).toEqual([''])
    expect(wrapper.text()).toContain('请确认操作')
  })

  it('执行成功：succeeded 置 true 后进入完成步骤', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('确认执行'))!.trigger('click')
    await wrapper.setProps({ succeeded: true })
    await flushPromises()
    expect(wrapper.text()).toContain('操作完成')
  })

  it('完成步骤：done 提供关闭按钮，点击触发 cancel 并关闭', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('确认执行'))!.trigger('click')
    // 父组件成功后置 succeeded=true → 进入 done
    await wrapper.setProps({ succeeded: true })
    await flushPromises()
    expect(wrapper.text()).toContain('操作完成')

    // done 步骤必须有出口按钮（此前 done 无任何按钮，父组件不主动关弹窗时死锁）
    const closeBtn = wrapper.findAll('button').find((b) => b.text().includes('关闭'))
    expect(closeBtn, 'done 步骤应提供关闭按钮').toBeTruthy()
    await closeBtn!.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
  })

  it('执行失败：展示错误并提供关闭/重试，关闭按钮触发 update:open(false)', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('确认执行'))!.trigger('click')

    await wrapper.setProps({ executing: false, errorMessage: '服务器超时' })
    await flushPromises()
    expect(wrapper.text()).toContain('操作失败')
    expect(wrapper.text()).toContain('服务器超时')

    // 失败态也提供关闭按钮，避免“正在执行...”死锁
    const closeBtn = wrapper.findAll('button').find((b) => b.text().includes('关闭'))
    expect(closeBtn, '失败态应提供关闭按钮').toBeTruthy()
    await closeBtn!.trigger('click')
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
  })

  it('重认证超时：确认按钮禁用且提示过期', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-07T12:00:00Z'))
    const wrapper = mountDialog({ reauthRequired: true, reauthDeadline: 10 * 1000 })
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')

    expect(wrapper.text()).toContain('剩余 10 秒')
    vi.advanceTimersByTime(11 * 1000)
    await flushPromises()

    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('验证并执行'))!
    expect((confirmBtn.element as HTMLButtonElement).disabled).toBe(true)
    wrapper.unmount()
  })

  it('重新打开时重置为预览步骤', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    expect(wrapper.text()).toContain('请确认操作')

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    expect(wrapper.text()).toContain('影响范围')
  })
})
