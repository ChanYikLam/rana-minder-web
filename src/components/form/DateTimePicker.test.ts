import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'
import DateTimePicker from './DateTimePicker.vue'

describe('DateTimePicker 日期时间选择', () => {
  it('日期/时间变化时输出 ISO 值', async () => {
    const wrapper = mount(DateTimePicker, { props: { modelValue: '', label: '截止时间' }, global: { stubs: pageStubs } })
    await wrapper.find('input[type="date"]').setValue('2026-08-10')
    await wrapper.find('input[type="time"]').setValue('12:30')
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toContain('2026-08-10')
  })

  it('回显已有值', () => {
    const wrapper = mount(DateTimePicker, { props: { modelValue: '2026-08-10T04:30:00.000Z' }, global: { stubs: pageStubs } })
    expect((wrapper.find('input[type="date"]').element as HTMLInputElement).value).toBe('2026-08-10')
  })
})
