import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import NameSearch from './NameSearch.vue'

const results = [
  { id: 'g1', name: '计算机协会', subtitle: 'G-COMP', group: '精确命中', match: 'exact' as const, score: 1 },
  { id: 'g2', name: '计算机社', group: '近似匹配', match: 'fuzzy' as const, score: 0.6 },
]

function mountSearch(props: Record<string, unknown> = {}) {
  return mount(NameSearch, {
    props: { modelValue: '', results: [], loading: false, ...props },
    global: { stubs: { Search: { template: '<i />' } } },
  })
}

describe('NameSearch 名称搜索', () => {
  afterEach(() => vi.restoreAllMocks())

  it('输入更新 modelValue', async () => {
    const wrapper = mountSearch()
    await wrapper.find('input').setValue('计算机')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['计算机'])
  })

  it('聚焦后按分组渲染结果，选择时 emit select 并关闭', async () => {
    const wrapper = mountSearch({ modelValue: '计算机', results })
    await wrapper.find('input').trigger('focus')
    expect(wrapper.text()).toContain('精确命中')
    expect(wrapper.text()).toContain('近似匹配')
    expect(wrapper.text()).toContain('计算机协会')

    await wrapper.findAll('button').find((b) => b.text().includes('计算机协会'))!.trigger('mousedown')
    expect(wrapper.emitted('select')?.[0]).toEqual([results[0]])
    expect(wrapper.text()).not.toContain('精确命中')
  })

  it('失焦延迟 120ms 后关闭结果列表', async () => {
    vi.useFakeTimers()
    const wrapper = mountSearch({ modelValue: 'x', results })
    await wrapper.find('input').trigger('focus')
    expect(wrapper.text()).toContain('精确命中')
    await wrapper.find('input').trigger('blur')
    await vi.advanceTimersByTimeAsync(120)
    await nextTick()
    expect(wrapper.text()).not.toContain('精确命中')
    vi.useRealTimers()
    wrapper.unmount()
  })

  it('loading：展示搜索中', async () => {
    const wrapper = mountSearch({ modelValue: 'x', results: [], loading: true })
    await wrapper.find('input').trigger('focus')
    expect(wrapper.text()).toContain('搜索中...')
  })

  it('无结果：不展示分组', () => {
    const wrapper = mountSearch({ modelValue: 'x', results: [] })
    expect(wrapper.text()).not.toContain('精确命中')
  })
})
