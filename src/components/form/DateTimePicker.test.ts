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

  it('清空日期/时间 → 发出空串而非非法 ISO（P2-5）', async () => {
    const wrapper = mount(DateTimePicker, { props: { modelValue: '2026-08-10T12:30:00+08:00' }, global: { stubs: pageStubs } })
    await wrapper.find('input[type="date"]').setValue('')
    const emits1 = wrapper.emitted('update:modelValue') ?? []
    expect(emits1[emits1.length - 1]![0]).toBe('')
    const wrapper2 = mount(DateTimePicker, { props: { modelValue: '2026-08-10T12:30:00+08:00' }, global: { stubs: pageStubs } })
    await wrapper2.find('input[type="time"]').setValue('')
    const emits2 = wrapper2.emitted('update:modelValue') ?? []
    expect(emits2[emits2.length - 1]![0]).toBe('')
  })

  it('输出 ISO 偏移跟随 timezone prop（P2-5）', async () => {
    const wrapper = mount(DateTimePicker, { props: { modelValue: '2026-08-10T00:00:00+00:00', timezone: 'UTC' }, global: { stubs: pageStubs } })
    await wrapper.find('input[type="time"]').setValue('12:30')
    const emits = wrapper.emitted('update:modelValue') ?? []
    expect(emits[emits.length - 1]![0]).toBe('2026-08-10T12:30:00+00:00')
  })
})
