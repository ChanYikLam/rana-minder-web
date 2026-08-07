import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useFocusDialog } from './useFocusDialog'

function mountHost(containerMarkup: string, onEscape?: () => void) {
  const open = ref(true)
  const host = defineComponent({
    setup() {
      const containerRef = ref<HTMLElement | null>(null)
      useFocusDialog(containerRef, open, onEscape)
      return { containerRef, open }
    },
    template: `<div ref="containerRef" data-test="container">${containerMarkup}</div>`,
  })
  // attachTo：focus() 需要元素在 document 中才更新 activeElement
  const wrapper = mount(host, { attachTo: document.body })
  return { wrapper, open }
}

describe('useFocusDialog 焦点陷阱', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('打开时聚焦容器内首个可聚焦元素', async () => {
    const { wrapper } = mountHost('<button data-test="first">甲</button><button>乙</button>')
    await nextTick()
    expect((document.activeElement as HTMLElement).textContent).toBe('甲')
    wrapper.unmount()
  })

  it('Tab 在末尾时循环回首个元素', async () => {
    const { wrapper } = mountHost('<button data-test="first">甲</button><button data-test="last">乙</button>')
    await nextTick()
    const last = wrapper.find('[data-test="last"]').element as HTMLElement
    last.focus()
    await last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect((document.activeElement as HTMLElement).textContent).toBe('甲')
    wrapper.unmount()
  })

  it('Shift+Tab 在首个元素时循环回末尾', async () => {
    const { wrapper } = mountHost('<button data-test="first">甲</button><button data-test="last">乙</button>')
    await nextTick()
    const first = wrapper.find('[data-test="first"]').element as HTMLElement
    first.focus()
    await first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    expect((document.activeElement as HTMLElement).textContent).toBe('乙')
    wrapper.unmount()
  })

  it('Esc 触发 onEscape 回调', async () => {
    const onEscape = vi.fn()
    const { wrapper } = mountHost('<button>甲</button>', onEscape)
    await nextTick()
    const container = wrapper.find('[data-test="container"]').element as HTMLElement
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onEscape).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('关闭后恢复触发元素焦点', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'trigger'
    document.body.appendChild(trigger)
    trigger.focus()

    const { wrapper, open } = mountHost('<button>甲</button>')
    await nextTick()
    open.value = false
    await nextTick()
    expect(document.activeElement).toBe(trigger)
    wrapper.unmount()
    trigger.remove()
  })
})
