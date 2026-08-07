import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'
import FilterPanel from './FilterPanel.vue'

const fields = [
  { key: 'status', label: '状态', options: [{ value: 'active', label: '进行中' }, { value: 'closed', label: '已结束' }] },
]

describe('FilterPanel 筛选面板', () => {
  async function openPanel(wrapper: ReturnType<typeof mount>) {
    await wrapper.findAll('button').find((b) => b.text().includes('筛选'))!.trigger('click')
  }

  it('切换筛选项触发 change 事件（单选输出 string）', async () => {
    const wrapper = mount(FilterPanel, { props: { fields }, global: { stubs: pageStubs } })
    await openPanel(wrapper)
    await wrapper.findAll('button').find((b) => b.text().includes('进行中'))!.trigger('click')
    expect(wrapper.emitted('change')?.[0]).toEqual([{ status: 'active' }])
  })

  it('再次点击取消筛选（空字段省略）', async () => {
    const wrapper = mount(FilterPanel, { props: { fields }, global: { stubs: pageStubs } })
    await openPanel(wrapper)
    const btn = wrapper.findAll('button').find((b) => b.text().includes('进行中'))!
    await btn.trigger('click')
    await btn.trigger('click')
    expect(wrapper.emitted('change')?.[1]).toEqual([{}])
  })
})
