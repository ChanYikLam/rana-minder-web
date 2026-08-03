import { describe, expect, it } from 'vitest'
import { mount, type DOMWrapper } from '@vue/test-utils'
import Pagination from './Pagination.vue'

function getPageButtons(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').filter((b: DOMWrapper<Element>) => {
    const label = b.attributes('aria-label') || ''
    return label.startsWith('第 ') && label.endsWith(' 页')
  })
}

function getEllipsisSpans(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('span').filter((s: DOMWrapper<Element>) => s.text() === '\u2026')
}

describe('Pagination', () => {
  it('hides when total pages <= 1', () => {
    const wrapper = mount(Pagination, { props: { current: 1, total: 0 } })
    expect(wrapper.find('nav').exists()).toBe(false)

    const wrapper2 = mount(Pagination, { props: { current: 1, total: 20 } })
    expect(wrapper2.find('nav').exists()).toBe(false)

    const wrapper3 = mount(Pagination, { props: { current: 1, total: 19 } })
    expect(wrapper3.find('nav').exists()).toBe(false)
  })

  it('shows when total pages > 1', () => {
    const wrapper = mount(Pagination, { props: { current: 1, total: 21 } })
    expect(wrapper.find('nav').exists()).toBe(true)
  })

  it('shows all pages when total <= maxVisible', () => {
    const wrapper = mount(Pagination, { props: { current: 1, total: 100, pageSize: 20, maxVisible: 7 } })
    expect(getPageButtons(wrapper)).toHaveLength(5)
    expect(getEllipsisSpans(wrapper)).toHaveLength(0)
  })

  it('shows left ellipsis when current is near the end', () => {
    const wrapper = mount(Pagination, { props: { current: 100, total: 2000, pageSize: 20, maxVisible: 7 } })
    const buttons = getPageButtons(wrapper)
    expect(buttons[0].text()).toBe('1')
    expect(getEllipsisSpans(wrapper)).toHaveLength(1)
  })

  it('shows right ellipsis when current is near the start', () => {
    const wrapper = mount(Pagination, { props: { current: 1, total: 2000, pageSize: 20, maxVisible: 7 } })
    const buttons = getPageButtons(wrapper)
    expect(buttons[buttons.length - 1].text()).toBe('100')
    expect(getEllipsisSpans(wrapper)).toHaveLength(1)
  })

  it('shows both ellipsis when current is in the middle', () => {
    const wrapper = mount(Pagination, { props: { current: 50, total: 2000, pageSize: 20, maxVisible: 7 } })
    const buttons = getPageButtons(wrapper)
    expect(buttons[0].text()).toBe('1')
    expect(buttons[buttons.length - 1].text()).toBe('100')
    expect(getEllipsisSpans(wrapper)).toHaveLength(2)
  })

  it('highlights current page', () => {
    const wrapper = mount(Pagination, { props: { current: 3, total: 100, pageSize: 20 } })
    const currentBtn = wrapper.find('[aria-current="page"]')
    expect(currentBtn.exists()).toBe(true)
    expect(currentBtn.text()).toBe('3')
  })

  it('disables previous button on first page', () => {
    const wrapper = mount(Pagination, { props: { current: 1, total: 100, pageSize: 20 } })
    const prevBtn = wrapper.find('[aria-label="上一页"]')
    expect(prevBtn.attributes('disabled')).toBeDefined()
  })

  it('disables next button on last page', () => {
    const wrapper = mount(Pagination, { props: { current: 5, total: 100, pageSize: 20 } })
    const nextBtn = wrapper.find('[aria-label="下一页"]')
    expect(nextBtn.attributes('disabled')).toBeDefined()
  })

  it('emits update:current on page click', async () => {
    const wrapper = mount(Pagination, { props: { current: 1, total: 100, pageSize: 20 } })
    const buttons = getPageButtons(wrapper)
    const page3 = buttons.find((b) => b.text() === '3')
    await page3!.trigger('click')
    expect(wrapper.emitted('update:current')?.[0]).toEqual([3])
  })

  it('does not emit when clicking current page', async () => {
    const wrapper = mount(Pagination, { props: { current: 1, total: 100, pageSize: 20 } })
    const buttons = getPageButtons(wrapper)
    const page1 = buttons.find((b) => b.text() === '1')
    await page1!.trigger('click')
    expect(wrapper.emitted('update:current')).toBeUndefined()
  })
})