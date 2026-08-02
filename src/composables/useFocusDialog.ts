import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * 受控弹层焦点管理（关闭时自动恢复触发元素焦点）：
 * - 打开时把焦点移入容器内首个可聚焦元素
 * - Tab / Shift+Tab 在容器内循环
 * - Esc 触发 onEscape 回调
 */
export function useFocusDialog(containerRef: Ref<HTMLElement | null>, open: Ref<boolean>, onEscape?: () => void) {
  let previous: HTMLElement | null = null
  let trapped = false

  async function start() {
    await nextTick()
    const el = containerRef.value
    if (!el || trapped) return
    previous = document.activeElement as HTMLElement | null
    trapped = true
    el.addEventListener('keydown', onKeydown)
    const first = el.querySelector<HTMLElement>(FOCUSABLE)
    if (first) first.focus()
    else el.focus()
  }

  function stop() {
    const el = containerRef.value
    if (!trapped) return
    el?.removeEventListener('keydown', onKeydown)
    trapped = false
    // 触发元素仍在文档中时恢复焦点；若已被销毁（如列表刷新后重渲染）则放弃恢复，避免 focus 抛出
    if (previous?.isConnected) previous.focus()
    previous = null
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onEscape?.()
      return
    }
    if (e.key !== 'Tab') return
    const el = containerRef.value
    if (!el) return
    const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  watch(open, (v) => (v ? start() : stop()), { immediate: true })
  onBeforeUnmount(stop)

  return { stop }
}