import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DataTable from './DataTable.vue'

const columns = [
  { key: 'name', label: '姓名' },
  { key: 'role', label: '角色' },
]
const rows = [
  { id: 'r1', name: '张三', role: '负责人' },
  { id: 'r2', name: '李四', role: '成员' },
]

describe('DataTable 基础渲染', () => {
  it('表头与单元格渲染（默认取值 / render 函数）', () => {
    const wrapper = mount(DataTable, {
      props: {
        columns: [...columns, { key: 'tag', label: '标签', render: (r) => `[${(r as { role: string }).role}]` }],
        rows,
      },
    })
    expect(wrapper.find('thead').text()).toContain('姓名')
    expect(wrapper.find('thead').text()).toContain('角色')
    expect(wrapper.find('tbody').text()).toContain('张三')
    expect(wrapper.find('tbody').text()).toContain('[负责人]')
  })

  it('空数据：展示空态标题与描述', () => {
    const wrapper = mount(DataTable, {
      props: { columns, rows: [], emptyTitle: '暂无成员', emptyDescription: '点击添加' },
    })
    expect(wrapper.text()).toContain('暂无成员')
    expect(wrapper.text()).toContain('点击添加')
  })

  it('loading：渲染骨架行而非数据行', () => {
    const wrapper = mount(DataTable, { props: { columns, rows, loading: true } })
    expect(wrapper.findAll('tbody tr')).toHaveLength(5)
    expect(wrapper.text()).not.toContain('张三')
  })

  it('cell 插槽：优先使用插槽渲染', () => {
    const wrapper = mount(DataTable, {
      props: { columns, rows },
      slots: { 'cell-name': `<template #cell-name="{ row }"><b>{{ row.name }}!</b></template>` },
    })
    expect(wrapper.find('tbody').text()).toContain('张三!')
  })
})

describe('DataTable 行选择', () => {
  it('全选/取消全选：emit update:selectedIds 全量集合', async () => {
    const wrapper = mount(DataTable, { props: { columns, rows, selectable: true, selectedIds: [] } })

    const selectAll = wrapper.find('thead input[type="checkbox"]')
    await selectAll.setValue(true)
    expect(wrapper.emitted('update:selectedIds')?.[0]).toEqual([['r1', 'r2']])

    await wrapper.setProps({ selectedIds: ['r1', 'r2'] })
    await selectAll.setValue(false)
    expect(wrapper.emitted('update:selectedIds')?.[1]).toEqual([[]])
  })

  it('单选行：勾选/取消对应 id', async () => {
    const wrapper = mount(DataTable, { props: { columns, rows, selectable: true, selectedIds: [] } })

    const checkboxes = wrapper.findAll('tbody input[type="checkbox"]')
    await checkboxes[1].setValue(true)
    expect(wrapper.emitted('update:selectedIds')?.[0]).toEqual([['r2']])
  })

  it('全选框 indeterminate：部分选中时显示', () => {
    const wrapper = mount(DataTable, { props: { columns, rows, selectable: true, selectedIds: ['r1'] } })
    expect((wrapper.find('thead input[type="checkbox"]').element as HTMLInputElement).indeterminate).toBe(true)
  })

  it('空数据时全选框禁用', () => {
    const wrapper = mount(DataTable, { props: { columns, rows: [], selectable: true, selectedIds: [] } })
    expect(wrapper.find('thead input[type="checkbox"]').attributes('disabled')).toBeDefined()
  })

  it('loading 时全选框禁用', () => {
    const wrapper = mount(DataTable, { props: { columns, rows, selectable: true, selectedIds: [], loading: true } })
    expect(wrapper.find('thead input[type="checkbox"]').attributes('disabled')).toBeDefined()
  })

  it('custom rowKey 生效', async () => {
    const customRows = [{ uid: 'a1', name: '甲' }, { uid: 'a2', name: '乙' }]
    const wrapper = mount(DataTable, { props: { columns: [{ key: 'name', label: '姓名' }], rows: customRows, selectable: true, selectedIds: [], rowKey: 'uid' } })

    await wrapper.find('tbody input[type="checkbox"]').setValue(true)
    expect(wrapper.emitted('update:selectedIds')?.[0]).toEqual([['a1']])
  })
})

describe('DataTable 行点击', () => {
  it('注册 rowClick 监听时行可点击并 emit', async () => {
    const wrapper = mount(DataTable, {
      props: { columns, rows },
      attrs: { onRowClick: (r: unknown) => r },
    })
    const firstRow = wrapper.find('tbody tr')
    expect(firstRow.attributes('tabindex')).toBe('0')

    await firstRow.trigger('click')
    expect(wrapper.emitted('rowClick')?.[0]).toEqual([rows[0]])
  })

  it('未注册 rowClick 时行不可点击、不 emit', async () => {
    const wrapper = mount(DataTable, { props: { columns, rows } })
    const firstRow = wrapper.find('tbody tr')
    expect(firstRow.attributes('tabindex')).toBeUndefined()

    await firstRow.trigger('click')
    expect(wrapper.emitted('rowClick')).toBeUndefined()
  })

  it('点击行内复选框不触发 rowClick（stop 冒泡）', async () => {
    const wrapper = mount(DataTable, {
      props: { columns, rows, selectable: true, selectedIds: [] },
      attrs: { onRowClick: () => {} },
    })
    await wrapper.find('tbody input[type="checkbox"]').setValue(true)
    expect(wrapper.emitted('rowClick')).toBeUndefined()
    expect(wrapper.emitted('update:selectedIds')).toBeDefined()
  })
})
