import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'
import Timeline from './Timeline.vue'

const items = [
  { id: 'e2', time: '2026-08-02T04:00:00Z', title: '通过', description: 'd' },
  { id: 'e1', time: '2026-08-01T04:00:00Z', title: '提交', description: 'd' },
]

describe('Timeline 时间线', () => {
  it('按时间升序渲染条目', () => {
    const wrapper = mount(Timeline, { props: { items }, global: { stubs: pageStubs } })
    const text = wrapper.text()
    expect(text.indexOf('提交')).toBeLessThan(text.indexOf('通过'))
  })

  it('空列表不崩溃', () => {
    const wrapper = mount(Timeline, { props: { items: [] }, global: { stubs: pageStubs } })
    expect(wrapper.exists()).toBe(true)
    wrapper.unmount()
  })
})
