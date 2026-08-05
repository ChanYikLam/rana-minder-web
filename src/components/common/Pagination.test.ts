import { describe, expect, it } from 'vitest'
import { mount, type DOMWrapper } from '@vue/test-utils'
import Pagination from './Pagination.vue'

function prevBtn(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').find((b: DOMWrapper<Element>) => b.text().includes('上一页'))
}

function nextBtn(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').find((b: DOMWrapper<Element>) => b.text().includes('下一页'))
}

describe('Pagination', () => {
  it('renders summary and page indicator', () => {
    const wrapper = mount(Pagination, { props: { page: 2, total: 100, pageSize: 20 } })
    expect(wrapper.text()).toContain('共 100 条')
    expect(wrapper.text()).toContain('第 21-40 条')
    expect(wrapper.text()).toContain('2 / 5')
  })

  it('renders single page as 1 / 1', () => {
    const wrapper = mount(Pagination, { props: { page: 1, total: 19 } })
    expect(wrapper.text()).toContain('1 / 1')
  })

  it('clamps out-of-range page in summary (no inverted range)', () => {
    const wrapper = mount(Pagination, { props: { page: 99, total: 100, pageSize: 20 } })
    expect(wrapper.text()).toContain('第 81-100 条')
    const wrapper2 = mount(Pagination, { props: { page: 0, total: 100, pageSize: 20 } })
    expect(wrapper2.text()).toContain('第 1-20 条')
  })

  it('disables previous button on first page', () => {
    const wrapper = mount(Pagination, { props: { page: 1, total: 100, pageSize: 20 } })
    expect(prevBtn(wrapper)?.attributes('disabled')).toBeDefined()
    expect(nextBtn(wrapper)?.attributes('disabled')).toBeUndefined()
  })

  it('disables next button on last page', () => {
    const wrapper = mount(Pagination, { props: { page: 5, total: 100, pageSize: 20 } })
    expect(nextBtn(wrapper)?.attributes('disabled')).toBeDefined()
    expect(prevBtn(wrapper)?.attributes('disabled')).toBeUndefined()
  })

  it('emits update:page on next click', async () => {
    const wrapper = mount(Pagination, { props: { page: 1, total: 100, pageSize: 20 } })
    await nextBtn(wrapper)!.trigger('click')
    expect(wrapper.emitted('update:page')?.[0]).toEqual([2])
  })

  it('emits update:page on prev click', async () => {
    const wrapper = mount(Pagination, { props: { page: 3, total: 100, pageSize: 20 } })
    await prevBtn(wrapper)!.trigger('click')
    expect(wrapper.emitted('update:page')?.[0]).toEqual([2])
  })

  it('does not emit when clicking previous on first page', async () => {
    const wrapper = mount(Pagination, { props: { page: 1, total: 100, pageSize: 20 } })
    await prevBtn(wrapper)!.trigger('click')
    expect(wrapper.emitted('update:page')).toBeUndefined()
  })
})
