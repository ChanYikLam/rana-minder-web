import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const STORAGE_KEY = 'ranaminder-theme'

describe('useTheme 主题切换', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubMatchMedia(matches: boolean) {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches }))
  }

  // 模块有导入时副作用（applyTheme + 读 localStorage），每次用例需全新模块实例
  async function loadFreshTheme() {
    const mod = await import('./useTheme')
    return mod.useTheme()
  }

  it('无存储偏好时跟随系统深色模式', async () => {
    stubMatchMedia(true)
    const { theme } = await loadFreshTheme()
    expect(theme.value).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('无存储偏好且系统浅色：默认 light', async () => {
    stubMatchMedia(false)
    const { theme } = await loadFreshTheme()
    expect(theme.value).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('读取存储的深色偏好', async () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    stubMatchMedia(false)
    const { theme } = await loadFreshTheme()
    expect(theme.value).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('toggleTheme 切换并持久化', async () => {
    stubMatchMedia(false)
    const { theme, toggleTheme } = await loadFreshTheme()
    expect(theme.value).toBe('light')

    toggleTheme()
    await nextTick()
    expect(theme.value).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')

    toggleTheme()
    await nextTick()
    expect(theme.value).toBe('light')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')
  })
})
