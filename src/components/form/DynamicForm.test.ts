import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DynamicForm from './DynamicForm.vue'
import type { FormField } from '@/types/domain/form'

const commonStubs = {
  FieldPermission: { template: '<span />' },
  AttachmentUpload: { template: '<div />' },
  DateTimePicker: { template: '<div />' },
}

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

describe('DynamicForm 基础字段类型交互', () => {
  function mountForm(fields: FormField[], modelValue: Record<string, unknown> = {}) {
    return mount(DynamicForm, { props: { fields, modelValue }, global: { stubs: commonStubs } })
  }

  it('text 输入更新对应字段，且保留其他字段值（...modelValue 展开）', async () => {
    const wrapper = mountForm(
      [field({ id: 'a', type: 'text' }), field({ id: 'b', type: 'text' })],
      { a: '旧值', b: '保留值' },
    )

    const inputs = wrapper.findAll('input[type="text"]')
    await inputs[0].setValue('新值')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ a: '新值', b: '保留值' }])
  })

  it('textarea 输入更新字段', async () => {
    const wrapper = mountForm([field({ id: 't', type: 'textarea' })], { t: '' })

    await wrapper.find('textarea').setValue('多行内容')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ t: '多行内容' }])
  })

  it('number 输入经 Number() 转换后提交数字', async () => {
    const wrapper = mountForm([field({ id: 'n', type: 'number' })], { n: '' })

    await wrapper.find('input[type="number"]').setValue('42')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ n: 42 }])
  })

  it('radio 选中提交对应选项', async () => {
    const wrapper = mountForm([field({ id: 'r', type: 'radio', options: ['甲', '乙'] })], { r: '' })

    const radios = wrapper.findAll('input[type="radio"]')
    ;(radios[1].element as HTMLInputElement).checked = true
    await radios[1].trigger('change')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ r: '乙' }])
  })

  it('checkbox 勾选加入数组、取消勾选移除', async () => {
    const wrapper = mountForm([field({ id: 'c', type: 'checkbox', options: ['X', 'Y'] })], { c: [] })

    const boxes = wrapper.findAll('input[type="checkbox"]')
    ;(boxes[0].element as HTMLInputElement).checked = true
    await boxes[0].trigger('change')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ c: ['X'] }])

    await wrapper.setProps({ modelValue: { c: ['X'] } })
    const uncheck = wrapper.findAll('input[type="checkbox"]')[0]
    ;(uncheck.element as HTMLInputElement).checked = false
    await uncheck.trigger('change')
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([{ c: [] }])
  })
})

describe('DynamicForm 只读/隐藏/条件显示', () => {
  it('disabled prop 使输入禁用', () => {
    const wrapper = mount(DynamicForm, {
      props: { fields: [field({ id: 't', type: 'text' })], modelValue: {}, disabled: true },
      global: { stubs: commonStubs },
    })
    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
  })

  it('字段 readonly 或 permission=read_only 时禁用', () => {
    const wrapper = mount(DynamicForm, {
      props: {
        fields: [
          field({ id: 'a', type: 'text', readonly: true }),
          field({ id: 'b', type: 'text', permission: 'read_only' }),
          field({ id: 'c', type: 'text', permission: 'read_write' }),
        ],
        modelValue: {},
      },
      global: { stubs: commonStubs },
    })
    const inputs = wrapper.findAll('input')
    expect(inputs[0].attributes('disabled')).toBeDefined()
    expect(inputs[1].attributes('disabled')).toBeDefined()
    expect(inputs[2].attributes('disabled')).toBeUndefined()
  })

  it('permission=hidden 的字段不渲染', () => {
    const wrapper = mount(DynamicForm, {
      props: { fields: [field({ id: 'h', type: 'text', permission: 'hidden' })], modelValue: {} },
      global: { stubs: commonStubs },
    })
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('conditionalFieldId：触发值匹配时显示，不匹配时隐藏', async () => {
    const trigger = field({ id: 'tr', type: 'select', options: ['是', '否'] })
    const dependent = field({ id: 'dp', type: 'text', conditionalFieldId: 'tr', conditionalValue: '是' })

    const wrapper = mount(DynamicForm, {
      props: { fields: [trigger, dependent], modelValue: { tr: '否' } },
      global: { stubs: commonStubs },
    })
    expect(wrapper.find('input').exists()).toBe(false)

    await wrapper.setProps({ modelValue: { tr: '是' } })
    expect(wrapper.find('input').exists()).toBe(true)
  })
})

describe('DynamicForm 字段错误展示', () => {
  it('fieldErrors 渲染 role=alert 消息并联动 aria-invalid/describedby', () => {
    const wrapper = mount(DynamicForm, {
      props: {
        fields: [field({ id: 't', type: 'text' })],
        modelValue: { t: '' },
        fieldErrors: { t: ['必填', '格式错误'] },
      },
      global: { stubs: commonStubs },
    })

    const input = wrapper.find('input')
    expect(input.attributes('aria-invalid')).toBeDefined()
    expect(input.attributes('aria-describedby')).toBe('dyn-err-t-0 dyn-err-t-1')

    const alerts = wrapper.findAll('[role="alert"]')
    expect(alerts).toHaveLength(2)
    expect(alerts[0].attributes('id')).toBe('dyn-err-t-0')
    expect(alerts[0].text()).toBe('必填')
    expect(alerts[1].text()).toBe('格式错误')
  })

  it('无错误时无 alert 且不设置 aria-invalid', () => {
    const wrapper = mount(DynamicForm, {
      props: { fields: [field({ id: 't', type: 'text' })], modelValue: { t: 'x' } },
      global: { stubs: commonStubs },
    })
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('input').attributes('aria-invalid')).toBeUndefined()
  })
})

describe('DynamicForm 版本横幅', () => {
  it('versionPending 横幅展示并可触发迁移', async () => {
    const wrapper = mount(DynamicForm, {
      props: { fields: [], modelValue: {}, versionPending: true },
      global: { stubs: commonStubs },
    })
    expect(wrapper.text()).toContain('表单版本已更新')
    expect(wrapper.text()).toContain('迁移到新版本')

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('migrateVersion')).toHaveLength(1)
  })

  it('migratingVersion 时按钮禁用并显示迁移中', () => {
    const wrapper = mount(DynamicForm, {
      props: { fields: [], modelValue: {}, versionPending: true, migratingVersion: true },
      global: { stubs: commonStubs },
    })
    const btn = wrapper.find('button')
    expect(btn.text()).toContain('迁移中...')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('versionConflict 横幅展示并可触发刷新', async () => {
    const wrapper = mount(DynamicForm, {
      props: { fields: [], modelValue: {}, versionConflict: true },
      global: { stubs: commonStubs },
    })
    expect(wrapper.text()).toContain('数据版本冲突')

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('resolveConflict')).toHaveLength(1)
  })

  it('resolvingConflict 时按钮禁用并显示刷新中', () => {
    const wrapper = mount(DynamicForm, {
      props: { fields: [], modelValue: {}, versionConflict: true, resolvingConflict: true },
      global: { stubs: commonStubs },
    })
    const btn = wrapper.find('button')
    expect(btn.text()).toContain('刷新中...')
    expect(btn.attributes('disabled')).toBeDefined()
  })
})

describe('DynamicForm array 字段', () => {
  // 组件契约：array 字段自身需携带指向自己的 arrayFieldTemplateId，子模板字段引用它
  const arrayField = field({ id: 'arr', type: 'array', label: '经历', arrayFieldTemplateId: 'arr' })
  const childField = field({ id: 'c1', type: 'text', label: '内容', arrayFieldTemplateId: 'arr' })

  it('空数组展示占位提示，无子行渲染', () => {
    const wrapper = mount(DynamicForm, {
      props: { fields: [arrayField, childField], modelValue: { arr: [] } },
      global: { stubs: commonStubs },
    })
    expect(wrapper.text()).toContain('暂无内容，点击「添加」新增一条记录')
    // 数组子行输入框（id 以 dyn-arr-row 开头）不存在
    expect(wrapper.find('[id^="dyn-arr-row"]').exists()).toBe(false)
  })

  it('点击添加：生成带 _uid 的新行并触发更新', async () => {
    const wrapper = mount(DynamicForm, {
      props: { fields: [arrayField, childField], modelValue: { arr: [] } },
      global: { stubs: commonStubs },
    })

    await wrapper.findAll('button').find((b) => b.text().includes('添加'))!.trigger('click')

    const emitted = wrapper.emitted('update:modelValue')?.[0]![0] as { arr: unknown[] }
    expect(Array.isArray(emitted.arr)).toBe(true)
    expect((emitted.arr[0] as Record<string, unknown>)._uid).toEqual(expect.any(String))
  })

  it('编辑子字段行值并删除整行', async () => {
    const row = { _uid: 'row-1', c1: '初值' }
    const wrapper = mount(DynamicForm, {
      props: { fields: [arrayField, childField], modelValue: { arr: [row] } },
      global: { stubs: commonStubs },
    })

    // 子字段回显（数组行内输入框 id 为 dyn-arr-row-1-c1）
    const input = wrapper.find('#dyn-arr-row-1-c1')
    expect((input.element as HTMLInputElement).value).toBe('初值')

    // 编辑子字段
    await input.setValue('新值')
    const updated = wrapper.emitted('update:modelValue')?.[0]![0] as { arr: unknown[] }
    expect(updated.arr[0]).toEqual({ _uid: 'row-1', c1: '新值' })

    // 删除整行
    await wrapper.findAll('button').find((b) => b.text().includes('删除'))!.trigger('click')
    const removed = wrapper.emitted('update:modelValue')?.[1]![0] as { arr: unknown[] }
    expect(removed.arr).toEqual([])
  })

  it('只读 array 不显示添加/删除按钮', () => {
    const wrapper = mount(DynamicForm, {
      props: { fields: [arrayField, childField], modelValue: { arr: [{ _uid: 'r1', c1: 'x' }] }, disabled: true },
      global: { stubs: commonStubs },
    })
    expect(wrapper.text()).not.toContain('添加')
    expect(wrapper.text()).not.toContain('删除')
    expect((wrapper.find('input').element as HTMLInputElement).disabled).toBe(true)
  })
})
