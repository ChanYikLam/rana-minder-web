import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'
import BatchActionBar from './BatchActionBar.vue'

describe('BatchActionBar 批量操作栏', () => {
  it('无选中：禁用并展示计数', () => {
    const wrapper = mount(BatchActionBar, { props: { selected: [] }, global: { stubs: pageStubs } })
    const btn = wrapper.findAll('button').find((b) => b.text().includes('执行批量操作'))!
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('有选中：可执行并 emit', async () => {
    const wrapper = mount(BatchActionBar, {
      props: { selected: [{ id: 'm1', label: '甲' }], actionLabel: '批量发布' },
      global: { stubs: pageStubs },
    })
    await wrapper.findAll('button').find((b) => b.text().includes('批量发布'))!.trigger('click')
    expect(wrapper.emitted('execute')).toHaveLength(1)
  })
})
