import { describe, expect, it } from 'vitest'
import { formatDateCn, formatDateKey, formatTimeCn, formatWeekdayCn, dayBoundaryIso } from './date'

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
