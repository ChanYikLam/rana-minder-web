import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useKeyboardShortcuts, type KeyboardShortcut } from './useKeyboardShortcuts'

function mountShortcuts(shortcuts: KeyboardShortcut[], enabled?: Ref<boolean>) {
  const host = defineComponent({
    setup() {
      useKeyboardShortcuts({ shortcuts, enabled })
      return () => null
    },
  })
  return mount(host)
}

function pressKey(init: KeyboardEventInit) {
  window.dispatchEvent(new KeyboardEvent('keydown', init))
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useKeyboardShortcuts 修饰键匹配矩阵', () => {
  it('无修饰键快捷键：按键命中并执行', () => {
    const handler = vi.fn()
    mountShortcuts([{ key: 'k', description: '跳转', handler }])

    pressKey({ key: 'k' })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('大小写不敏感', () => {
    const handler = vi.fn()
    mountShortcuts([{ key: 'K', description: '跳转', handler }])

    pressKey({ key: 'k' })
    pressKey({ key: 'K' })

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('ctrl 快捷键：需 ctrl 或 meta（mac），裸按键不触发', () => {
    const handler = vi.fn()
    mountShortcuts([{ key: 's', ctrl: true, description: '保存', handler }])

    pressKey({ key: 's' })
    expect(handler).not.toHaveBeenCalled()

    pressKey({ key: 's', ctrlKey: true })
    pressKey({ key: 's', metaKey: true })
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('未声明 ctrl 的快捷键：带 ctrl/meta 时拒绝', () => {
    const handler = vi.fn()
    mountShortcuts([{ key: 'a', description: '全选', handler }])

    pressKey({ key: 'a', ctrlKey: true })
    pressKey({ key: 'a', metaKey: true })

    expect(handler).not.toHaveBeenCalled()
  })

  it('shift/alt 组合矩阵：必须完全匹配', () => {
    const handler = vi.fn()
    mountShortcuts([{ key: 'd', shift: true, alt: true, description: '调试', handler }])

    pressKey({ key: 'd' })
    pressKey({ key: 'd', shiftKey: true })
    pressKey({ key: 'd', altKey: true })
    expect(handler).not.toHaveBeenCalled()

    pressKey({ key: 'd', shiftKey: true, altKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('未声明 shift 的快捷键：带 shift 时拒绝', () => {
    const handler = vi.fn()
    mountShortcuts([{ key: 'e', description: '编辑', handler }])

    pressKey({ key: 'e', shiftKey: true })

    expect(handler).not.toHaveBeenCalled()
  })

  it('按住重复触发（repeat）被忽略', () => {
    const handler = vi.fn()
    mountShortcuts([{ key: 'k', description: '跳转', handler }])

    pressKey({ key: 'k', repeat: true })

    expect(handler).not.toHaveBeenCalled()
  })

  it('多个快捷键同时命中时全部执行并阻止默认行为', () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    mountShortcuts([
      { key: 'x', description: '一', handler: h1 },
      { key: 'x', ctrl: true, description: '二', handler: h2 },
    ])

    const event = new KeyboardEvent('keydown', { key: 'x' })
    const preventDefault = vi.spyOn(event, 'preventDefault')
    const stopPropagation = vi.spyOn(event, 'stopPropagation')
    window.dispatchEvent(event)

    expect(h1).toHaveBeenCalledTimes(1)
    expect(h2).not.toHaveBeenCalled()
    expect(preventDefault).toHaveBeenCalled()
    expect(stopPropagation).toHaveBeenCalled()
  })
})

describe('useKeyboardShortcuts 输入控件忽略与开关', () => {
  it('输入框/文本域/下拉框内按键被忽略', () => {
    const handler = vi.fn()
    mountShortcuts([{ key: 'k', description: '跳转', handler }])

    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
      const el = document.createElement(tag)
      document.body.appendChild(el)
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }))
    }

    expect(handler).not.toHaveBeenCalled()
  })

  it('contenteditable 元素内按键被忽略', () => {
    const handler = vi.fn()
    mountShortcuts([{ key: 'k', description: '跳转', handler }])

    const el = document.createElement('div')
    el.contentEditable = 'true'
    document.body.appendChild(el)
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }))

    expect(handler).not.toHaveBeenCalled()
  })

  it('enabled=false 时全局禁用，切换 true 后恢复', () => {
    const handler = vi.fn()
    const enabled = ref(false)
    mountShortcuts([{ key: 'k', description: '跳转', handler }], enabled)

    pressKey({ key: 'k' })
    expect(handler).not.toHaveBeenCalled()

    enabled.value = true
    pressKey({ key: 'k' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('卸载后移除监听器', () => {
    const handler = vi.fn()
    const wrapper = mountShortcuts([{ key: 'k', description: '跳转', handler }])

    pressKey({ key: 'k' })
    expect(handler).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    pressKey({ key: 'k' })
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
