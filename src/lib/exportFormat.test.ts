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

  // 时区说明：formatTime 用本地时区（getHours 等）格式化。
  // 用例 1 的期望值由同一本地时区的 Date 方法动态计算 → 与运行时区无关；
  // 用例 2 的本地构造（new Date(2026, 7, 7, 12, 34)）解析与格式化同属本地时区，偏移对称抵消。
  // 若 formatTime 将来改用固定时区（如 Asia/Shanghai），以下用例需同步调整。
  it('formatTime：Z 时间戳按本地时区显示（期望值动态计算，时区无关）', () => {
    const d = new Date('2026-08-07T04:34:00Z')
    const expected = `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    expect(formatTime('2026-08-07T04:34:00Z')).toBe(expected)
  })

  it('formatTime：本地构造时刻往返格式化一致', () => {
    const d = new Date(2026, 7, 7, 12, 34)
    expect(formatTime(d.toISOString())).toBe('8月7日 12:34')
  })

  it('formatTime：无效日期防御性返回空串', () => {
    expect(formatTime('bad')).toBe('')
    expect(formatTime('')).toBe('')
    expect(formatTime('not-a-date')).toBe('')
  })
})
