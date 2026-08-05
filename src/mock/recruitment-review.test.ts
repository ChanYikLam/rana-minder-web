import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { recruitmentApiHandlers, rdb } from './recruitment-api'
import { mockUsers, resolveMockUser, clearMockSession } from './auth'

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

/** mockUsers 的 key 是角色名（如 interviewer），其 id 才是 user-interviewer-001；此处按 id 反查 key，避免硬编码失效 */
function mockUserKeyOf(userId: string): string {
  const entry = Object.entries(mockUsers).find(([, u]) => u.id === userId)
  if (!entry) throw new Error(`mock 用户不存在: ${userId}`)
  return entry[0]
}

const INTERVIEWER_KEY = mockUserKeyOf('user-interviewer-001')
const INTERVIEWER_MEMBER_ID = 'mem-002' // USER_MEMBER_MAP['user-interviewer-001']
const MEMBER_KEY = mockUserKeyOf('user-member-001')

const concludeUrl = '/api/org/:clubId/recruitment/:activityId/reviews/:reviewId/conclude'
const plainUrl = '/api/org/club-001/recruitment/act-001/reviews/rev-001/conclude'

/** 提交评价会真实写入 recruitmentReviews 并 push 活动 reviewIds；beforeEach 快照，afterEach 还原，避免用例间共享状态污染 */
let reviewsSnapshot: unknown[]
let reviewIdsByActivity: Record<string, string[]>
function snapshotDb() {
  reviewsSnapshot = rdb.recruitmentReviews.map((r) => ({ ...r }))
  reviewIdsByActivity = {}
  for (const a of rdb.recruitmentActivities) reviewIdsByActivity[a.id] = [...a.reviewIds]
}
function restoreDb() {
  rdb.recruitmentReviews.splice(0, rdb.recruitmentReviews.length, ...(reviewsSnapshot as typeof rdb.recruitmentReviews))
  for (const a of rdb.recruitmentActivities) {
    const saved = reviewIdsByActivity[a.id]
    if (saved) a.reviewIds.splice(0, a.reviewIds.length, ...saved)
  }
}

/** 回归：bugC1 - 面试官提交评价永远被判无权限（interviewerIds 存 user id，不能拿 memberId 匹配） */
describe('面试官提交评价（conclude）权限链路', () => {
  beforeEach(() => {
    clearMockSession()
    snapshotDb()
  })
  afterEach(() => {
    restoreDb()
  })

  it('面试官（interviewer）对已分配面试的申请人可提交评价（200，且评价归属 mem-002，非 leader 放行）', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${INTERVIEWER_KEY}`)
    const out = await invokeHandler(concludeUrl, plainUrl)
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    expect(out.body.code).toBe(0)
    expect((out.body.data as Record<string, unknown>)?.status).toBe('concluded')
    // 关键守卫：authorId 必须是面试官本人 memberId（mem-002）。若回落成 leader（mem-004）则说明走了 canManageRec 放行、未真正覆盖修复点
    const written = rdb.recruitmentReviews.find((r) => r.activityId === 'act-001' && r.applicantId === 'u-002' && r.authorId === INTERVIEWER_MEMBER_ID)
    expect(written, '评价未按面试官本人 memberId 落库').toBeTruthy()
  })

  it('直接带 _mock_user=interviewer 参数调用（不锚定）同样可提交（200）', async () => {
    const out = await invokeHandler(concludeUrl, `${plainUrl}?_mock_user=${INTERVIEWER_KEY}`)
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    expect(out.body.code).toBe(0)
    const written = rdb.recruitmentReviews.find((r) => r.activityId === 'act-001' && r.applicantId === 'u-002' && r.authorId === INTERVIEWER_MEMBER_ID)
    expect(written, '评价未按面试官本人 memberId 落库').toBeTruthy()
  })

  it('无效 key user-interviewer-001 会回落 leader（authorId 为 mem-004）——证明 key 必须用 interviewer，否则测试走管理放行形同虚设', () => {
    const user = resolveMockUser('/api/auth/session?_mock_user=user-interviewer-001')
    expect(user.id).toBe('user-leader-001')
  })

  it('无面试权限的普通成员提交评价仍被 403（权限边界未放松）', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    const out = await invokeHandler(concludeUrl, plainUrl)
    expect(out.statusCode).toBe(403)
  })
})