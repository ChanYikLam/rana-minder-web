import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'
import ObjectPicker from './ObjectPicker.vue'

const groups = [
  { type: 'department' as const, label: '部门', items: [{ id: 'd1', label: '技术部' }, { id: 'd2', label: '运营部' }] },
]

describe('ObjectPicker 对象选择器', () => {
  it('渲染分组与条目，点击选中 emit', async () => {
    const wrapper = mount(ObjectPicker, { props: { groups, modelValue: [] }, global: { stubs: pageStubs } })
    expect(wrapper.text()).toContain('技术部')
    await wrapper.findAll('button').find((b) => b.text().includes('技术部'))!.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['d1']])
  })

  it('再次点击取消选中', async () => {
    const wrapper = mount(ObjectPicker, { props: { groups, modelValue: ['d1'] }, global: { stubs: pageStubs } })
    await wrapper.findAll('button').find((b) => b.text().includes('技术部'))!.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[]])
  })
})
