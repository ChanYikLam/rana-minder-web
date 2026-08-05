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
function invokeHandler(urlPattern: string, reqUrl: string, body?: unknown, method = 'post'): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const handler = recruitmentApiHandlers.find((h) => h.url === urlPattern && h.method === method)
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

/** 回归：联合报名草稿不可修改、共享报名表缺失（bugC4）——草稿可携带表单内容、可重复保存更新、GET 可恢复，提交携带 answers */
describe('联合报名草稿可修改与共享报名表（bugC4）', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
    resetNotifications()
  })

  it('保存草稿携带表单内容并重复保存更新（200，answers/意愿/部门意向/同意落库）', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    const first = await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', {
      answers: { f1: '自我介绍初稿', f2: '计算机协会' },
      volunteerClubIds: ['club-001'],
      preferences: [{ departmentId: 'dept-001', departmentName: '技术部' }],
      allowJointAdjustment: true,
      consented: true,
    })
    expect(first.statusCode, JSON.stringify(first.body)).toBe(200)
    const second = await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', {
      answers: { f1: '自我介绍修改稿', f2: '计算机协会', f3: '经历补充' },
      volunteerClubIds: ['club-001', 'club-002'],
      preferences: [
        { departmentId: 'dept-002', departmentName: '运营部' },
        { departmentId: 'dept-101', departmentName: '嵌入式组' },
      ],
      allowJointAdjustment: false,
    })
    expect(second.statusCode, JSON.stringify(second.body)).toBe(200)
    const drafts = rdb.jointApplications.filter((a) => a.jointId === 'jnt-001' && a.studentId === '20210005')
    expect(drafts.length).toBe(1)
    const app = drafts[0]
    expect(app.status).toBe('draft')
    expect(app.answers).toEqual({ f1: '自我介绍修改稿', f2: '计算机协会', f3: '经历补充' })
    expect(app.volunteerClubIds).toEqual(['club-001', 'club-002'])
    expect(app.preferences).toEqual([
      { departmentId: 'dept-002', departmentName: '运营部' },
      { departmentId: 'dept-101', departmentName: '嵌入式组' },
    ])
    expect(app.allowJointAdjustment).toBe(false)
    expect(app.consented, '未覆盖的字段应保留上次草稿值').toBe(true)
  })

  it('GET 我的联合申请返回草稿内容，可恢复继续编辑', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', {
      answers: { f1: '草稿内容', f2: '电子设计协会' },
      volunteerClubIds: ['club-002'],
      preferences: [{ departmentId: 'dept-101', departmentName: '嵌入式组' }],
      consented: true,
    })
    const out = await invokeHandler(jointApplyUrl, '/api/activity/joint/jnt-001/apply', undefined, 'get')
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const data = out.body.data as { status: string; answers: Record<string, unknown>; volunteerClubIds: string[]; preferences: { departmentId: string; departmentName: string }[]; consented: boolean }
    expect(data.status).toBe('draft')
    expect(data.answers).toEqual({ f1: '草稿内容', f2: '电子设计协会' })
    expect(data.volunteerClubIds).toEqual(['club-002'])
    expect(data.preferences).toEqual([{ departmentId: 'dept-101', departmentName: '嵌入式组' }])
    expect(data.consented).toBe(true)
  })

  it('共享报名表端点返回字段（无意向部门下拉，type=joint 且 clubId 为空）', async () => {
    const out = await invokeHandler('/api/explore/joint/:id/form', '/api/explore/joint/jnt-001/form', undefined, 'get')
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const data = out.body.data as { type: string; clubId: string | null; versions: { fields: { id: string; type: string; required: boolean; options: string[] | null }[] }[] }
    expect(data.type).toBe('joint')
    expect(data.clubId).toBeNull()
    const fields = data.versions[0].fields
    expect(fields.map((f) => f.id)).toEqual(['f1', 'f3', 'f4'])
    expect(fields.some((f) => f.type === 'select'), '意向部门下拉应移除').toBe(false)
    expect(fields.find((f) => f.id === 'f1')).toMatchObject({ type: 'text', required: true })
    expect(fields.some((f) => f.type === 'file')).toBe(true)
  })

  it('提交联合报名携带表单 answers 与部门意向落库', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft')
    const out = await invokeHandler(jointApplyUrl, '/api/activity/joint/jnt-001/apply', {
      consented: true,
      allowJointAdjustment: true,
      volunteerClubIds: ['club-001'],
      preferences: [
        { departmentId: 'dept-001', departmentName: '技术部' },
        { departmentId: 'dept-002', departmentName: '运营部' },
      ],
      answers: { f1: '最终自我介绍', f2: '计算机协会' },
    })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const app = rdb.jointApplications.find((a) => a.jointId === 'jnt-001' && a.studentId === '20210005')
    expect(app!.answers).toEqual({ f1: '最终自我介绍', f2: '计算机协会' })
    expect(app!.preferences).toEqual([
      { departmentId: 'dept-001', departmentName: '技术部' },
      { departmentId: 'dept-002', departmentName: '运营部' },
    ])
  })

  it('部门意向仅限已选意向社团，联合详情返回各社团部门', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', {
      volunteerClubIds: ['club-002'],
      preferences: [
        { departmentId: 'dept-001', departmentName: '技术部' },
        { departmentId: 'dept-004', departmentName: '人事部' },
        { departmentId: 'dept-102', departmentName: '硬件组' },
      ],
    })
    const app = rdb.jointApplications.find((a) => a.jointId === 'jnt-001' && a.studentId === '20210005')
    expect(app!.preferences, '未选社团的部门与非参与社团部门应被过滤').toEqual([{ departmentId: 'dept-102', departmentName: '硬件组' }])
    const out = await invokeHandler('/api/explore/joint/:id', '/api/explore/joint/jnt-001', undefined, 'get')
    expect(out.statusCode).toBe(200)
    const detail = out.body.data as { clubs: { id: string; name: string; departments: { id: string; name: string }[] }[] }
    expect(detail.clubs[0]).toMatchObject({ id: 'club-001', departments: [{ id: 'dept-001', name: '技术部' }, { id: 'dept-002', name: '运营部' }, { id: 'dept-003', name: '设计部' }] })
    expect(detail.clubs[1]).toMatchObject({ id: 'club-002', departments: [{ id: 'dept-101', name: '嵌入式组' }, { id: 'dept-102', name: '硬件组' }] })
  })

  it('显式提交空意向社团时清空部门意向（区分 undefined 与空数组）', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', {
      volunteerClubIds: ['club-001'],
      preferences: [{ departmentId: 'dept-001', departmentName: '技术部' }],
    })
    const app = rdb.jointApplications.find((a) => a.jointId === 'jnt-001' && a.studentId === '20210005')
    expect(app!.preferences).toEqual([{ departmentId: 'dept-001', departmentName: '技术部' }])
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', {
      volunteerClubIds: [],
      preferences: [{ departmentId: 'dept-001', departmentName: '技术部' }],
    })
    expect(app!.volunteerClubIds, '空数组应清空意向社团而非回退全部').toEqual([])
    expect(app!.preferences, '空意向社团时部门意向应被清空').toEqual([])
  })

  it('草稿清空意向社团后提交仍保持为空（submit 层与 draft 层同语义）', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', {
      volunteerClubIds: ['club-001'],
      preferences: [{ departmentId: 'dept-001', departmentName: '技术部' }],
    })
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', {
      volunteerClubIds: [],
      preferences: [],
    })
    const out = await invokeHandler(jointApplyUrl, '/api/activity/joint/jnt-001/apply', {
      consented: true,
      allowJointAdjustment: false,
      volunteerClubIds: [],
      answers: { f1: '清空意向后的提交' },
    })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const app = rdb.jointApplications.find((a) => a.jointId === 'jnt-001' && a.studentId === '20210005')
    expect(app!.status).toBe('submitted')
    expect(app!.volunteerClubIds, '提交时空数组不应回退为全部参与社团').toEqual([])
    expect(app!.preferences).toEqual([])
  })

  it('部门名称以服务端权威数据为准并按 departmentId 去重', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', {
      volunteerClubIds: ['club-001'],
      preferences: [
        { departmentId: 'dept-001', departmentName: '伪造部门名' },
        { departmentId: 'dept-001', departmentName: '再次伪造' },
        { departmentId: 'dept-002', departmentName: '运营部' },
      ],
    })
    const app = rdb.jointApplications.find((a) => a.jointId === 'jnt-001' && a.studentId === '20210005')
    expect(app!.preferences, '伪造名称应归一化为权威名称且去重').toEqual([
      { departmentId: 'dept-001', departmentName: '技术部' },
      { departmentId: 'dept-002', departmentName: '运营部' },
    ])
  })

  it('草稿 answers 部分提交时合并而非覆盖已有字段', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', {
      answers: { f1: '自我介绍', f3: '相关经历' },
    })
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', {
      answers: { f4: '附件-1' },
    })
    const app = rdb.jointApplications.find((a) => a.jointId === 'jnt-001' && a.studentId === '20210005')
    expect(app!.answers, '部分提交不应覆盖其他字段').toEqual({ f1: '自我介绍', f3: '相关经历', f4: '附件-1' })
  })
})
