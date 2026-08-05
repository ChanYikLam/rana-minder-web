import { describe, expect, it, beforeEach } from 'vitest'
import { recruitmentApiHandlers } from './recruitment-api'
import { resolveMockUser, clearMockSession } from './auth'

/** 复用真实分发路径（withStatus.rawResponse）：url + 假 req/res */
function invokeHandler(urlPattern: string, reqUrl: string): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const handler = recruitmentApiHandlers.find((h) => h.url === urlPattern && h.method === 'post')
  if (!handler?.rawResponse) throw new Error(`handler 未找到: ${urlPattern}`)
  const req = {
    url: reqUrl,
    headers: {},
    [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ done: true, value: undefined }) }),
  }
  let captured = ''
  const res = {
    statusCode: 200,
    setHeader: () => undefined,
    end: (body: string) => {
      captured = body
    },
  }
  return (handler.rawResponse(req, res) as Promise<unknown>).then(() => ({
    statusCode: res.statusCode,
    body: captured ? (JSON.parse(captured) as Record<string, unknown>) : {},
  }))
}

const concludeUrl = '/api/org/:clubId/recruitment/:activityId/reviews/:reviewId/conclude'

/** 回归：bugC1 - 面试官提交评价永远被判无权限（interviewerIds 存 user id，不能拿 memberId 匹配） */
describe('面试官提交评价（conclude）权限链路', () => {
  beforeEach(() => {
    clearMockSession()
  })

  it('面试官（user-interviewer-001）对已分配面试的申请人可提交评价（200，不再 403）', async () => {
    resolveMockUser('/api/auth/session?_mock_user=user-interviewer-001')
    const out = await invokeHandler(concludeUrl, '/api/org/club-001/recruitment/act-001/reviews/rev-001/conclude')
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    expect(out.body.code).toBe(0)
    expect((out.body.data as Record<string, unknown>)?.status).toBe('concluded')
  })

  it('面试官（user-interviewer-001）锚定后不带参请求同样可提交（真实前端调用形态）', async () => {
    resolveMockUser('/api/auth/session?_mock_user=user-interviewer-001')
    const out = await invokeHandler(concludeUrl, '/api/org/club-001/recruitment/act-001/reviews/rev-001/conclude')
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
  })

  it('无面试权限的普通成员提交评价仍被 403（权限边界未放松）', async () => {
    resolveMockUser('/api/auth/session?_mock_user=member')
    const out = await invokeHandler(concludeUrl, '/api/org/club-001/recruitment/act-001/reviews/rev-001/conclude')
    expect(out.statusCode).toBe(403)
  })
})
