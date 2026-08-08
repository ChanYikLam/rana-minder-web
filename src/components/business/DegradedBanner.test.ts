import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useSessionViewStore } from '@/state/sessionViewStore'
import DegradedBanner from './DegradedBanner.vue'

describe('DegradedBanner 降级提示条', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-07T12:00:00Z'))
  })

  afterEach(() => vi.useRealTimers())

  it('降级窗口内：展示剩余分钟', () => {
    const session = useSessionViewStore()
    session.degraded = true
    // 12:00 现在 - 11:50 起点 = 已过 10 分钟，15 分钟窗口剩余 5 分钟
    session.degradedSince = new Date('2026-08-07T11:50:00Z').getTime()
    const wrapper = mount(DegradedBanner)
    expect(wrapper.text()).toContain('统一身份认证服务暂时不可用')
    expect(wrapper.text()).toContain('剩余 5 分钟')
  })

  it('未降级：不渲染', () => {
    const wrapper = mount(DegradedBanner)
    expect(wrapper.text()).toBe('')
  })

  it('窗口已过期：不渲染（路由守卫负责重定向）', () => {
    const session = useSessionViewStore()
    session.degraded = true
    session.degradedSince = new Date('2026-08-07T11:30:00Z').getTime()
    const wrapper = mount(DegradedBanner)
    expect(wrapper.text()).toBe('')
  })
})
