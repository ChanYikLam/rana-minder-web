import type { ApiError, ApiResult } from '@/types/contracts'

export const ERROR_CODES = [
  'IFC-ERR-001', 'IFC-ERR-002', 'IFC-ERR-003', 'IFC-ERR-004',
  'IFC-ERR-005', 'IFC-ERR-006', 'IFC-ERR-007', 'IFC-ERR-008',
  'IFC-ERR-009', 'IFC-ERR-010', 'IFC-ERR-011', 'IFC-ERR-012',
  'IFC-ERR-013', 'IFC-ERR-014', 'IFC-ERR-015', 'IFC-ERR-016',
  'IFC-ERR-017',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

function isErrorCode(value: string): value is ErrorCode {
  return ERROR_CODES.includes(value as ErrorCode)
}

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  'IFC-ERR-001': '请先登录后再进行操作',
  'IFC-ERR-002': '当前认证已不足以执行此操作，请重新验证身份',
  'IFC-ERR-003': '您没有执行此操作的权限',
  'IFC-ERR-004': '当前请求不属于可访问的作用域',
  'IFC-ERR-005': '提交的信息不符合要求，请检查后重试',
  'IFC-ERR-006': '当前业务条件不允许此操作',
  'IFC-ERR-007': '对象状态已变化，请刷新后重新选择操作',
  'IFC-ERR-008': '数据版本或影响预览已变化，请刷新后重试',
  'IFC-ERR-009': '相同操作标识对应了不同内容，请勿重复提交',
  'IFC-ERR-010': '当前资源发生竞争，请刷新后重试',
  'IFC-ERR-011': '当前查询或操作受到安全限制',
  'IFC-ERR-012': '依赖的服务暂时不可用，请稍后再试',
  'IFC-ERR-013': '操作结果暂时无法确认，请勿重复提交',
  'IFC-ERR-014': '操作正在处理中，请勿重复提交',
  'IFC-ERR-015': '请求的内容不存在或当前不可见',
  'IFC-ERR-016': '操作未能安全提交，请稍后重试',
  'IFC-ERR-017': '请求体解析失败，请检查提交内容',
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
  'IFC-ERR-010': false,
  'IFC-ERR-011': false,
  'IFC-ERR-012': true,
  'IFC-ERR-013': false,
  'IFC-ERR-014': false,
  'IFC-ERR-015': false,
  'IFC-ERR-016': false,
  'IFC-ERR-017': false,
}

export const ERROR_RESUBMIT_ALLOWED: Record<ErrorCode, boolean> = {
  'IFC-ERR-001': false,
  'IFC-ERR-002': true,
  'IFC-ERR-003': false,
  'IFC-ERR-004': false,
  'IFC-ERR-005': true,
  'IFC-ERR-006': true,
  'IFC-ERR-007': true,
  'IFC-ERR-008': true,
  'IFC-ERR-009': false,
  'IFC-ERR-010': true,
  'IFC-ERR-011': false,
  'IFC-ERR-012': true,
  'IFC-ERR-013': false,
  'IFC-ERR-014': false,
  'IFC-ERR-015': false,
  'IFC-ERR-016': true,
  'IFC-ERR-017': false,
}

export type PageStateFromError = 'error' | 'forbidden' | 'loading'

export function errorCodeOf(result: ApiResult<unknown>): ErrorCode {
  if (result.kind === 'rejected' || result.kind === 'concurrency_conflict' || result.kind === 'external_uncertain' || result.kind === 'dependency_unavailable') {
    const code = result.error?.code
    return code && isErrorCode(code) ? code : 'IFC-ERR-016'
  }
  return 'IFC-ERR-016'
}

export function errorToPageState(code: ErrorCode): PageStateFromError {
  if (code === 'IFC-ERR-001' || code === 'IFC-ERR-002' || code === 'IFC-ERR-003' || code === 'IFC-ERR-004' || code === 'IFC-ERR-011' || code === 'IFC-ERR-015') {
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
    const rawCode = String(b.code)
    if (!isErrorCode(rawCode)) {
      return { code: 'IFC-ERR-016', message: ERROR_MESSAGES['IFC-ERR-016'] }
    }
    return {
      code: rawCode,
      message: String(b.message || ERROR_MESSAGES[rawCode]),
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

  if (code === 'IFC-ERR-013') {
    return { kind: 'external_uncertain', error }
  }
  if (code === 'IFC-ERR-014' || status === 202) {
    const data = body && typeof body === 'object' && 'data' in body ? (body as { data?: unknown }).data : undefined
    const task = data && typeof data === 'object' ? data as Record<string, unknown> : {}
    return { kind: 'accepted', data: { taskId: String(task.taskId || ''), status: String(task.status || 'processing') } }
  }
  if (code === 'IFC-ERR-008' || code === 'IFC-ERR-010') {
    return { kind: 'concurrency_conflict', error, currentData: (body as Record<string, unknown>)?.currentData }
  }
  if (code === 'IFC-ERR-012' || status === 503) {
    return { kind: 'dependency_unavailable', error }
  }
  return { kind: 'rejected', error }
}
