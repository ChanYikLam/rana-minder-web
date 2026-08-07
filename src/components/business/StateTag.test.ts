import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StateTag from './StateTag.vue'

const statusStub = {
  StatusBadge: { props: ['variant', 'label'], template: '<span class="badge" :data-variant="variant">{{ label }}</span>' },
}

describe('StateTag 状态标签', () => {
  it('已知状态映射为中文标签', () => {
    const wrapper = mount(StateTag, { props: { status: 'open' }, global: { stubs: statusStub } })
    expect(wrapper.text()).toContain('开放中')
  })

  it('未知状态回退原始 status', () => {
    const wrapper = mount(StateTag, { props: { status: 'weird-status' }, global: { stubs: statusStub } })
    expect(wrapper.text()).toContain('weird-status')
  })

  it('显式 label 优先', () => {
    const wrapper = mount(StateTag, { props: { status: 'custom', label: '自定义' }, global: { stubs: statusStub } })
    expect(wrapper.text()).toContain('自定义')
  })
})
