import type { ApiError, ApiResult } from '@/types/contracts'

export const ERROR_CODES = [
  'IFC-ERR-001', 'IFC-ERR-002', 'IFC-ERR-003', 'IFC-ERR-004',
  'IFC-ERR-005', 'IFC-ERR-006', 'IFC-ERR-007', 'IFC-ERR-008',
  'IFC-ERR-009', 'IFC-ERR-010', 'IFC-ERR-011', 'IFC-ERR-012',
  'IFC-ERR-013', 'IFC-ERR-014', 'IFC-ERR-015', 'IFC-ERR-016',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  'IFC-ERR-001': '请先登录后再进行操作',
  'IFC-ERR-002': '登录已过期，请重新登录',
  'IFC-ERR-003': '您没有执行此操作的权限',
  'IFC-ERR-004': '请求的内容不存在或已被移除',
  'IFC-ERR-005': '数据已被他人修改，请刷新后重试',
  'IFC-ERR-006': '当前状态不允许此操作',
  'IFC-ERR-007': '提交的信息不符合要求，请检查后重试',
  'IFC-ERR-008': '操作不符合业务规则',
  'IFC-ERR-009': '请勿重复提交',
  'IFC-ERR-010': '操作过于频繁，请稍后再试',
  'IFC-ERR-011': '依赖的服务暂时不可用，请稍后再试',
  'IFC-ERR-012': '外部服务响应超时，请稍后再试',
  'IFC-ERR-013': '操作结果暂时无法确认，请勿重复提交',
  'IFC-ERR-014': '操作正在处理中，请勿重复提交',
  'IFC-ERR-015': '请求的内容涉及敏感信息，无法展示',
  'IFC-ERR-016': '系统出现未知错误，请稍后再试',
}

export const ERROR_AUTO_RETRY: Record<ErrorCode, boolean> = {
  'IFC-ERR-001': false,
  'IFC-ERR-002': false,
  'IFC-ERR-003': false,
  'IFC-ERR-004': false,
  'IFC-ERR-005': false,
  'IFC-ERR-006': false,
  'IFC-ERR-007': false,
  'IFC-ERR-008': false,
  'IFC-ERR-009': false,
  'IFC-ERR-010': true,
  'IFC-ERR-011': true,
  'IFC-ERR-012': true,
  'IFC-ERR-013': false,
  'IFC-ERR-014': false,
  'IFC-ERR-015': false,
  'IFC-ERR-016': true,
}

export const ERROR_RESUBMIT_ALLOWED: Record<ErrorCode, boolean> = {
  'IFC-ERR-001': false,
  'IFC-ERR-002': false,
  'IFC-ERR-003': false,
  'IFC-ERR-004': false,
  'IFC-ERR-005': true,
  'IFC-ERR-006': true,
  'IFC-ERR-007': true,
  'IFC-ERR-008': true,
  'IFC-ERR-009': false,
  'IFC-ERR-010': true,
  'IFC-ERR-011': false,
  'IFC-ERR-012': false,
  'IFC-ERR-013': false,
  'IFC-ERR-014': false,
  'IFC-ERR-015': false,
  'IFC-ERR-016': true,
}

export type PageStateFromError = 'error' | 'forbidden' | 'loading'

export function errorToPageState(code: ErrorCode): PageStateFromError {
  if (code === 'IFC-ERR-001' || code === 'IFC-ERR-002' || code === 'IFC-ERR-003' || code === 'IFC-ERR-015') {
    return 'forbidden'
  }
  if (code === 'IFC-ERR-013' || code === 'IFC-ERR-014') {
    return 'loading'
  }
  return 'error'
}

export function parseApiError(body: unknown): ApiError {
  if (body && typeof body === 'object' && 'code' in body) {
    const b = body as Record<string, unknown>
    return {
      code: String(b.code),
      message: String(b.message || ERROR_MESSAGES['IFC-ERR-016']),
      supportId: b.supportId ? String(b.supportId) : undefined,
      fieldErrors: b.fieldErrors as Record<string, string[]> | undefined,
    }
  }
  return {
    code: 'IFC-ERR-016',
    message: ERROR_MESSAGES['IFC-ERR-016'],
  }
}

export function httpStatusToResult<T>(status: number, body: unknown): ApiResult<T> {
  const error = parseApiError(body)
  const code = error.code as ErrorCode

  if (status === 202) {
    if (code === 'IFC-ERR-013') {
      return { kind: 'external_uncertain', error }
    }
    return { kind: 'accepted', data: { taskId: '', status: 'processing' } }
  }
  if (status === 409 && code === 'IFC-ERR-005') {
    return { kind: 'concurrency_conflict', error, currentData: (body as Record<string, unknown>)?.currentData }
  }
  if (status === 503) {
    return { kind: 'dependency_unavailable', error }
  }
  return { kind: 'rejected', error }
}
