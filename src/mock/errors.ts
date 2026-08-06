/**
 * Mock 层错误码注入开关
 * 通过 URL 参数 ?_mock_error=IFC-ERR-001 或全局开关触发任意错误码
 */

/** 17 类逻辑错误码 */
export const MOCK_ERROR_CODES = [
  'IFC-ERR-001', // 未认证
  'IFC-ERR-002', // 高风险操作需要重新认证
  'IFC-ERR-003', // 无权限
  'IFC-ERR-004', // 作用域越界
  'IFC-ERR-005', // 输入不合法
  'IFC-ERR-006', // 前置条件不满足
  'IFC-ERR-007', // 状态冲突
  'IFC-ERR-008', // 版本或影响预览冲突
  'IFC-ERR-009', // 幂等键冲突
  'IFC-ERR-010', // 资源竞争
  'IFC-ERR-011', // 安全限制
  'IFC-ERR-012', // 依赖服务不可用
  'IFC-ERR-013', // 外部结果不确定
  'IFC-ERR-014', // 结果处理中
  'IFC-ERR-015', // 不存在或不可见
  'IFC-ERR-016', // 安全提交失败
  'IFC-ERR-017', // 请求体解析失败
] as const

export type MockErrorCode = (typeof MOCK_ERROR_CODES)[number]

/** 错误码对应的安全文案（脱敏，不暴露内部信息） */
export const MOCK_ERROR_MESSAGES: Record<MockErrorCode, string> = {
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

/** 错误码到 HTTP 状态码的映射（mock 层用） */
export const MOCK_ERROR_HTTP: Record<MockErrorCode, number> = {
  'IFC-ERR-001': 401,
  'IFC-ERR-002': 401,
  'IFC-ERR-003': 403,
  'IFC-ERR-004': 403,
  'IFC-ERR-005': 422,
  'IFC-ERR-006': 422,
  'IFC-ERR-007': 409,
  'IFC-ERR-008': 409,
  'IFC-ERR-009': 409,
  'IFC-ERR-010': 409,
  'IFC-ERR-011': 403,
  'IFC-ERR-012': 503,
  'IFC-ERR-013': 202,
  'IFC-ERR-014': 202,
  'IFC-ERR-015': 404,
  'IFC-ERR-016': 500,
  'IFC-ERR-017': 400,
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
