import { describe, expect, it } from 'vitest'
import { formatDateCn, formatDateKey, formatTimeCn, formatWeekdayCn, formatRelativeCn, dayBoundaryIso } from './date'

describe('lib/date 平台时区（Asia/Shanghai）格式化', () => {
  it('formatDateCn：UTC 时刻按平台时区转换并带时间', () => {
    // 2026-08-07T04:34:00Z = 北京 12:34
    expect(formatDateCn('2026-08-07T04:34:00Z')).toBe('2026/08/07 12:34')
  })

  it('formatDateCn：跨日边界（UTC 凌晨 = 北京当日）', () => {
    // 2026-08-07T17:00:00Z = 北京 08-08 01:00
    expect(formatDateCn('2026-08-07T17:00:00Z')).toBe('2026/08/08 01:00')
  })

  it('formatDateKey：返回自然日键，跨日正确', () => {
    expect(formatDateKey('2026-08-07T04:34:00Z')).toBe('2026-08-07')
    expect(formatDateKey('2026-08-07T17:00:00Z')).toBe('2026-08-08')
  })

  it('formatTimeCn：普通时刻', () => {
    expect(formatTimeCn('2026-08-07T04:34:00Z')).toBe('12:34')
  })

  it('formatTimeCn：北京 24 点归零为 00:（UTC 16:xx 边界）', () => {
    // 2026-08-07T16:00:00Z = 北京 24:00（次日 0 点），应显示 00:00
    expect(formatTimeCn('2026-08-07T16:00:00Z')).toBe('00:00')
  })

  it('formatWeekdayCn：按平台时区输出星期与日期', () => {
    expect(formatWeekdayCn('2026-08-07T04:34:00Z')).toBe('8月7日星期五')
  })

  it('dayBoundaryIso：start 为当日 00:00（北京），end 为当日 23:59:59', () => {
    // 2026-08-07 00:00:00 北京 = 2026-08-06T16:00:00Z
    expect(dayBoundaryIso('2026-08-07', false)).toBe('2026-08-06T16:00:00.000Z')
    // 2026-08-07 23:59:59.999 北京 = 2026-08-07T15:59:59.999Z
    expect(dayBoundaryIso('2026-08-07', true)).toBe('2026-08-07T15:59:59.999Z')
  })

  it('dayBoundaryIso：start 跨月/跨年回退前一日正确', () => {
    expect(dayBoundaryIso('2026-03-01', false)).toBe('2026-02-28T16:00:00.000Z')
    expect(dayBoundaryIso('2026-01-01', false)).toBe('2025-12-31T16:00:00.000Z')
  })
})

describe('formatRelativeCn 通知相对时间（M-7 时区漂移）', () => {
  // 测试基准：2026-08-07T16:00:00Z（北京时间 2026-08-08 00:00:00）
  const nowUtc = new Date('2026-08-07T16:00:00Z')

  it('1 分钟内：刚刚', () => {
    const iso = '2026-08-07T15:59:30Z' // 30 秒前
    expect(formatRelativeCn(iso, nowUtc)).toBe('刚刚')
  })

  it('1 小时内：X 分钟前', () => {
    const iso = '2026-08-07T15:55:00Z' // 5 分钟前
    expect(formatRelativeCn(iso, nowUtc)).toBe('5 分钟前')
  })

  it('24 小时内：X 小时前', () => {
    const iso = '2026-08-07T10:00:00Z' // 6 小时前
    expect(formatRelativeCn(iso, nowUtc)).toBe('6 小时前')
  })

  it('超过 24 小时：使用平台时区（Asia/Shanghai）显示 M月D日', () => {
    // nowUtc = 2026-08-08 00:00 北京
    // 25 小时前 = 2026-08-06 23:00 北京（不是 2026-08-07！）
    // 旧实现在 UTC-5 等时区下会显示 "8月6日"（用户本地）；用 Asia/Shanghai 统一显示 "8月6日"
    const iso = '2026-08-06T15:00:00Z' // 北京 2026-08-06 23:00
    expect(formatRelativeCn(iso, nowUtc)).toBe('8月6日')
  })

  it('跨日边界：同一 UTC 时刻，平台时区统一显示 M月D日（与用户本地时区无关）', () => {
    // 通知：2026-08-07T17:00:00Z = 北京 2026-08-08 01:00（已跨日）
    // now: 2026-08-08T03:00:00Z（= 北京 2026-08-08 11:00），差 10 小时，应显示小时前而非日期
    const iso = '2026-08-07T17:00:00Z'
    const now = new Date('2026-08-08T03:00:00Z')
    expect(formatRelativeCn(iso, now)).toBe('10 小时前')
  })

  it('超过 24 小时且仍在平台时区同一日：仍显示该日 M月D日', () => {
    // 通知：2026-08-07T00:00:00Z = 北京 2026-08-07 08:00
    // now: 2026-08-08T01:00:00Z（= 北京 2026-08-08 09:00），差 25 小时
    // 北京视角：通知在 8月7日
    const iso = '2026-08-07T00:00:00Z'
    const now = new Date('2026-08-08T01:00:00Z')
    expect(formatRelativeCn(iso, now)).toBe('8月7日')
  })

  it('无效输入：返回空串', () => {
    expect(formatRelativeCn('bad', nowUtc)).toBe('')
    expect(formatRelativeCn('', nowUtc)).toBe('')
    expect(formatRelativeCn('not-a-date', nowUtc)).toBe('')
  })

  it('未来时刻（时钟漂移）：返回空串，避免显示负数', () => {
    const future = '2026-08-08T00:00:00Z' // 晚于 nowUtc
    expect(formatRelativeCn(future, nowUtc)).toBe('')
  })
})
