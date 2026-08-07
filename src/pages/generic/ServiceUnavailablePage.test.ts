import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useSessionViewStore } from '@/state/sessionViewStore'
import ServiceUnavailablePage from './ServiceUnavailablePage.vue'

describe('ServiceUnavailablePage 服务不可用页', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('非降级状态：不展示白名单剩余时间', () => {
    const wrapper = mount(ServiceUnavailablePage)
    expect(wrapper.text()).toContain('服务暂时不可用')
    expect(wrapper.text()).toContain('重新检测')
    expect(wrapper.text()).not.toContain('降级最小白名单')
  })

  it('降级白名单窗口内：展示剩余分钟数', () => {
    const session = useSessionViewStore()
    session.degraded = true
    session.degradedSince = Date.now() - 5 * 60 * 1000
    // 15 分钟窗口剩余 10 分钟
    const wrapper = mount(ServiceUnavailablePage)
    expect(wrapper.text()).toContain('降级最小白名单剩余 10 分钟')
  })

  it('降级窗口已过期：白名单横幅不再展示', () => {
    const session = useSessionViewStore()
    session.degraded = true
    session.degradedSince = Date.now() - 20 * 60 * 1000
    const wrapper = mount(ServiceUnavailablePage)
    expect(wrapper.text()).not.toContain('降级最小白名单')
  })

  it('点击重新检测：加载中禁用并最终刷新页面', async () => {
    vi.useFakeTimers()
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    const wrapper = mount(ServiceUnavailablePage)

    const btn = wrapper.findAll('button').find((b) => b.text().includes('重新检测'))!
    await btn.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('正在检测服务状态...')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)

    await vi.advanceTimersByTimeAsync(1200)
    await flushPromises()
    expect(reload).toHaveBeenCalled()
    wrapper.unmount()
  })
})
