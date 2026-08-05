import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DynamicForm from './DynamicForm.vue'
import type { FormField } from '@/types/domain/form'

function field(overrides: Partial<FormField>): FormField {
  return {
    id: 'f1',
    type: 'select',
    label: '字段',
    description: null,
    required: false,
    readonly: false,
    permission: 'read_write',
    options: ['A', 'B', 'C'],
    conditionalFieldId: null,
    conditionalValue: null,
    arrayFieldTemplateId: null,
    ...overrides,
  }
}

describe('DynamicForm multi_select 契约', () => {
  it('legacy string 回显规范化为选中态', () => {
    const wrapper = mount(DynamicForm, {
      props: {
        fields: [field({ id: 'ms', type: 'multi_select' })],
        modelValue: { ms: 'A' },
      },
    })
    const options = wrapper.find('select').findAll('option')
    expect(options[1].attributes('selected')).toBeDefined()
    expect(options[2].attributes('selected')).toBeUndefined()
  })

  it('多选 change 提交 string[]，未选提交 []（空值语义与 schema 对齐）', async () => {
    const wrapper = mount(DynamicForm, {
      props: {
        fields: [field({ id: 'ms', type: 'multi_select' })],
        modelValue: { ms: [] },
      },
    })
    const select = wrapper.find('select')
    const options = select.findAll('option')
    ;(options[1].element as HTMLOptionElement).selected = true
    ;(options[2].element as HTMLOptionElement).selected = true
    await select.trigger('change')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ ms: ['A', 'B'] }])

    const empty = mount(DynamicForm, {
      props: {
        fields: [field({ id: 'ms', type: 'multi_select' })],
        modelValue: { ms: [] },
      },
    })
    await empty.find('select').trigger('change')
    expect(empty.emitted('update:modelValue')?.[0]).toEqual([{ ms: [] }])
  })

  it('单选 change 提交 string', async () => {
    const wrapper = mount(DynamicForm, {
      props: {
        fields: [field({ id: 's', type: 'select' })],
        modelValue: { s: '' },
      },
    })
    const select = wrapper.find('select')
    const options = select.findAll('option')
    ;(options[2].element as HTMLOptionElement).selected = true
    await select.trigger('change')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ s: 'B' }])
  })
})
