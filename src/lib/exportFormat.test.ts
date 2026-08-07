import { describe, expect, it } from 'vitest'
import { formatSize, formatTime } from './exportFormat'

describe('exportFormat 展示格式化', () => {
  it('formatSize：0 显示占位、KB/MB 分级', () => {
    expect(formatSize(0)).toBe('-')
    expect(formatSize(512)).toBe('0.5 KB')
    expect(formatSize(2048)).toBe('2.0 KB')
    expect(formatSize(1048576)).toBe('1.0 MB')
    expect(formatSize(5 * 1048576)).toBe('5.0 MB')
  })

  it('formatTime：按本地时区输出月日时分', () => {
    const d = new Date('2026-08-07T12:34:00')
    expect(formatTime(d.toISOString())).toBe('8月7日 12:34')
  })
})
