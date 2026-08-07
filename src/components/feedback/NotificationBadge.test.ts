import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import NotificationBadge from './NotificationBadge.vue'

describe('NotificationBadge 通知角标', () => {
  it('count=0 不展示角标', () => {
    const wrapper = mount(NotificationBadge, { props: { count: 0 } })
    expect(wrapper.text()).not.toContain('0')
  })

  it('展示未读数量', () => {
    const wrapper = mount(NotificationBadge, { props: { count: 5 } })
    expect(wrapper.text()).toContain('5')
  })

  it('超过 max 显示 max+', () => {
    const wrapper = mount(NotificationBadge, { props: { count: 120 } })
    expect(wrapper.text()).toContain('99+')
  })

  it('unread=false 不展示角标', () => {
    const wrapper = mount(NotificationBadge, { props: { count: 5, unread: false } })
    expect(wrapper.text()).not.toContain('5')
  })
})
