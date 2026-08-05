import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { recruitmentApiHandlers, rdb } from './recruitment-api'
import { mockUsers, resolveMockUser, clearMockSession, USER_MEMBER_MAP } from './auth'

/** 最小 ServerResponse 替身：覆盖 mock 层实际调用面（setHeader/statusCode/end），并为常见写接口兜底；mock 层扩展新接口时在此补齐，避免测试静默失联难排查 */
function createFakeRes() {
  const headers = new Map<string, string>()
  const chunks: string[] = []
  let statusCode = 200
  let ended = false
  return {
    get statusCode() { return statusCode },
    set statusCode(v: number) { statusCode = v },
    get statusMessage() { return undefined as string | undefined },
    headers,
    chunks,
    setHeader(name: string, value: string) { headers.set(name, value) },
    getHeader(name: string) { return headers.get(name) },
    removeHeader(name: string) { headers.delete(name) },
    writeHead(code: number) { statusCode = code },
    write(chunk: string) { chunks.push(chunk) },
    flushHeaders() {},
    end(body?: string) {
      if (body !== undefined) chunks.push(body)
      ended = true
    },
    get ended() { return ended },
  }
}

/** 复用真实分发路径（withStatus.rawResponse）：url + 假 req/res */
function invokeHandler(urlPattern: string, reqUrl: string): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const handler = recruitmentApiHandlers.find((h) => h.url === urlPattern && h.method === 'post')
  if (!handler?.rawResponse) throw new Error(`handler 未找到: ${urlPattern}`)
  const req = {
    url: reqUrl,
    headers: {},
    [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ done: true, value: undefined }) }),
  }
  const res = createFakeRes()
  return (handler.rawResponse(req, res) as Promise<unknown>).then(() => ({
    statusCode: res.statusCode,
    body: res.chunks.length ? (JSON.parse(res.chunks.join('')) as Record<string, unknown>) : {},
  }))
}

/** mockUsers 的 key 是角色名（如 interviewer），其 id 才是 user-interviewer-001；此处按 id 反查 key，避免硬编码失效 */
function mockUserKeyOf(userId: string): string {
  const entry = Object.entries(mockUsers).find(([, u]) => u.id === userId)
  if (!entry) throw new Error(`mock 用户不存在: ${userId}`)
  return entry[0]
}

const INTERVIEWER_KEY = mockUserKeyOf('user-interviewer-001')
const INTERVIEWER_MEMBER_ID = USER_MEMBER_MAP['user-interviewer-001']
if (!INTERVIEWER_MEMBER_ID) throw new Error('USER_MEMBER_MAP 缺少面试官成员映射: user-interviewer-001')
const MEMBER_KEY = mockUserKeyOf('user-member-001')

const concludeUrl = '/api/org/:clubId/recruitment/:activityId/reviews/:reviewId/conclude'
/** plainUrl 依赖种子（见 db-recruitment.ts）：recruitmentReviews rev-001（applicantId u-002）←→ recruitmentInterviews int-002（interviewerIds [user-interviewer-001]） */
const plainUrl = '/api/org/club-001/recruitment/act-001/reviews/rev-001/conclude'

/** 提交评价会真实写入 recruitmentReviews 并 push 活动 reviewIds；beforeEach 深拷贝快照（history 数组不共享引用），afterEach 还原，避免用例间共享状态污染 */
let reviewsSnapshot: unknown[]
let reviewIdsByActivity: Record<string, string[]>
function snapshotDb() {
  reviewsSnapshot = rdb.recruitmentReviews.map((r) => structuredClone(r))
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
    expect(USER_MEMBER_MAP[user.id]).toBe('mem-004')
  })

  it('无面试权限的普通成员提交评价仍被 403（权限边界未放松）', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    const out = await invokeHandler(concludeUrl, plainUrl)
    expect(out.statusCode).toBe(403)
  })

  it('面试官对未分配面试的申请人（u-003）提交评价仍被 403（assigned 分支负路径）', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${INTERVIEWER_KEY}`)
    // u-003 无面试记录，需先种一条评价记录，conclude 才能定位到申请人（否则会先 404 而非 403）
    const seeded = rdb.submitReview('act-001', 'u-003', {
      comment: '', rating: 0, authorId: 'mem-004', authorName: '张明远', authorRole: 'club_leader',
    })
    if (!seeded.data) throw new Error('种子评价未写入')
    const out = await invokeHandler(concludeUrl, `/api/org/club-001/recruitment/act-001/reviews/${seeded.data.id}/conclude`)
    expect(out.statusCode, JSON.stringify(out.body)).toBe(403)
    // 关键守卫：403 时评价不得以面试官本人 memberId 落库
    expect(rdb.recruitmentReviews.some((r) => r.activityId === 'act-001' && r.applicantId === 'u-003' && r.authorId === INTERVIEWER_MEMBER_ID)).toBe(false)
  })
})