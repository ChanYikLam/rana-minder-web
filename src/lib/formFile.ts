/**
 * 附件（file/image 字段）共享逻辑：状态拦截、必填判定、草稿回填归一。
 * 供报名页（ApplicationPage）与联合报名页（JointApplyPage）共用，
 * 避免两处文案/语义重复实现导致漂移。
 */

import type { FileMeta } from '@/types/domain/form'

/** 附件状态拦截：检查中/上传中不可提交，被拒绝、隔离或删除需重新处理 */
export function fileBlockingError(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  for (const f of value as FileMeta[]) {
    if (f.status === 'checking' || f.status === 'uploading') return '文件安全检查中，请稍候再提交'
    if (f.status === 'rejected') return '文件上传失败，请重新上传'
    if (f.status === 'quarantined') return '附件疑似恶意内容已隔离，请联系管理员处理'
    if (f.status === 'deleted') return '文件已移除，请重新上传'
  }
  return null
}

/** file/image 字段必填判定：附件数组非空为准 */
export function isFileFieldFilled(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

/** 表单字段必填判定（报名页/联合报名页共用）：按字段类型取值，杜绝仅认字符串误报必填 */
export function isFieldFilled(value: unknown, type: string): boolean {
  if (type === 'file' || type === 'image') return isFileFieldFilled(value)
  if (type === 'number') return value !== undefined && value !== null && value !== ''
  if (type === 'multi_select' || type === 'checkbox' || type === 'array') {
    return (Array.isArray(value) && value.length > 0) || value === true
  }
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * 草稿/已提交 answers 非附件值归一回填（按字段类型）：
 * number 归一为数字、multi_select/checkbox/array 归一为数组、字符串类型原样保留；
 * 无法解析的值返回 undefined（调用方忽略），避免「草稿重开静默清空」与非法类型漂移。
 */
export function restoredFieldValue(value: unknown, type: string): unknown {
  if (type === 'number') {
    if (value === '' || value === null || value === undefined) return ''
    const n = typeof value === 'number' ? value : Number(value)
    return Number.isNaN(n) ? undefined : n
  }
  if (type === 'multi_select' || type === 'checkbox') {
    if (Array.isArray(value)) return value
    return typeof value === 'string' && value !== '' ? [value] : []
  }
  if (type === 'array') return Array.isArray(value) ? value : []
  if (typeof value !== 'string') return undefined
  return value
}

/**
 * 草稿/已提交 answers 中 file 字段值兼容两种历史形态：fileId 字符串或 FileMeta[]。
 * 混合数组中字符串元素按 fileId 形态生成中性占位 FileMeta（不递归取下标）。
 */
export function restoredFileMeta(value: unknown): FileMeta[] {
  if (Array.isArray(value)) {
    return value
      .map((v): FileMeta | null => (typeof v === 'object' && v !== null ? (v as FileMeta) : stringFileMeta(v)[0] ?? null))
      .filter((v): v is FileMeta => v !== null)
  }
  return stringFileMeta(value)
}

/** 历史 fileId 字符串回填：不宣称已通过安全检测（无真实元数据），以中性态 uploaded 展示 */
function stringFileMeta(value: unknown): FileMeta[] {
  if (typeof value !== 'string' || value === '') return []
  return [{ id: value, name: '已上传附件', size: 0, mimeType: '', status: 'uploaded', uploadedAt: '', checkedAt: null, downloadUrl: null }]
}
