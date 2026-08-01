/**
 * Mock 层错误码注入开关
 * 通过 URL 参数 ?_mock_error=IFC-ERR-001 或全局开关触发任意错误码
 */

/** 16 类逻辑错误码 */
export const MOCK_ERROR_CODES = [
  'IFC-ERR-001', // 未认证
  'IFC-ERR-002', // 认证已过期
  'IFC-ERR-003', // 无权限
  'IFC-ERR-004', // 资源不存在
  'IFC-ERR-005', // 版本冲突
  'IFC-ERR-006', // 非法状态转换
  'IFC-ERR-007', // 字段校验失败
  'IFC-ERR-008', // 业务规则拒绝
  'IFC-ERR-009', // 幂等重复
  'IFC-ERR-010', // 请求频率超限
  'IFC-ERR-011', // 依赖服务不可用
  'IFC-ERR-012', // 外部服务超时
  'IFC-ERR-013', // 外部结果不确定
  'IFC-ERR-014', // 结果处理中
  'IFC-ERR-015', // 数据脱敏拒绝
  'IFC-ERR-016', // 系统内部错误
] as const

export type MockErrorCode = (typeof MOCK_ERROR_CODES)[number]

/** 错误码对应的安全文案（脱敏，不暴露内部信息） */
export const MOCK_ERROR_MESSAGES: Record<MockErrorCode, string> = {
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

/** 错误码到 HTTP 状态码的映射（mock 层用） */
export const MOCK_ERROR_HTTP: Record<MockErrorCode, number> = {
  'IFC-ERR-001': 401,
  'IFC-ERR-002': 401,
  'IFC-ERR-003': 403,
  'IFC-ERR-004': 404,
  'IFC-ERR-005': 409,
  'IFC-ERR-006': 422,
  'IFC-ERR-007': 422,
  'IFC-ERR-008': 422,
  'IFC-ERR-009': 409,
  'IFC-ERR-010': 429,
  'IFC-ERR-011': 503,
  'IFC-ERR-012': 504,
  'IFC-ERR-013': 202,
  'IFC-ERR-014': 202,
  'IFC-ERR-015': 403,
  'IFC-ERR-016': 500,
}

/** 从 URL 查询参数中解析 mock 错误注入 */
export function resolveMockError(url: string): MockErrorCode | null {
  try {
    const u = new URL(url, 'http://localhost')
    const err = u.searchParams.get('_mock_error')
    if (err && MOCK_ERROR_CODES.includes(err as MockErrorCode)) {
      return err as MockErrorCode
    }
    return null
  } catch {
    return null
  }
}

/** 构造 mock 错误响应体 */
export function mockErrorBody(code: MockErrorCode) {
  return {
    code,
    message: MOCK_ERROR_MESSAGES[code],
    supportId: `MOCK-${Date.now().toString(36).toUpperCase()}`,
  }
}
