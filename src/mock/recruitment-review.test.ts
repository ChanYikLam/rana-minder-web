import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { recruitmentApiHandlers, rdb } from './recruitment-api'
import { mockUsers, resolveMockUser, clearMockSession, USER_APPLICANT_MAP } from './auth'
import { resolveMemberId } from './db'

/** 最小 ServerResponse 替身：仅实现分发层（withStatus）当前调用的 setHeader/statusCode/end；mock 层扩展新方法时此处显式报缺，便于定位 */
class MockServerResponse {
  statusCode = 200
  private captured = ''
  setHeader(): void {}
  end(body: string): void {
    this.captured = body
  }
  get body(): string {
    return this.captured
  }
}

/** 复用真实分发路径（withStatus.rawResponse）：url + 最小 req/res 替身 */
function invokeHandler(urlPattern: string, reqUrl: string): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const handler = recruitmentApiHandlers.find((h) => h.url === urlPattern && h.method === 'post')
  if (!handler?.rawResponse) throw new Error(`handler 未找到: ${urlPattern}`)
  const req = {
    url: reqUrl,
    headers: {},
    [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ done: true, value: undefined }) }),
  }
  const res = new MockServerResponse()
  return (handler.rawResponse(req, res) as Promise<unknown>).then(() => ({
    statusCode: res.statusCode,
    body: res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {},
  }))
}

/** mockUsers 的 key 是角色名（如 interviewer），其 id 才是 user-interviewer-001；此处按 id 反查 key，避免硬编码失效 */
function mockUserKeyOf(userId: string): string {
  const entry = Object.entries(mockUsers).find(([, u]) => u.id === userId)
  if (!entry) throw new Error(`mock 用户不存在: ${userId}`)
  return entry[0]
}

const INTERVIEWER_KEY = mockUserKeyOf('user-interviewer-001')
const INTERVIEWER_MEMBER_ID = resolveMemberId('user-interviewer-001', 'club-001')
if (!INTERVIEWER_MEMBER_ID) throw new Error('缺少面试官成员映射: user-interviewer-001 / club-001')
const MEMBER_KEY = mockUserKeyOf('user-member-001')

// 依赖种子（db-recruitment.ts）：rev-001 是 act-001 下申请人 u-002 的已有评价（authorId=mem-004，leader 撰写，见 recruitmentReviews/reviewIds 种子）
const SEED_ACTIVITY_ID = 'act-001'
const SEED_REVIEW_ID = 'rev-001'
const SEED_APPLICANT_ID = USER_APPLICANT_MAP['user-applicant-002']

const concludeUrl = '/api/org/:clubId/recruitment/:activityId/reviews/:reviewId/conclude'
const plainUrl = `/api/org/club-001/recruitment/${SEED_ACTIVITY_ID}/reviews/${SEED_REVIEW_ID}/conclude`

/** 提交评价会真实写入 recruitmentReviews 并 push 活动 reviewIds；beforeEach 深拷贝快照，afterEach 还原，避免用例间共享状态污染 */
let reviewsSnapshot: typeof rdb.recruitmentReviews
let reviewIdsByActivity: Record<string, string[]>
function snapshotDb() {
  reviewsSnapshot = structuredClone(rdb.recruitmentReviews)
  reviewIdsByActivity = {}
  for (const a of rdb.recruitmentActivities) reviewIdsByActivity[a.id] = structuredClone(a.reviewIds)
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
    const written = rdb.recruitmentReviews.find((r) => r.activityId === SEED_ACTIVITY_ID && r.applicantId === SEED_APPLICANT_ID && r.authorId === INTERVIEWER_MEMBER_ID)
    expect(written, '评价未按面试官本人 memberId 落库').toBeTruthy()
  })

  it('直接带 _mock_user=interviewer 参数调用（不锚定）同样可提交（200）', async () => {
    const out = await invokeHandler(concludeUrl, `${plainUrl}?_mock_user=${INTERVIEWER_KEY}`)
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    expect(out.body.code).toBe(0)
    const written = rdb.recruitmentReviews.find((r) => r.activityId === SEED_ACTIVITY_ID && r.applicantId === SEED_APPLICANT_ID && r.authorId === INTERVIEWER_MEMBER_ID)
    expect(written, '评价未按面试官本人 memberId 落库').toBeTruthy()
  })

  it('无效 key user-interviewer-001 会回落 leader（authorId 为 mem-004）——证明 key 必须用 interviewer，否则测试走管理放行形同虚设', () => {
    const user = resolveMockUser('/api/auth/session?_mock_user=user-interviewer-001')
    expect(user.id).toBe('user-leader-001')
    expect(resolveMemberId(user.id, 'club-001')).toBe('mem-004')
  })

  it('无面试权限的普通成员提交评价仍被 403（权限边界未放松）', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    const out = await invokeHandler(concludeUrl, plainUrl)
    expect(out.statusCode).toBe(403)
  })

  it('面试官对未分配面试的申请人（u-003）提交评价仍被 403（assigned 分支负路径）', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${INTERVIEWER_KEY}`)
    // u-003 无面试记录，需先种一条评价记录，conclude 才能定位到申请人（否则会先 404 而非 403）
    const seeded = rdb.submitReview(SEED_ACTIVITY_ID, 'u-003', {
      comment: '', rating: 0, authorId: 'mem-004', authorName: '张明远', authorRole: 'club_leader',
    })
    if (!seeded.data) throw new Error('种子评价未写入')
    const out = await invokeHandler(concludeUrl, `/api/org/club-001/recruitment/${SEED_ACTIVITY_ID}/reviews/${seeded.data.id}/conclude`)
    expect(out.statusCode, JSON.stringify(out.body)).toBe(403)
    // 关键守卫：403 时评价不得以面试官本人 memberId 落库
    expect(rdb.recruitmentReviews.some((r) => r.activityId === SEED_ACTIVITY_ID && r.applicantId === 'u-003' && r.authorId === INTERVIEWER_MEMBER_ID)).toBe(false)
  })
})
