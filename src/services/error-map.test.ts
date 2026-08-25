import { describe, expect, it } from 'vitest'
import {
  errorCodeOf,
  errorToPageState,
  httpStatusToResult,
  parseApiError,
  ERROR_CODES,
  ERROR_MESSAGES,
  ERROR_AUTO_RETRY,
  ERROR_RESUBMIT_ALLOWED,
} from './error-map'
import type { ApiResult } from '@/types/contracts'

/** 断言 kind 并将联合类型收窄到对应分支，便于访问 error/currentData 等属性 */
function expectKind<T extends ApiResult<unknown>['kind']>(
  result: ApiResult<unknown>,
  kind: T,
): Extract<ApiResult<unknown>, { kind: T }> {
  expect(result.kind).toBe(kind)
  return result as Extract<ApiResult<unknown>, { kind: T }>
}

describe('ERROR_CODES completeness', () => {
  it('has exactly 17 error codes', () => {
    expect(ERROR_CODES).toHaveLength(17)
  })

  it('every error code has a message, auto-retry flag and resubmit flag', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_MESSAGES[code]).toBeTruthy()
      expect(ERROR_AUTO_RETRY).toHaveProperty(code)
      expect(ERROR_RESUBMIT_ALLOWED).toHaveProperty(code)
    }
  })

  it('auto-retry semantics: only dependency_unavailable (012) is retryable', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_AUTO_RETRY[code], `auto-retry 语义漂移: ${code}`).toBe(code === 'IFC-ERR-012')
    }
  })

  it('resubmit 语义：重认证(002)/校验/前置/状态/并发/依赖/内部可重提，未认证/越权/幂等/限流/不确定/不可见类不可重提', () => {
    const allowed = new Set(['IFC-ERR-002', 'IFC-ERR-005', 'IFC-ERR-006', 'IFC-ERR-007', 'IFC-ERR-008', 'IFC-ERR-010', 'IFC-ERR-012', 'IFC-ERR-016'])
    for (const code of ERROR_CODES) {
      expect(ERROR_RESUBMIT_ALLOWED[code], `resubmit 语义漂移: ${code}`).toBe(allowed.has(code))
    }
  })
})

describe('parseApiError', () => {
  it('parses known error code with message and supportId', () => {
    const result = parseApiError({ code: 'IFC-ERR-005', message: '字段校验失败', supportId: 'SUP-123' })
    expect(result).toEqual({ code: 'IFC-ERR-005', message: '字段校验失败', supportId: 'SUP-123' })
  })

  it('parses error with fieldErrors', () => {
    const result = parseApiError({ code: 'IFC-ERR-005', fieldErrors: { name: ['不能为空'] } })
    expect(result.fieldErrors).toEqual({ name: ['不能为空'] })
  })

  it('parses IFC-ERR-017 keeping the server message (回归：017 曾被视为未知码回退 016 丢失提示)', () => {
    const result = parseApiError({ code: 'IFC-ERR-017', message: '请求体 JSON 解析失败' })
    expect(result.code).toBe('IFC-ERR-017')
    expect(result.message).toBe('请求体 JSON 解析失败')
  })

  it('已知码缺 message 时用该码自身文案兜底（回归：此前回退 016 文案）', () => {
    const result = parseApiError({ code: 'IFC-ERR-017' })
    expect(result.code).toBe('IFC-ERR-017')
    expect(result.message).toBe(ERROR_MESSAGES['IFC-ERR-017'])
  })

  it('falls back to IFC-ERR-016 for unknown codes', () => {
    const result = parseApiError({ code: 'UNKNOWN_CODE', message: 'sensitive stack trace' })
    expect(result.code).toBe('IFC-ERR-016')
    expect(result.message).toBe(ERROR_MESSAGES['IFC-ERR-016'])
  })

  it('falls back to IFC-ERR-016 for non-object bodies', () => {
    const result = parseApiError('plain string')
    expect(result.code).toBe('IFC-ERR-016')
  })

  it('falsy supportId 被剥离为 undefined', () => {
    const result = parseApiError({ code: 'IFC-ERR-005', message: 'x', supportId: '' })
    expect(result.supportId).toBeUndefined()
  })

  it('falls back to IFC-ERR-016 for null/undefined', () => {
    expect(parseApiError(null).code).toBe('IFC-ERR-016')
    expect(parseApiError(undefined).code).toBe('IFC-ERR-016')
  })
})

describe('errorToPageState', () => {
  it('maps auth errors to forbidden', () => {
    expect(errorToPageState('IFC-ERR-001')).toBe('forbidden')
    expect(errorToPageState('IFC-ERR-002')).toBe('forbidden')
    expect(errorToPageState('IFC-ERR-003')).toBe('forbidden')
    expect(errorToPageState('IFC-ERR-004')).toBe('forbidden')
  })

  it('maps security and visibility errors to forbidden', () => {
    expect(errorToPageState('IFC-ERR-011')).toBe('forbidden')
    expect(errorToPageState('IFC-ERR-015')).toBe('forbidden')
  })

  it('maps uncertain and processing errors to error（P2-2：加载场景不卡 loading）', () => {
    expect(errorToPageState('IFC-ERR-013')).toBe('error')
    expect(errorToPageState('IFC-ERR-014')).toBe('error')
  })

  it('maps all remaining errors to error', () => {
    const errorCodes = ['IFC-ERR-005', 'IFC-ERR-006', 'IFC-ERR-007', 'IFC-ERR-008', 'IFC-ERR-009', 'IFC-ERR-010', 'IFC-ERR-012', 'IFC-ERR-013', 'IFC-ERR-014', 'IFC-ERR-016', 'IFC-ERR-017'] as const
    for (const code of errorCodes) {
      expect(errorToPageState(code)).toBe('error')
    }
  })

  it('covers all 17 error codes', () => {
    const covered = new Set<string>()
    for (const code of ERROR_CODES) {
      const state = errorToPageState(code)
      covered.add(code)
      expect(['error', 'forbidden', 'loading']).toContain(state)
    }
    expect(covered.size).toBe(17)
  })
})

describe('httpStatusToResult', () => {
  it('maps IFC-ERR-013 to external_uncertain', () => {
    const result = expectKind(httpStatusToResult(202, { code: 'IFC-ERR-013', message: '无法确认' }), 'external_uncertain')
    expect(result.error?.code).toBe('IFC-ERR-013')
  })

  it('maps IFC-ERR-014 to accepted with task data', () => {
    const result = httpStatusToResult(202, {
      code: 'IFC-ERR-014',
      data: { taskId: 'task-1', status: 'processing' },
    })
    expect(result).toEqual({ kind: 'accepted', data: { taskId: 'task-1', status: 'processing' } })
  })

  it('maps IFC-ERR-008 to concurrency_conflict with currentData', () => {
    const result = expectKind(httpStatusToResult(409, { code: 'IFC-ERR-008', currentData: { version: 2 } }), 'concurrency_conflict')
    expect(result.currentData).toEqual({ version: 2 })
  })

  it('maps IFC-ERR-010 to concurrency_conflict', () => {
    const result = expectKind(httpStatusToResult(409, { code: 'IFC-ERR-010', currentData: { slots: 3 } }), 'concurrency_conflict')
    expect(result.currentData).toEqual({ slots: 3 })
  })

  it('maps IFC-ERR-012 to dependency_unavailable', () => {
    const result = expectKind(httpStatusToResult(503, { code: 'IFC-ERR-012', message: '邮件服务不可用' }), 'dependency_unavailable')
    expect(result.error?.code).toBe('IFC-ERR-012')
  })

  it('maps 503 without error code to dependency_unavailable', () => {
    const result = httpStatusToResult(503, {})
    expect(result.kind).toBe('dependency_unavailable')
  })

  it('maps IFC-ERR-001 (unauthenticated) to rejected', () => {
    const result = expectKind(httpStatusToResult(401, { code: 'IFC-ERR-001', message: '未登录' }), 'rejected')
    expect(result.error?.code).toBe('IFC-ERR-001')
  })

  it('maps IFC-ERR-003 (unauthorized) to rejected', () => {
    const result = expectKind(httpStatusToResult(403, { code: 'IFC-ERR-003', message: '无权限' }), 'rejected')
    expect(result.error?.code).toBe('IFC-ERR-003')
  })

  it('maps IFC-ERR-005 (invalid input) to rejected with fieldErrors', () => {
    const result = expectKind(
      httpStatusToResult(422, {
        code: 'IFC-ERR-005',
        message: '校验失败',
        fieldErrors: { email: ['格式不正确'] },
      }),
      'rejected',
    )
    expect(result.error?.fieldErrors).toEqual({ email: ['格式不正确'] })
  })

  it('maps IFC-ERR-006 (precondition failed) to rejected', () => {
    const result = expectKind(httpStatusToResult(422, { code: 'IFC-ERR-006', message: '资料未补齐' }), 'rejected')
    expect(result.error?.code).toBe('IFC-ERR-006')
  })

  it('maps IFC-ERR-007 (state conflict) to rejected', () => {
    const result = expectKind(httpStatusToResult(409, { code: 'IFC-ERR-007', message: '活动已结束' }), 'rejected')
    expect(result.error?.code).toBe('IFC-ERR-007')
  })

  it('maps IFC-ERR-009 (idempotency conflict) to rejected', () => {
    const result = expectKind(httpStatusToResult(409, { code: 'IFC-ERR-009', message: '请勿重复提交' }), 'rejected')
    expect(result.error?.code).toBe('IFC-ERR-009')
  })

  it('maps IFC-ERR-011 (security limit) to rejected', () => {
    const result = expectKind(httpStatusToResult(429, { code: 'IFC-ERR-011', message: '请求频率过高' }), 'rejected')
    expect(result.error?.code).toBe('IFC-ERR-011')
  })

  it('maps IFC-ERR-015 (not visible) to rejected', () => {
    const result = expectKind(httpStatusToResult(404, { code: 'IFC-ERR-015', message: '不存在或不可见' }), 'rejected')
    expect(result.error?.code).toBe('IFC-ERR-015')
  })

  it('maps IFC-ERR-016 (internal failure) to rejected', () => {
    const result = expectKind(httpStatusToResult(500, { code: 'IFC-ERR-016', message: '内部错误' }), 'rejected')
    expect(result.error?.code).toBe('IFC-ERR-016')
  })

  it('maps unknown native error codes to IFC-ERR-016 rejected', () => {
    const result = httpStatusToResult(500, { code: 'INTERNAL_STACK_TRACE', message: 'sensitive detail' })
    expect(result).toEqual({
      kind: 'rejected',
      error: { code: 'IFC-ERR-016', message: ERROR_MESSAGES['IFC-ERR-016'] },
    })
  })

  it('013 and 014 never result in rejected or completed', () => {
    const r13 = httpStatusToResult(202, { code: 'IFC-ERR-013' })
    const r14 = httpStatusToResult(202, { code: 'IFC-ERR-014', data: { taskId: 't1', status: 'processing' } })
    expect(r13.kind).not.toBe('rejected')
    expect(r13.kind).not.toBe('completed')
    expect(r14.kind).not.toBe('rejected')
    expect(r14.kind).not.toBe('completed')
  })

  it('covers all 17 error codes through httpStatusToResult', () => {
    const statuses: Record<string, number> = {
      'IFC-ERR-001': 401, 'IFC-ERR-002': 403, 'IFC-ERR-003': 403,
      'IFC-ERR-004': 403, 'IFC-ERR-005': 422, 'IFC-ERR-006': 422,
      'IFC-ERR-007': 409, 'IFC-ERR-008': 409, 'IFC-ERR-009': 409,
      'IFC-ERR-010': 409, 'IFC-ERR-011': 429, 'IFC-ERR-012': 503,
      'IFC-ERR-013': 202, 'IFC-ERR-014': 202, 'IFC-ERR-015': 404,
      'IFC-ERR-016': 500, 'IFC-ERR-017': 400,
    }
    const kinds = new Set<string>()
    for (const code of ERROR_CODES) {
      const status = statuses[code] || 400
      const body: Record<string, unknown> = { code }
      if (code === 'IFC-ERR-014') body.data = { taskId: 't1', status: 'processing' }
      const result = httpStatusToResult(status, body)
      kinds.add(result.kind)
      expect(result).toBeDefined()
    }
    expect(kinds.has('rejected')).toBe(true)
    expect(kinds.has('external_uncertain')).toBe(true)
    expect(kinds.has('accepted')).toBe(true)
    expect(kinds.has('concurrency_conflict')).toBe(true)
    expect(kinds.has('dependency_unavailable')).toBe(true)
  })

  it('202 且 body 无错误码也缺 taskId：返回 rejected（协议异常，不作为 accepted 误用空 taskId）', () => {
    const result = expectKind(httpStatusToResult(202, {}), 'rejected')
    expect(result.error.code).toBe('IFC-ERR-016')
  })

  it('202 含错误码 IFC-ERR-014 但缺 taskId：同样返回 rejected（不允许轮询一个空 taskId）', () => {
    const result = expectKind(httpStatusToResult(202, { code: 'IFC-ERR-014', data: {} }), 'rejected')
    expect(result.error.code).toBe('IFC-ERR-016')
  })

  it('202 含 taskId 但 status 缺省时仍以 processing 占位', () => {
    const result = httpStatusToResult(202, { code: 'IFC-ERR-014', data: { taskId: 'task-1' } })
    expect(result).toEqual({ kind: 'accepted', data: { taskId: 'task-1', status: 'processing' } })
  })

  it('concurrency_conflict 缺 currentData 时该字段为 undefined', () => {
    const result = expectKind(httpStatusToResult(409, { code: 'IFC-ERR-008', message: '冲突' }), 'concurrency_conflict')
    expect(result.currentData).toBeUndefined()
  })
})

describe('errorCodeOf', () => {
  it('从四类错误结果中提取已知错误码', () => {
    expect(errorCodeOf({ kind: 'rejected', error: { code: 'IFC-ERR-005', message: 'x' } })).toBe('IFC-ERR-005')
    expect(errorCodeOf({ kind: 'concurrency_conflict', error: { code: 'IFC-ERR-008', message: 'x' }, currentData: {} })).toBe('IFC-ERR-008')
    expect(errorCodeOf({ kind: 'external_uncertain', error: { code: 'IFC-ERR-013', message: 'x' } })).toBe('IFC-ERR-013')
    expect(errorCodeOf({ kind: 'dependency_unavailable', error: { code: 'IFC-ERR-012', message: 'x' } })).toBe('IFC-ERR-012')
  })

  it('未知错误码回退 IFC-ERR-016', () => {
    expect(errorCodeOf({ kind: 'rejected', error: { code: 'MYSTERY', message: 'x' } })).toBe('IFC-ERR-016')
  })

  it('completed / accepted 无错误码，统一回退 IFC-ERR-016', () => {
    expect(errorCodeOf({ kind: 'completed', data: {} })).toBe('IFC-ERR-016')
    expect(errorCodeOf({ kind: 'accepted', data: { taskId: 't1', status: 'processing' } })).toBe('IFC-ERR-016')
  })
})
