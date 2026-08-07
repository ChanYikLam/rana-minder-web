import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ScheduleView, { type ScheduleSlot } from './ScheduleView.vue'

const slots: ScheduleSlot[] = [
  { id: 's1', title: '张三 · 一轮', startAt: '2026-08-10T04:00:00Z', endAt: '2026-08-10T04:30:00Z', location: 'A101', interviewer: '李思颖' },
  { id: 's2', title: '王五 · 一轮', startAt: '2026-08-10T04:10:00Z', endAt: '2026-08-10T04:40:00Z', interviewer: '李思颖' },
]

describe('ScheduleView 排期视图', () => {
  it('列表模式：渲染排期条目与地点', () => {
    const wrapper = mount(ScheduleView, { props: { items: slots }, global: { stubs: { CalendarDays: { template: '<i />' }, List: { template: '<i />' }, AlertTriangle: { template: '<i />' } } } })
    expect(wrapper.text()).toContain('张三')
    expect(wrapper.text()).toContain('A101')
  })

  it('冲突检测：同一面试官时间重叠标记冲突', () => {
    const wrapper = mount(ScheduleView, { props: { items: slots }, global: { stubs: { CalendarDays: { template: '<i />' }, List: { template: '<i />' }, AlertTriangle: { template: '<i />' } } } })
    expect(wrapper.text()).toContain('时间冲突')
  })

  it('无冲突：不展示冲突标记', () => {
    const noConflict: ScheduleSlot[] = [
      { id: 's1', title: 'A', startAt: '2026-08-10T04:00:00Z', endAt: '2026-08-10T04:30:00Z', interviewer: '李' },
      { id: 's2', title: 'B', startAt: '2026-08-10T05:00:00Z', endAt: '2026-08-10T05:30:00Z', interviewer: '李' },
    ]
    const wrapper = mount(ScheduleView, { props: { items: noConflict }, global: { stubs: { CalendarDays: { template: '<i />' }, List: { template: '<i />' }, AlertTriangle: { template: '<i />' } } } })
    expect(wrapper.text()).not.toContain('时间冲突')
  })

  it('空列表：展示空提示', () => {
    const wrapper = mount(ScheduleView, { props: { items: [] }, global: { stubs: { CalendarDays: { template: '<i />' }, List: { template: '<i />' }, AlertTriangle: { template: '<i />' } } } })
    expect(wrapper.text()).toContain('暂无')
  })
})
