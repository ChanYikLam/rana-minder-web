import { describe, expect, it, beforeEach } from 'vitest'
import handlers from './index'
import { resetRecruitmentDB } from './reset'

/** 走 mock 真实分发路径：mergePathParams 已把路径参数并入 query */
function invoke(urlPattern: string, method: string, reqUrl: string, body: unknown = {}): {
  code?: number; data?: unknown; statusCode?: number; body?: { code?: string; message?: string; supportId?: string }
} {
  const handler = handlers.find((h) => h.url === urlPattern && h.method === method)
  if (!handler) throw new Error(`handler 未找到: ${method} ${urlPattern}`)
  const url = new URL(reqUrl, 'http://localhost')
  const query: Record<string, string> = {}
  url.searchParams.forEach((v, k) => { query[k] = v })
  return handler.response({ url: url.pathname + url.search, query, body, headers: {} }) as {
    code?: number; data?: unknown; statusCode?: number; body?: { code?: string; message?: string; supportId?: string }
  }
}

describe('表单 mock 端点：P3-1 版本冲突走 IFC 错误码体系（409 + IFC-ERR-008）', () => {
  beforeEach(() => {
    resetRecruitmentDB()
  })

  it('org save：expectedVersion 冲突返回 409 + IFC-ERR-008（不再使用自定义 FORM-CONFLICT）', () => {
    const out = invoke(
      '/api/org/:clubId/forms/designer/:formId/save',
      'post',
      '/api/org/club-001/forms/designer/form-001/save',
      { input: { fields: [], version: 2, expectedVersion: 99 } },
    )
    expect(out.statusCode).toBe(409)
    expect(out.body?.code).toBe('IFC-ERR-008')
    expect(out.body?.message).toContain('冲突')
    expect(out.body?.supportId).toMatch(/^MOCK-/)
  })

  it('admin save：expectedVersion 冲突返回 409 + IFC-ERR-008', () => {
    const out = invoke(
      '/api/admin/forms/designer/:formId/save',
      'post',
      '/api/admin/forms/designer/form-001/save',
      { input: { fields: [], version: 2, expectedVersion: 99 } },
    )
    expect(out.statusCode).toBe(409)
    expect(out.body?.code).toBe('IFC-ERR-008')
  })

  it('IFC-ERR-008 可被前端 error-map 解析为 concurrency_conflict（语义保留）', async () => {
    const { httpStatusToResult } = await import('../services/error-map')
    const result = httpStatusToResult(409, {
      code: 'IFC-ERR-008',
      message: '版本冲突：表单已被其他操作修改，请刷新后重试',
      supportId: 'MOCK-XYZ',
    })
    expect(result.kind).toBe('concurrency_conflict')
    if (result.kind === 'concurrency_conflict') {
      expect(result.error.message).toContain('版本冲突')
    }
  })
})
