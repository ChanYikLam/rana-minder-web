import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FieldPermission from './FieldPermission.vue'

describe('FieldPermission 字段权限标签', () => {
  it('read_only：只读标签', () => {
    const wrapper = mount(FieldPermission, { props: { permission: 'read_only' } })
    expect(wrapper.text()).toContain('只读')
  })

  it('hidden：隐藏标签', () => {
    const wrapper = mount(FieldPermission, { props: { permission: 'hidden' } })
    expect(wrapper.text()).toContain('隐藏')
  })

  it('read_write：可编辑标签', () => {
    const wrapper = mount(FieldPermission, { props: { permission: 'read_write' } })
    expect(wrapper.text()).toContain('可编辑')
  })
})
