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

describe('表单版本提交 mock 端点：草稿/提交/my-draft 链路（P1-1/P2-1/P2-2/P3-1/P3-4）', () => {
  beforeEach(() => {
    resetRecruitmentDB()
  })

  it('org draft：保存用户数据落库（ownerId 来自当前登录用户）', () => {
    const out = invoke(
      '/api/org/:clubId/forms/versions/:formId/draft',
      'post',
      '/api/org/club-001/forms/versions/form-001/draft?_mock_user=leader',
      { input: { version: 1, formData: { f1: '热爱编程', f2: '技术部' }, idempotencyKey: 'k-1' } },
    )
    expect(out.code).toBe(0)
    expect((out.data as { status?: string }).status).toBe('draft')
    expect((out.data as { ownerId?: string }).ownerId).toBe('user-leader-001')
  })

  it('org submit：草稿→submitted，幂等同键同内容返回既有记录', () => {
    const first = invoke(
      '/api/org/:clubId/forms/versions/:formId/submit',
      'post',
      '/api/org/club-001/forms/versions/form-001/submit',
      { input: { version: 1, formData: { f1: '内容', f2: '技术部' }, idempotencyKey: 'k-same' } },
    )
    expect(first.code).toBe(0)
    expect((first.data as { status?: string }).status).toBe('submitted')

    const second = invoke(
      '/api/org/:clubId/forms/versions/:formId/submit',
      'post',
      '/api/org/club-001/forms/versions/form-001/submit',
      { input: { version: 1, formData: { f1: '内容', f2: '技术部' }, idempotencyKey: 'k-same' } },
    )
    expect(second.code).toBe(0)
    expect((second.data as { id?: string }).id).toBe((first.data as { id?: string }).id)
  })

  it('P3-1 幂等同键不同内容：返回 409 + IFC-ERR-009', () => {
    invoke(
      '/api/org/:clubId/forms/versions/:formId/submit',
      'post',
      '/api/org/club-001/forms/versions/form-001/submit',
      { input: { version: 1, formData: { f1: '原始' }, idempotencyKey: 'k-conflict' } },
    )
    const conflict = invoke(
      '/api/org/:clubId/forms/versions/:formId/submit',
      'post',
      '/api/org/club-001/forms/versions/form-001/submit',
      { input: { version: 1, formData: { f1: '不同' }, idempotencyKey: 'k-conflict' } },
    )
    expect(conflict.statusCode).toBe(409)
    expect(conflict.body?.code).toBe('IFC-ERR-009')
  })

  it('P2-1 my-draft：保存草稿后可按当前用户读取恢复', () => {
    invoke(
      '/api/org/:clubId/forms/versions/:formId/draft',
      'post',
      '/api/org/club-001/forms/versions/form-001/draft',
      { input: { version: 1, formData: { f1: '草稿内容', f2: '技术部' }, idempotencyKey: 'k-my' } },
    )
    const mine = invoke(
      '/api/org/:clubId/forms/versions/:formId/my-draft',
      'get',
      '/api/org/club-001/forms/versions/form-001/my-draft?version=1',
    )
    expect(mine.code).toBe(0)
    expect((mine.data as { status?: string }).status).toBe('draft')
    expect((mine.data as { data?: Record<string, unknown> }).data).toEqual({ f1: '草稿内容', f2: '技术部' })

    // 其他用户读取不到
    const other = invoke(
      '/api/org/:clubId/forms/versions/:formId/my-draft',
      'get',
      '/api/org/club-001/forms/versions/form-001/my-draft?version=1&_mock_user=hr',
    )
    expect(other.code).toBe(0)
    expect(other.data).toBeNull()
  })

  it('P2-2 admin 端点鉴权：非平台管理员保存草稿/提交返回 403', () => {
    const forbidden = invoke(
      '/api/admin/forms/versions/:formId/draft',
      'post',
      '/api/admin/forms/versions/form-001/draft',
      { input: { version: 1, formData: {}, idempotencyKey: 'k-x' } },
    )
    expect(forbidden.statusCode).toBe(403)
    expect(forbidden.body?.code).toBe('IFC-ERR-003')

    // 平台管理员放行
    const allowed = invoke(
      '/api/admin/forms/versions/:formId/draft',
      'post',
      '/api/admin/forms/versions/form-001/draft?_mock_user=admin',
      { input: { version: 1, formData: { f1: 'x' }, idempotencyKey: 'k-admin' } },
    )
    expect(allowed.code).toBe(0)
  })

  it('P3-4 旧 submissions 端点与新端点走同一 db 函数、同一字段契约（formData 兼容 answers）', () => {
    const out = invoke(
      '/api/org/:clubId/forms/:formId/submissions',
      'post',
      '/api/org/club-001/forms/form-001/submissions',
      { input: { version: 1, formData: { f1: '统一契约', f2: '技术部' }, idempotencyKey: 'k-legacy' } },
    )
    expect(out.code).toBe(0)
    expect((out.data as { status?: string }).status).toBe('submitted')

    // answers 兼容
    const answers = invoke(
      '/api/org/:clubId/forms/:formId/submissions',
      'post',
      '/api/org/club-001/forms/form-001/submissions',
      { input: { version: 1, answers: { f1: '旧字段', f2: '运营部' }, idempotencyKey: 'k-legacy-2' } },
    )
    expect(answers.code).toBe(0)
  })
})
