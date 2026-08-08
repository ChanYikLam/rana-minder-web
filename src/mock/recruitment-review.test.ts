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
function invokeHandler(urlPattern: string, reqUrl: string, method = 'post'): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const handler = recruitmentApiHandlers.find((h) => h.url === urlPattern && h.method === method)
  if (!handler?.rawResponse) throw new Error(`handler 未找到: ${urlPattern} ${method}`)
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

const concludeUrl = '/api/org/:clubId/recruitment/:activityId/reviews/:applicantId/conclude'
const plainUrl = `/api/org/club-001/recruitment/${SEED_ACTIVITY_ID}/reviews/${SEED_APPLICANT_ID}/conclude`

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
    // 契约按 applicantId 定位，u-003 无需预种评价记录即可进入权限校验
    const out = await invokeHandler(concludeUrl, `/api/org/club-001/recruitment/${SEED_ACTIVITY_ID}/reviews/u-003/conclude`)
    expect(out.statusCode, JSON.stringify(out.body)).toBe(403)
    // 关键守卫：403 时评价不得以面试官本人 memberId 落库
    expect(rdb.recruitmentReviews.some((r) => r.activityId === SEED_ACTIVITY_ID && r.applicantId === 'u-003' && r.authorId === INTERVIEWER_MEMBER_ID)).toBe(false)
  })

  it('未知申请人 id 提交评价返回 404（旧契约 app-xxx 不再可命中评价）', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${INTERVIEWER_KEY}`)
    const out = await invokeHandler(concludeUrl, `/api/org/club-001/recruitment/${SEED_ACTIVITY_ID}/reviews/app-002/conclude`)
    expect(out.statusCode).toBe(404)
  })

  it('首评（无既有评价记录）按 applicantId 可直接提交（200），不再依赖 rev-xxx 种子', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${INTERVIEWER_KEY}`)
    // u-001 无种子评价记录（rev-001 属于 u-002），走新建分支
    const out = await invokeHandler(concludeUrl, `/api/org/club-001/recruitment/${SEED_ACTIVITY_ID}/reviews/u-001/conclude`, 'post')
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const written = rdb.recruitmentReviews.find((r) => r.activityId === SEED_ACTIVITY_ID && r.applicantId === 'u-001' && r.authorId === INTERVIEWER_MEMBER_ID)
    expect(written, '首评未按面试官本人 memberId 落库').toBeTruthy()
  })
})

// ================= 评价列表端点（契约上下文：roundName/interviewAt + reviews[].id） =================

const reviewsListUrl = '/api/org/:clubId/recruitment/:activityId/reviews'
const reviewsListPlainUrl = `/api/org/club-001/recruitment/${SEED_ACTIVITY_ID}/reviews`

describe('评价列表端点（Issue-4.0-1 契约修复）', () => {
  beforeEach(() => {
    clearMockSession()
  })

  it('列表项返回轮次/面试时间上下文，且 reviews[] 含评价主键 id', async () => {
    const leaderKey = mockUserKeyOf('user-leader-001')
    resolveMockUser(`/api/auth/session?_mock_user=${leaderKey}`)
    const out = await invokeHandler(reviewsListUrl, reviewsListPlainUrl, 'get')
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const items = (out.body.data as { items: Array<Record<string, unknown>> }).items
    // 上下文：轮次与面试时间（u-001 对应 int-001/rd-001，已有排期）
    const u1 = items.find((i) => i.applicantId === 'u-001')
    expect(u1, 'u-001 应在列表内').toBeTruthy()
    expect(u1?.roundName).toBe('第一轮')
    expect(u1?.interviewAt).toBeTruthy()
    // 管理视角可查看 u-002 的最新评价（rev-001），且 reviews[] 携带评论主键
    const u2 = items.find((i) => i.applicantId === SEED_APPLICANT_ID)
    const revs = (u2?.reviews as Array<{ id: string; authorName: string }>)
    expect(revs[0]?.id).toBe(SEED_REVIEW_ID)
    expect(revs[0]?.authorName).toBe('张明远')
  })

  it('行 id 为申请 id（app-xxx），applicantId 为申请人标识（u-xxx）——契约两端清晰', async () => {
    const leaderKey = mockUserKeyOf('user-leader-001')
    resolveMockUser(`/api/auth/session?_mock_user=${leaderKey}`)
    const out = await invokeHandler(reviewsListUrl, reviewsListPlainUrl, 'get')
    const items = (out.body.data as { items: Array<Record<string, unknown>> }).items
    const u2 = items.find((i) => i.applicantId === SEED_APPLICANT_ID)
    expect(u2?.id).toBe('app-002')
    expect(u2?.applicantId).toBe('u-002')
  })
})

// ================= 申请详情接口（面试官查看附件/表单答案，bug #83 修复） =================

const appDetailUrl = '/api/org/:clubId/recruitment/:activityId/applications/:applicantId'
const appDetailPlainUrl = `/api/org/club-001/recruitment/${SEED_ACTIVITY_ID}/applications/u-002`

describe('申请详情接口（面试官视角查看表单答案与附件）', () => {
  beforeEach(() => {
    clearMockSession()
  })

  it('面试官可访问申请详情接口（200，不再被 403 拦截），且返回 answers', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${INTERVIEWER_KEY}`)
    const out = await invokeHandler(appDetailUrl, appDetailPlainUrl, 'get')
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    expect(out.body.code).toBe(0)
    expect((out.body.data as Record<string, unknown>)?.applicantId).toBe('u-002')
    expect((out.body.data as Record<string, unknown>)?.answers).toBeDefined()
  })

  it('管理角色（club:recruitment:manage）访问申请详情接口仍正常（200）', async () => {
    const leaderKey = mockUserKeyOf('user-leader-001')
    resolveMockUser(`/api/auth/session?_mock_user=${leaderKey}`)
    const out = await invokeHandler(appDetailUrl, appDetailPlainUrl, 'get')
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
  })

  it('无面试权限的普通成员访问申请详情接口仍被 403（权限边界未放松）', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    const out = await invokeHandler(appDetailUrl, appDetailPlainUrl, 'get')
    expect(out.statusCode).toBe(403)
  })
})
