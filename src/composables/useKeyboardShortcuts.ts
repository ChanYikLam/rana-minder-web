import { onMounted, onUnmounted, type Ref } from 'vue'

export interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  description: string
  handler: () => void
}

export interface UseKeyboardShortcutsOptions {
  enabled?: Ref<boolean>
  shortcuts: KeyboardShortcut[]
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions) {
  const { shortcuts, enabled } = options

  function matches(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
    if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false
    if (shortcut.ctrl && !event.ctrlKey && !event.metaKey) return false
    if (!shortcut.ctrl && (event.ctrlKey || event.metaKey)) return false
    if (shortcut.shift && !event.shiftKey) return false
    if (!shortcut.shift && event.shiftKey) return false
    if (shortcut.alt && !event.altKey) return false
    if (!shortcut.alt && event.altKey) return false
    return true
  }

  function shouldIgnore(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    if (target.isContentEditable) return true
    return false
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.repeat) return
    if (enabled && !enabled.value) return
    if (shouldIgnore(event)) return

    const active = shortcuts.filter((s) => matches(event, s))
    if (active.length === 0) return

    event.preventDefault()
    event.stopPropagation()

    for (const shortcut of active) {
      shortcut.handler()
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
  })
}
