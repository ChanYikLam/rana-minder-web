import { describe, expect, it } from 'vitest'
import { isSafeInternalLink } from './safeLink'

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
})
