import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'
import StatChart from './StatChart.vue'

describe('StatChart 统计图表', () => {
  it('渲染标题、系列与单位', () => {
    const wrapper = mount(StatChart, {
      props: { title: '部门分布', series: [{ label: '技术部', value: 30 }, { label: '运营部', value: 20 }], unit: '人' },
      global: { stubs: pageStubs },
    })
    expect(wrapper.text()).toContain('部门分布')
    expect(wrapper.text()).toContain('技术部')
    expect(wrapper.text()).toContain('30')
    expect(wrapper.text()).toContain('单位：人')
  })

  it('空系列不崩溃', () => {
    const wrapper = mount(StatChart, {
      props: { title: 'x', series: [], unit: '人' },
      global: { stubs: pageStubs },
    })
    expect(wrapper.exists()).toBe(true)
    wrapper.unmount()
  })
})
