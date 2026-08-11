/**
 * 平台时区（UTC+8）显示工具。
 * 排期/日程类展示统一使用 Asia/Shanghai，避免依赖浏览器本地时区导致错位。
 */

export const PLATFORM_TIMEZONE = 'Asia/Shanghai'

const dateTimeFmt = new Intl.DateTimeFormat('zh-CN', {
  timeZone: PLATFORM_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const timeFmt = new Intl.DateTimeFormat('zh-CN', {
  timeZone: PLATFORM_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const weekdayFmt = new Intl.DateTimeFormat('zh-CN', {
  timeZone: PLATFORM_TIMEZONE,
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})

/** 2025-08-02 12:34（平台时区） */
export function formatDateCn(value: string | Date): string {
  return dateTimeFmt.format(new Date(value))
}

/** 平台时区的自然日键：2025-08-02（作为分组/key 使用，可正确排序） */
export function formatDateKey(value: string | Date): string {
  const d = new Date(value)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PLATFORM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
  return parts
}

/** 12:34（平台时区） */
export function formatTimeCn(value: string | Date): string {
  return timeFmt.format(new Date(value)).replace(/^24:/, '00:')
}

/** 8月2日 星期六（平台时区） */
export function formatWeekdayCn(value: string | Date): string {
  return weekdayFmt.format(new Date(value))
}

/** 由 formatDateKey 产出的平台时区自然日键（YYYY-MM-DD）渲染星期文案，不硬编码时区偏移 */
export function formatWeekdayFromDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  if (!y || !m || !d) return dayKey
  const instant = Date.UTC(y, m - 1, d, 4, 0, 0)
  return weekdayFmt.format(new Date(instant))
}

/** 平台时区自然日边界 ISO：start=true 当日 00:00:00，false 当日 23:59:59（用于 date-only 输入的截止查询，P2-17） */
export function dayBoundaryIso(dayKey: string, end: boolean): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  if (!y || !m || !d) return dayKey
  // 平台时区 UTC+8：当日 23:59:59.999 = 当日 15:59:59.999 UTC；当日 00:00:00 = 前一日 16:00:00 UTC
  const instant = end
    ? Date.UTC(y, m - 1, d, 15, 59, 59, 999)
    : Date.UTC(y, m - 1, d - 1, 16, 0, 0, 0)
  return new Date(instant).toISOString()
}

/**
 * ISO 时刻 → `<input type="datetime-local">` 本地值（P2-22/32：datetime-local 是本地时区无偏移，不能原样传入
 * 全仓 ISO 契约，否则"2026-08-10T12:30+08:00"会被当作字面量发送）。
 * 无效输入原样返回。
 */
export function toDateTimeLocal(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** `<input type="datetime-local">` 本地值 → ISO 契约（P2-22/32）。无效输入原样返回。 */
export function toIso(dateTimeLocal: string): string {
  if (!dateTimeLocal) return ''
  const d = new Date(dateTimeLocal)
  return Number.isNaN(d.getTime()) ? dateTimeLocal : d.toISOString()
}