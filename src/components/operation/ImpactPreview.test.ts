import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'
import ImpactPreview from './ImpactPreview.vue'

describe('ImpactPreview 影响预览', () => {
  it('渲染目标与统计信息', () => {
    const wrapper = mount(ImpactPreview, {
      props: { clubName: '计算机协会', department: '技术部', targets: [{ id: 't1', label: '删除记录', detail: '100 条' }], notifyCount: 50 },
      global: { stubs: pageStubs },
    })
    expect(wrapper.text()).toContain('影响预览')
    expect(wrapper.text()).toContain('计算机协会')
    expect(wrapper.text()).toContain('删除记录')
    expect(wrapper.text()).toContain('100 条')
    expect(wrapper.text()).toContain('50')
  })

  it('缺省信息回退', () => {
    const wrapper = mount(ImpactPreview, {
      props: { targets: [] },
      global: { stubs: pageStubs },
    })
    expect(wrapper.text()).toContain('全部部门')
  })
})
