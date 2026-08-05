import { describe, expect, it, beforeEach } from 'vitest'
import { recruitmentApiHandlers, rdb } from './recruitment-api'
import { mockUsers, resolveMockUser, clearMockSession } from './auth'
import { listNotifications, userIdOfApplicant } from './notifications'
import { ensureApplicantProfile, applicantStudentIdOf } from './db-recruitment'
import { resetRecruitmentDB, resetNotifications } from './reset'

/** 最小 ServerResponse 替身（与 recruitment-review.test.ts 同款） */
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

/** 复用真实分发路径（withStatus.rawResponse）：url + body + 最小 req/res 替身 */
function invokeHandler(urlPattern: string, reqUrl: string, body?: unknown): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const handler = recruitmentApiHandlers.find((h) => h.url === urlPattern && h.method === 'post')
  if (!handler?.rawResponse) throw new Error(`handler 未找到: ${urlPattern}`)
  const chunks = body === undefined ? [] : [new TextEncoder().encode(JSON.stringify(body))]
  const req = {
    url: reqUrl,
    headers: {},
    [Symbol.asyncIterator]: () => {
      let i = 0
      return {
        next: () =>
          i < chunks.length
            ? Promise.resolve({ done: false, value: chunks[i++] })
            : Promise.resolve({ done: true, value: undefined }),
      }
    },
  }
  const res = new MockServerResponse()
  return (handler.rawResponse(req, res) as Promise<unknown>).then(() => ({
    statusCode: res.statusCode,
    body: res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {},
  }))
}

/** mockUsers 的 key 是角色名（如 member），其 id 才是 user-member-001；按 id 反查 key */
function mockUserKeyOf(userId: string): string {
  const entry = Object.entries(mockUsers).find(([, u]) => u.id === userId)
  if (!entry) throw new Error(`mock 用户不存在: ${userId}`)
  return entry[0]
}

const MEMBER_KEY = mockUserKeyOf('user-member-001')

// 依赖种子（db-recruitment.ts）：act-001 属 club-001（member 所在社团），act-002 属 club-002；jnt-001 联合活动通道开放
const ownClubUrl = '/api/activity/recruitment/act-001/apply'
const otherClubUrl = '/api/activity/recruitment/act-002/apply'
const applyUrl = '/api/activity/recruitment/:activityId/apply'
const jointDraftUrl = '/api/activity/joint/:jointId/draft'
const jointApplyUrl = '/api/activity/joint/:jointId/apply'

/** 回归：member（非 applicant 角色）提交报名被 403 误拒（bugC2） */
describe('成员提交报名权限链路（member 身份）', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
    resetNotifications()
  })

  it('member 报名其他社团招新成功（200），动态注册申请人档案并落库', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    const out = await invokeHandler(applyUrl, otherClubUrl, {
      formData: {},
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const app = rdb.recruitmentApplications.find((a) => a.activityId === 'act-002' && a.studentId === '20210005')
    expect(app, 'member 申请未落库').toBeTruthy()
    expect(app!.applicantId.startsWith('u-auto-')).toBe(true)
    expect(app!.applicantName).toBe('陈雨桐')
  })

  it('member 报名本社团招新被业务规则拒绝（422，非 403）', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    const out = await invokeHandler(applyUrl, ownClubUrl, {
      formData: {},
      preferences: [{ departmentId: 'dept-001' }],
      allowAdjustment: true,
    })
    expect(out.statusCode).toBe(422)
    expect(String(out.body.message)).toContain('本社团成员无需报名本社团招新')
  })

  it('member 报名成功推送通知到其账号（user-member-001）', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(applyUrl, otherClubUrl, {
      formData: {},
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    const items = listNotifications('user-member-001', false)
    expect(items.some((x) => x.type === 'application' && x.title === '报名申请已提交')).toBe(true)
  })

  it('member 联合报名（草稿 + 提交）成功（200）', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    const draft = await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft')
    expect(draft.statusCode, JSON.stringify(draft.body)).toBe(200)
    const out = await invokeHandler(jointApplyUrl, '/api/activity/joint/jnt-001/apply', {
      consented: true,
      allowJointAdjustment: true,
      volunteerClubIds: ['club-001', 'club-002'],
      answers: {},
    })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const app = rdb.jointApplications.find((a) => a.jointId === 'jnt-001' && a.studentId === '20210005')
    expect(app, 'member 联合申请未落库').toBeTruthy()
  })

  it('动态申请人档案的通知链路：userIdOfApplicant 按学号回退到 member 账号（录取邀请/结论发布同链路）', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(applyUrl, otherClubUrl, {
      formData: {},
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    const app = rdb.recruitmentApplications.find((a) => a.activityId === 'act-002' && a.studentId === '20210005')
    expect(app, 'member 申请未落库').toBeTruthy()
    expect(userIdOfApplicant(app!.applicantId)).toBe('user-member-001')
  })

  it('管理角色（hr）不自动注册为申请人，报名返回 403', async () => {
    const HR_KEY = mockUserKeyOf('user-hr-001')
    resolveMockUser(`/api/auth/session?_mock_user=${HR_KEY}`)
    const out = await invokeHandler(applyUrl, otherClubUrl, {
      formData: {},
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    expect(out.statusCode).toBe(403)
  })

  it('同毫秒注册多个档案 id 不冲突（递增后缀）', () => {
    const a = ensureApplicantProfile('20990001', '甲')
    const b = ensureApplicantProfile('20990002', '乙')
    expect(a).not.toBe(b)
    expect(applicantStudentIdOf(a)).toBe('20990001')
    expect(applicantStudentIdOf(b)).toBe('20990002')
  })

  it('resetRecruitmentDB 清除动态档案，避免跨用例泄漏', () => {
    const id = ensureApplicantProfile('20990003', '丙')
    expect(applicantStudentIdOf(id)).toBe('20990003')
    resetRecruitmentDB()
    expect(applicantStudentIdOf(id)).toBe('')
  })
})
