import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isSafeInternalLink, navigateByLink } from './safeLink'
import router from './index'

describe('isSafeInternalLink', () => {
  it('accepts internal relative paths', () => {
    expect(isSafeInternalLink('/me/todo')).toBe(true)
    expect(isSafeInternalLink('/org/c-001/recruitment/r-001')).toBe(true)
  })

  it('rejects null/empty links', () => {
    expect(isSafeInternalLink(null)).toBe(false)
    expect(isSafeInternalLink(undefined)).toBe(false)
    expect(isSafeInternalLink('')).toBe(false)
  })

  it('rejects external protocols and scheme-like payloads', () => {
    expect(isSafeInternalLink('javascript:alert(1)')).toBe(false)
    expect(isSafeInternalLink('https://evil.example.com')).toBe(false)
    expect(isSafeInternalLink('//evil.example.com')).toBe(false)
    expect(isSafeInternalLink('\\evil.example.com')).toBe(false)
  })

  it('rejects all scheme families（data:/file:/vbscript:/mailto: 与大小写变体）', () => {
    expect(isSafeInternalLink('data:text/html,<script>1</script>')).toBe(false)
    expect(isSafeInternalLink('file:///etc/passwd')).toBe(false)
    expect(isSafeInternalLink('vbscript:msgbox(1)')).toBe(false)
    expect(isSafeInternalLink('mailto:attacker@evil.com')).toBe(false)
    expect(isSafeInternalLink('JAVASCRIPT:alert(1)')).toBe(false)
    expect(isSafeInternalLink('JaVaScRiPt:alert(1)')).toBe(false)
  })

  it('rejects 反斜杠开头的协议相对变体与反斜杠前缀', () => {
    expect(isSafeInternalLink('/\\evil.com')).toBe(false)
    expect(isSafeInternalLink('/\\/evil.com')).toBe(false)
  })

  it('rejects 前导空格与编码混淆变体（不以 / 开头）', () => {
    expect(isSafeInternalLink(' /me')).toBe(false)
    expect(isSafeInternalLink('%2f%2fevil.com')).toBe(false)
    expect(isSafeInternalLink('http%3a//evil.com')).toBe(false)
  })
})

describe('navigateByLink', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('安全链接触发 router.push', () => {
    const push = vi.spyOn(router, 'push').mockResolvedValue(undefined as never)

    navigateByLink('/me/todo')

    expect(push).toHaveBeenCalledWith('/me/todo')
  })

  it('危险/非法链接不触发跳转', () => {
    const push = vi.spyOn(router, 'push')

    navigateByLink('javascript:alert(1)')
    navigateByLink('https://evil.com')
    navigateByLink('//evil.com')
    navigateByLink('')
    navigateByLink(null)

    expect(push).not.toHaveBeenCalled()
  })
})
