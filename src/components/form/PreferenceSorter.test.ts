import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PreferenceSorter, { type PreferenceEntry } from './PreferenceSorter.vue'

const items: PreferenceEntry[] = [
  { id: 'd1', label: '技术部' },
  { id: 'd2', label: '运营部' },
  { id: 'd3', label: '设计部' },
]

function mountSorter(modelValue: PreferenceEntry[] = items, props: Record<string, unknown> = {}) {
  return mount(PreferenceSorter, {
    props: { modelValue, ...props },
    global: { stubs: { ChevronUp: { template: '<i />' }, ChevronDown: { template: '<i />' } } },
  })
}

describe('PreferenceSorter 意向排序', () => {
  it('渲染条目与序号', () => {
    const wrapper = mountSorter()
    expect(wrapper.text()).toContain('技术部')
    expect(wrapper.text()).toContain('运营部')
    expect(wrapper.text()).toContain('1')
  })

  it('上移：emit 重排后的数组', async () => {
    const wrapper = mountSorter()
    const firstUp = wrapper.findAll('button')[1]
    await firstUp.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]![0]).toEqual([
      { id: 'd2', label: '运营部' },
      { id: 'd1', label: '技术部' },
      { id: 'd3', label: '设计部' },
    ])
  })

  it('首项上移被守卫（不 emit）', async () => {
    const wrapper = mountSorter()
    const firstUp = wrapper.findAll('button')[1]
    await firstUp.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  })

  it('移除：emit 过滤后的数组', async () => {
    const wrapper = mountSorter()
    const removeBtn = wrapper.findAll('button').find((b) => b.text().includes('移除'))
    expect(removeBtn, '每个志愿项应渲染移除按钮').toBeTruthy()
    await removeBtn!.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]![0]).toHaveLength(2)
  })

  it('键盘 ArrowUp/ArrowDown/Delete 控制', async () => {
    const wrapper = mountSorter()
    const firstRow = wrapper.find('[tabindex]')
    await firstRow.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.emitted('update:modelValue')?.[0]![0]).toEqual([
      { id: 'd2', label: '运营部' },
      { id: 'd1', label: '技术部' },
      { id: 'd3', label: '设计部' },
    ])
  })

  it('P2-10：max 生效——显示剩余名额，达上限提示', async () => {
    const wrapper = mountSorter(items.slice(0, 2), { max: 3 })
    expect(wrapper.text()).toContain('还可添加 1 项志愿')
    await wrapper.setProps({ modelValue: items })
    expect(wrapper.text()).toContain('已达到上限，不再接受新的志愿')
  })
})
