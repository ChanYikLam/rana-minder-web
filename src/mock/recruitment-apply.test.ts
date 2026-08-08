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

  it('member 对本社团招新保存草稿同样被拒绝（422，与 apply 语义一致）', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    const out = await invokeHandler('/api/activity/recruitment/:activityId/draft', ownClubUrl, {
      formData: { f1: '草稿内容' },
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
      volunteerClubIds: ['club-002'],
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

  it('管理角色（hr）报名其他社团招新成功（200），动态注册申请人档案（Issue-4.0-2）', async () => {
    const HR_KEY = mockUserKeyOf('user-hr-001')
    resolveMockUser(`/api/auth/session?_mock_user=${HR_KEY}`)
    const out = await invokeHandler(applyUrl, otherClubUrl, {
      formData: {},
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const app = rdb.recruitmentApplications.find((a) => a.activityId === 'act-002' && a.studentId === '20210003')
    expect(app, 'hr 报名别的社团未落库').toBeTruthy()
    expect(app!.applicantId.startsWith('u-auto-')).toBe(true)
    expect(app!.applicantName).toBe('李思颖')
  })

  it('管理角色（hr）报名自己任职社团被业务规则拒绝（422，非 403）', async () => {
    const HR_KEY = mockUserKeyOf('user-hr-001')
    resolveMockUser(`/api/auth/session?_mock_user=${HR_KEY}`)
    const out = await invokeHandler(applyUrl, ownClubUrl, {
      formData: {},
      preferences: [{ departmentId: 'dept-001' }],
      allowAdjustment: true,
    })
    expect(out.statusCode).toBe(422)
    expect(String(out.body.message)).toContain('本社团成员无需报名本社团招新')
  })

  it('管理角色（hr）对自己任职社团保存草稿同样被拒绝（422，与 apply 语义一致）', async () => {
    const HR_KEY = mockUserKeyOf('user-hr-001')
    resolveMockUser(`/api/auth/session?_mock_user=${HR_KEY}`)
    const out = await invokeHandler('/api/activity/recruitment/:activityId/draft', ownClubUrl, {
      formData: { f1: '草稿内容' },
    })
    expect(out.statusCode).toBe(422)
    expect(String(out.body.message)).toContain('本社团成员无需报名本社团招新')
  })

  it('面试官（interviewer）报名别的社团招新成功（200），动态注册申请人档案并落库', async () => {
    const INTERVIEWER_KEY = mockUserKeyOf('user-interviewer-001')
    resolveMockUser(`/api/auth/session?_mock_user=${INTERVIEWER_KEY}`)
    const out = await invokeHandler(applyUrl, otherClubUrl, {
      formData: {},
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const app = rdb.recruitmentApplications.find((a) => a.activityId === 'act-002' && a.studentId === '20210004')
    expect(app, 'interviewer 报名别的社团未落库').toBeTruthy()
    expect(app!.applicantId.startsWith('u-auto-')).toBe(true)
  })

  it('多社团管理用户（user-leader-001，club-001 社长 + club-002 hr）报名任一任职社团均被业务规则拒绝（422）', async () => {
    const LEADER_KEY = mockUserKeyOf('user-leader-001')
    resolveMockUser(`/api/auth/session?_mock_user=${LEADER_KEY}`)
    // club-001：roles[0] 为 club_leader（管理角色）→ 按目标社团判断后走 per-club 成员兜底 → 422
    const own = await invokeHandler(applyUrl, ownClubUrl, {
      formData: {},
      preferences: [{ departmentId: 'dept-001' }],
      allowAdjustment: true,
    })
    expect(own.statusCode, JSON.stringify(own.body)).toBe(422)
    expect(String(own.body.message)).toContain('本社团成员无需报名本社团招新')
    // club-002：roles[1] 为 hr（管理角色）→ 按目标社团判断后走 per-club 成员兜底 → 422
    const other = await invokeHandler(applyUrl, otherClubUrl, {
      formData: {},
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    expect(other.statusCode, JSON.stringify(other.body)).toBe(422)
    expect(String(other.body.message)).toContain('本社团成员无需报名本社团招新')
  })

  it('管理角色（hr）联合报名：志愿自己任职社团被业务规则拒绝（422），仅志愿其他社团成功（200）', async () => {
    const HR_KEY = mockUserKeyOf('user-hr-001')
    resolveMockUser(`/api/auth/session?_mock_user=${HR_KEY}`)
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft')
    // 志愿含自己社团（club-001，hr 任职且为成员）→ 422
    const blocked = await invokeHandler(jointApplyUrl, '/api/activity/joint/jnt-001/apply', {
      consented: true,
      allowJointAdjustment: true,
      volunteerClubIds: ['club-001', 'club-002'],
      answers: {},
    })
    expect(blocked.statusCode, JSON.stringify(blocked.body)).toBe(422)
    expect(String(blocked.body.message)).toContain('您已是该社团成员，无需再次志愿')
    // 仅志愿其他社团（club-002）→ 200
    const out = await invokeHandler(jointApplyUrl, '/api/activity/joint/jnt-001/apply', {
      consented: true,
      allowJointAdjustment: true,
      volunteerClubIds: ['club-002'],
      answers: {},
    })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const app = rdb.jointApplications.find((a) => a.jointId === 'jnt-001' && a.studentId === '20210003')
    expect(app, 'hr 联合申请未落库').toBeTruthy()
    expect(app!.volunteerClubIds).toEqual(['club-002'])
  })

  it('管理角色（hr）联合报名不传 volunteerClubIds 时按最终生效志愿集合拦截本社团（422，防绕过）', async () => {
    const HR_KEY = mockUserKeyOf('user-hr-001')
    resolveMockUser(`/api/auth/session?_mock_user=${HR_KEY}`)
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft')
    // 不传 volunteerClubIds：submitJointApplication 会默认志愿全部参与社团（含 club-001）→ 按最终生效集合校验应被拦截
    const out = await invokeHandler(jointApplyUrl, '/api/activity/joint/jnt-001/apply', {
      consented: true,
      allowJointAdjustment: true,
      answers: {},
    })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(422)
    expect(String(out.body.message)).toContain('您已是该社团成员，无需再次志愿')
    // 显式仅志愿其他社团（club-002）仍放行（200）
    const okOut = await invokeHandler(jointApplyUrl, '/api/activity/joint/jnt-001/apply', {
      consented: true,
      allowJointAdjustment: true,
      volunteerClubIds: ['club-002'],
      answers: {},
    })
    expect(okOut.statusCode, JSON.stringify(okOut.body)).toBe(200)
  })

  it('平台管理员（super_admin）作为在校学生亦可报名其他社团招新（200）', async () => {
    const ADMIN_KEY = mockUserKeyOf('user-admin-001')
    resolveMockUser(`/api/auth/session?_mock_user=${ADMIN_KEY}`)
    const out = await invokeHandler(applyUrl, otherClubUrl, {
      formData: {},
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const app = rdb.recruitmentApplications.find((a) => a.activityId === 'act-002' && a.studentId === '20210001')
    expect(app, 'super_admin 申请未落库').toBeTruthy()
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
      volunteerClubIds: ['club-002'],
      preferences: [{ departmentId: 'dept-101', departmentName: '嵌入式组' }],
      allowJointAdjustment: true,
      consented: true,
    })
    expect(first.statusCode, JSON.stringify(first.body)).toBe(200)
    const second = await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', {
      answers: { f1: '自我介绍修改稿', f2: '计算机协会', f3: '经历补充' },
      volunteerClubIds: ['club-002'],
      preferences: [
        { departmentId: 'dept-102', departmentName: '硬件组' },
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
    expect(app.volunteerClubIds).toEqual(['club-002'])
    expect(app.preferences).toEqual([
      { departmentId: 'dept-102', departmentName: '硬件组' },
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
      volunteerClubIds: ['club-002'],
      preferences: [
        { departmentId: 'dept-101', departmentName: '嵌入式组' },
        { departmentId: 'dept-102', departmentName: '硬件组' },
      ],
      answers: { f1: '最终自我介绍', f2: '计算机协会' },
    })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const app = rdb.jointApplications.find((a) => a.jointId === 'jnt-001' && a.studentId === '20210005')
    expect(app!.answers).toEqual({ f1: '最终自我介绍', f2: '计算机协会' })
    expect(app!.preferences).toEqual([
      { departmentId: 'dept-101', departmentName: '嵌入式组' },
      { departmentId: 'dept-102', departmentName: '硬件组' },
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
      volunteerClubIds: ['club-002'],
      preferences: [{ departmentId: 'dept-101', departmentName: '嵌入式组' }],
    })
    const app = rdb.jointApplications.find((a) => a.jointId === 'jnt-001' && a.studentId === '20210005')
    expect(app!.preferences).toEqual([{ departmentId: 'dept-101', departmentName: '嵌入式组' }])
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', {
      volunteerClubIds: [],
      preferences: [{ departmentId: 'dept-101', departmentName: '嵌入式组' }],
    })
    expect(app!.volunteerClubIds, '空数组应清空意向社团而非回退全部').toEqual([])
    expect(app!.preferences, '空意向社团时部门意向应被清空').toEqual([])
  })

  it('草稿清空意向社团后提交仍保持为空（submit 层与 draft 层同语义）', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', {
      volunteerClubIds: ['club-002'],
      preferences: [{ departmentId: 'dept-101', departmentName: '嵌入式组' }],
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

  it('首次进入（无草稿）直接空意向提交：自动创建草稿后提交仍保持空数组', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    // 模拟前端首次进入流程：无草稿 → 自动创建草稿（空 body）→ 提交空意向
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', {})
    const out = await invokeHandler(jointApplyUrl, '/api/activity/joint/jnt-001/apply', {
      consented: true,
      allowJointAdjustment: true,
      volunteerClubIds: [],
      answers: { f1: '首次进入空意向提交' },
    })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const app = rdb.jointApplications.find((a) => a.jointId === 'jnt-001' && a.studentId === '20210005')
    expect(app!.status).toBe('submitted')
    expect(app!.volunteerClubIds, '首次进入空意向提交不应回退为全部参与社团').toEqual([])
    expect(app!.preferences).toEqual([])
  })

  it('部门名称以服务端权威数据为准并按 departmentId 去重', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', {
      volunteerClubIds: ['club-002'],
      preferences: [
        { departmentId: 'dept-101', departmentName: '伪造部门名' },
        { departmentId: 'dept-101', departmentName: '再次伪造' },
        { departmentId: 'dept-102', departmentName: '硬件组' },
      ],
    })
    const app = rdb.jointApplications.find((a) => a.jointId === 'jnt-001' && a.studentId === '20210005')
    expect(app!.preferences, '伪造名称应归一化为权威名称且去重').toEqual([
      { departmentId: 'dept-101', departmentName: '嵌入式组' },
      { departmentId: 'dept-102', departmentName: '硬件组' },
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

  it('先选社团+部门，再清空社团后直接提交：部门意向也被同步清空', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)

    // 先创建草稿：选社团 jnt-club-a 和部门
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', {
      volunteerClubIds: ['jnt-club-a'],
      preferences: [{ departmentId: 'dept-1', departmentName: '技术部' }],
      answers: { f1: 'test' },
    })

    // 清空社团后直接提交空意向，但残留部门意向
    const out = await invokeHandler(jointApplyUrl, '/api/activity/joint/jnt-001/apply', {
      consented: true,
      allowJointAdjustment: true,
      volunteerClubIds: [],
      preferences: [{ departmentId: 'dept-1', departmentName: '技术部' }],
      answers: { f1: '清空社团后提交' },
    })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)

    const app = rdb.jointApplications.find((a) => a.jointId === 'jnt-001' && a.studentId === '20210005')
    expect(app!.volunteerClubIds, '空意向社团').toEqual([])
    // mock 层 filterJointPreferences 会将不属于任何 volunteerClub 的部门过滤掉
    expect(app!.preferences, '部门意向也应被清空').toEqual([])
  })
})

/** 联合报名撤销提交：submitted → draft（通道开放、未安排面试/无审核结论时） */
describe('联合报名撤销提交', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
    resetNotifications()
  })

  const withdrawUrl = '/api/activity/joint/:jointId/withdraw'
  const memberStudentId = '20210005'

  /** member 的 applicantId 由 ensureApplicantProfile 动态分配（非 user-member-001） */
  function memberJointApp() {
    return rdb.jointApplications.find((a) => a.jointId === 'jnt-001' && a.studentId === memberStudentId)!
  }

  it('撤销成功：回到草稿、清空提交时间、清理未排期面试与待审结论，可修改后重新提交', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', {
      volunteerClubIds: ['club-002'],
      answers: { f1: '初版自我介绍', f3: '初版经历' },
    })
    const memberId = memberJointApp().applicantId
    const submit = await invokeHandler(jointApplyUrl, '/api/activity/joint/jnt-001/apply', {
      consented: true,
      allowJointAdjustment: true,
      volunteerClubIds: ['club-002'],
      answers: { f1: '初版自我介绍', f3: '初版经历' },
      preferences: [{ departmentId: 'dept-101', departmentName: '嵌入式组' }],
    })
    expect(submit.statusCode, JSON.stringify(submit.body)).toBe(200)
    expect(rdb.jointInterviews.some((i) => i.jointId === 'jnt-001' && i.applicantId === memberId)).toBe(true)
    expect(rdb.jointConclusions.some((c) => c.jointId === 'jnt-001' && c.applicantId === memberId)).toBe(true)

    const out = await invokeHandler(withdrawUrl, '/api/activity/joint/jnt-001/withdraw', {})
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const app = memberJointApp()
    expect(app.status, '撤销后回到草稿').toBe('draft')
    expect(app.submittedAt, '撤销后清空提交时间').toBeNull()
    expect(app.consented, '撤销后回到未同意态').toBe(false)
    expect(app.consentAt, '撤销后清空同意时间').toBeNull()
    expect(app.agreementVersion, '撤销后清空协议版本').toBeNull()
    expect(app.agreementClubSnapshot, '撤销后清空协议参与社团快照').toEqual([])
    expect(app.volunteerClubSnapshot, '撤销后清空意向社团快照').toEqual([])
    expect(app.answers, '填写内容保留为草稿').toMatchObject({ f1: '初版自我介绍', f3: '初版经历' })
    expect(rdb.jointInterviews.some((i) => i.jointId === 'jnt-001' && i.applicantId === memberId), '未排期面试记录应被清理').toBe(false)
    expect(rdb.jointConclusions.some((c) => c.jointId === 'jnt-001' && c.applicantId === memberId), '待审结论应被清理').toBe(false)

    const resubmit = await invokeHandler(jointApplyUrl, '/api/activity/joint/jnt-001/apply', {
      consented: true,
      allowJointAdjustment: false,
      volunteerClubIds: ['club-002'],
      answers: { f1: '修改后自我介绍', f3: '修改后经历' },
      preferences: [{ departmentId: 'dept-102', departmentName: '硬件组' }],
    })
    expect(resubmit.statusCode, JSON.stringify(resubmit.body)).toBe(200)
    expect(app.status).toBe('submitted')
    expect(app.answers).toMatchObject({ f1: '修改后自我介绍' })
  })

  it('草稿态不可撤销', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', { volunteerClubIds: ['club-002'] })
    const out = await invokeHandler(withdrawUrl, '/api/activity/joint/jnt-001/withdraw', {})
    expect(out.statusCode, JSON.stringify(out.body)).toBe(422)
  })

  it('报名通道关闭时不可撤销', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', { volunteerClubIds: ['club-002'] })
    await invokeHandler(jointApplyUrl, '/api/activity/joint/jnt-001/apply', {
      consented: true,
      allowJointAdjustment: true,
      volunteerClubIds: ['club-002'],
      answers: { f1: '自我介绍' },
    })
    const ja = rdb.jointActivities.find((a) => a.id === 'jnt-001')!
    ja.channelStatus = 'closed'
    const out = await invokeHandler(withdrawUrl, '/api/activity/joint/jnt-001/withdraw', {})
    expect(out.statusCode, JSON.stringify(out.body)).toBe(422)
    expect(memberJointApp().status, '通道关闭时保持已提交').toBe('submitted')
  })

  it('撤销时作废未关联结论的待处理邀请', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', { volunteerClubIds: ['club-002'] })
    await invokeHandler(jointApplyUrl, '/api/activity/joint/jnt-001/apply', {
      consented: true,
      allowJointAdjustment: true,
      volunteerClubIds: ['club-002'],
      answers: { f1: '自我介绍' },
    })
    const applicantId = memberJointApp().applicantId
    rdb.jointInvitations.unshift({
      id: 'jinv-' + Date.now(), jointId: 'jnt-001', clubId: 'club-001', applicantId,
      type: 'join', status: 'pending_acceptance', sentAt: new Date().toISOString(),
      expiredAt: new Date(Date.now() + 86400000).toISOString(), acceptedAt: null,
      reviewFlag: false, frozenRemainingMs: null, casdoorSync: 'none', version: 1,
    })
    const out = await invokeHandler(withdrawUrl, '/api/activity/joint/jnt-001/withdraw', {})
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    expect(memberJointApp().status, '撤销后回到草稿').toBe('draft')
    const inv = rdb.jointInvitations.find((i) => i.applicantId === applicantId)
    expect(inv, '邀请记录保留但作废').toBeTruthy()
    expect(inv!.status, '未关联结论的待处理邀请应被作废').toBe('expired')
  })

  it('已安排面试时不可撤销', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', { volunteerClubIds: ['club-002'] })
    await invokeHandler(jointApplyUrl, '/api/activity/joint/jnt-001/apply', {
      consented: true,
      allowJointAdjustment: true,
      volunteerClubIds: ['club-002'],
      answers: { f1: '自我介绍' },
    })
    const interview = rdb.jointInterviews.find((i) => i.jointId === 'jnt-001' && i.applicantId === memberJointApp().applicantId)!
    interview.status = 'scheduled'
    const out = await invokeHandler(withdrawUrl, '/api/activity/joint/jnt-001/withdraw', {})
    expect(out.statusCode, JSON.stringify(out.body)).toBe(422)
    expect(memberJointApp().status, '已排期面试时保持已提交').toBe('submitted')
  })

  it('活动已结束（closed/cancelled/force_closed）时不可撤销', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(jointDraftUrl, '/api/activity/joint/jnt-001/draft', { volunteerClubIds: ['club-002'] })
    await invokeHandler(jointApplyUrl, '/api/activity/joint/jnt-001/apply', {
      consented: true,
      allowJointAdjustment: true,
      volunteerClubIds: ['club-002'],
      answers: { f1: '自我介绍' },
    })
    const ja = rdb.jointActivities.find((a) => a.id === 'jnt-001')!
    ja.status = 'closed'
    const out = await invokeHandler(withdrawUrl, '/api/activity/joint/jnt-001/withdraw', {})
    expect(out.statusCode, JSON.stringify(out.body)).toBe(422)
    expect(memberJointApp().status, '活动已结束时保持已提交').toBe('submitted')
  })
})

/** 普通招新撤销提交（submitted → draft，与联合报名统一规范） */
describe('普通招新撤销提交', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
    resetNotifications()
  })

  const draftUrl = '/api/activity/recruitment/:activityId/draft'
  const withdrawUrl = '/api/activity/recruitment/:activityId/apply/withdraw'
  const applyUrl = '/api/activity/recruitment/:activityId/apply'
  const memberStudentId = '20210005'

  function app() {
    return rdb.recruitmentApplications.find((a) => a.activityId === 'act-002' && a.studentId === memberStudentId)!
  }

  it('已提交后调用撤销接口回到草稿，内容保留可修改后重新提交', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    const submit = await invokeHandler(applyUrl, otherClubUrl, {
      formData: { f1: '初版自我介绍', f3: '初版经历' },
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    expect(submit.statusCode, JSON.stringify(submit.body)).toBe(200)
    expect(app().status).toBe('submitted')

    const out = await invokeHandler(withdrawUrl, otherClubUrl, {})
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    expect(app().status, '提交后撤销回到草稿').toBe('draft')
    expect(app().answers, '撤销后填写内容保留为草稿').toMatchObject({ f1: '初版自我介绍', f3: '初版经历' })

    const resubmit = await invokeHandler(applyUrl, otherClubUrl, {
      formData: { f1: '修改后自我介绍' },
      preferences: [{ departmentId: 'dept-102' }],
      allowAdjustment: false,
    })
    expect(resubmit.statusCode, JSON.stringify(resubmit.body)).toBe(200)
    expect(app().status, '撤销后可重新提交').toBe('submitted')
    expect(app().answers).toMatchObject({ f1: '修改后自我介绍' })
  })

  it('已提交的申请保存草稿接口返回拒绝（撤销须走独立端点）', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(applyUrl, otherClubUrl, {
      formData: { f1: '自我介绍' },
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    const out = await invokeHandler(draftUrl, otherClubUrl, {})
    expect(out.statusCode, JSON.stringify(out.body)).toBe(422)
    expect(app().status, '草稿接口不再兼任撤销').toBe('submitted')
  })

  it('活动不在报名期时已提交申请不可撤销', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(applyUrl, otherClubUrl, {
      formData: { f1: '自我介绍' },
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    const act = rdb.recruitmentActivities.find((a) => a.id === 'act-002')!
    act.status = 'completed'
    const out = await invokeHandler(withdrawUrl, otherClubUrl, {})
    expect(out.statusCode, JSON.stringify(out.body)).toBe(422)
    expect(app().status, '活动结束后保持已提交').toBe('submitted')
  })

  it('报名通道关闭或已过截止时不可撤销', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(applyUrl, otherClubUrl, {
      formData: { f1: '自我介绍' },
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    const act = rdb.recruitmentActivities.find((a) => a.id === 'act-002')!
    act.channelStatus = 'closed'
    const closed = await invokeHandler(withdrawUrl, otherClubUrl, {})
    expect(closed.statusCode, JSON.stringify(closed.body)).toBe(422)
    expect(app().status, '通道关闭时保持已提交').toBe('submitted')

    act.channelStatus = 'open'
    act.deadline = new Date(Date.now() - 1000).toISOString()
    const expired = await invokeHandler(withdrawUrl, otherClubUrl, {})
    expect(expired.statusCode, JSON.stringify(expired.body)).toBe(422)
    expect(app().status, '已过截止时保持已提交').toBe('submitted')
  })

  it('已排期面试时不可撤销', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(applyUrl, otherClubUrl, {
      formData: { f1: '自我介绍' },
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    const act = rdb.recruitmentActivities.find((a) => a.id === 'act-002')!
    rdb.recruitmentInterviews.push({
      id: 'int-' + Date.now(), activityId: 'act-002', clubId: act.clubId,
      applicantId: app().applicantId, applicantName: app().applicantName, roundId: 'rd-201',
      status: 'scheduled', slotId: 'slot-201', startAt: new Date(Date.now() + 86400000).toISOString(), endAt: new Date(Date.now() + 90000000).toISOString(),
      actualStartAt: null, actualEndAt: null, attendance: 'none', invalidReason: null, skipReason: null, cancelReason: null,
      interviewerIds: [], version: 1,
    })
    const out = await invokeHandler(withdrawUrl, otherClubUrl, {})
    expect(out.statusCode, JSON.stringify(out.body)).toBe(422)
    expect(app().status, '已排期面试时保持已提交').toBe('submitted')
  })

  it('多轮面试并存（pending_selection + scheduled）时不可撤销且排期记录不残留', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(applyUrl, otherClubUrl, {
      formData: { f1: '自我介绍' },
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    const act = rdb.recruitmentActivities.find((a) => a.id === 'act-002')!
    const applicantId = app().applicantId
    rdb.recruitmentInterviews.push({
      id: 'int-101', activityId: 'act-002', clubId: act.clubId,
      applicantId, applicantName: app().applicantName, roundId: 'rd-101',
      status: 'pending_selection', slotId: null, startAt: null, endAt: null,
      actualStartAt: null, actualEndAt: null, attendance: 'none', invalidReason: null, skipReason: null, cancelReason: null,
      interviewerIds: [], version: 1,
    })
    rdb.recruitmentInterviews.push({
      id: 'int-201', activityId: 'act-002', clubId: act.clubId,
      applicantId, applicantName: app().applicantName, roundId: 'rd-201',
      status: 'scheduled', slotId: 'slot-201', startAt: new Date(Date.now() + 86400000).toISOString(), endAt: new Date(Date.now() + 90000000).toISOString(),
      actualStartAt: null, actualEndAt: null, attendance: 'none', invalidReason: null, skipReason: null, cancelReason: null,
      interviewerIds: [], version: 1,
    })
    const out = await invokeHandler(withdrawUrl, otherClubUrl, {})
    expect(out.statusCode, JSON.stringify(out.body)).toBe(422)
    expect(app().status, '多轮并存含排期面试时保持已提交').toBe('submitted')
    expect(rdb.recruitmentInterviews.find((i) => i.id === 'int-201'), '排期记录不得被删除').toBeTruthy()
  })

  it('已有审核结论时不可撤销', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(applyUrl, otherClubUrl, {
      formData: { f1: '自我介绍' },
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    app().paths['dept-101'].status = 'decided'
    const out = await invokeHandler(withdrawUrl, otherClubUrl, {})
    expect(out.statusCode, JSON.stringify(out.body)).toBe(422)
    expect(app().status, '已有审核结论时保持已提交').toBe('submitted')
  })

  it('撤销时清理未排期面试记录与待评估部门路径', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(applyUrl, otherClubUrl, {
      formData: { f1: '自我介绍' },
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    const act = rdb.recruitmentActivities.find((a) => a.id === 'act-002')!
    rdb.recruitmentInterviews.push({
      id: 'int-' + Date.now(), activityId: 'act-002', clubId: act.clubId,
      applicantId: app().applicantId, applicantName: app().applicantName, roundId: 'rd-201',
      status: 'pending_selection', slotId: null, startAt: null, endAt: null,
      actualStartAt: null, actualEndAt: null, attendance: 'none', invalidReason: null, skipReason: null, cancelReason: null,
      interviewerIds: [], version: 1,
    })
    const out = await invokeHandler(withdrawUrl, otherClubUrl, {})
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    expect(app().status).toBe('draft')
    expect(app().paths, '撤销后清空部门路径').toEqual({})
    expect(rdb.recruitmentInterviews.some((i) => i.applicantId === app().applicantId && i.activityId === 'act-002'), '撤销后清理未排期面试记录').toBe(false)
  })

  it('撤销时清理全部轮次的未排期面试记录（多轮并存）', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(applyUrl, otherClubUrl, {
      formData: { f1: '自我介绍' },
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    const act = rdb.recruitmentActivities.find((a) => a.id === 'act-002')!
    const applicantId = app().applicantId
    for (const roundId of ['rd-101', 'rd-201', 'rd-301']) {
      rdb.recruitmentInterviews.push({
        id: 'int-' + roundId, activityId: 'act-002', clubId: act.clubId,
        applicantId, applicantName: app().applicantName, roundId,
        status: 'pending_selection', slotId: null, startAt: null, endAt: null,
        actualStartAt: null, actualEndAt: null, attendance: 'none', invalidReason: null, skipReason: null, cancelReason: null,
        interviewerIds: [], version: 1,
      })
    }
    const out = await invokeHandler(withdrawUrl, otherClubUrl, {})
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    expect(app().status).toBe('draft')
    expect(
      rdb.recruitmentInterviews.some((i) => i.activityId === 'act-002' && i.applicantId === applicantId),
      '全部轮次的未排期面试记录都应被清理',
    ).toBe(false)
  })

  it('提交未传 allowAdjustment 时回退活动默认值', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    const out = await invokeHandler(applyUrl, otherClubUrl, {
      formData: { f1: '自我介绍' },
      preferences: [{ departmentId: 'dept-101' }],
    })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    expect(app().allowAdjustment).toBe(true)
  })

  it('需补充材料（revision_requested）可编辑后重新提交', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(applyUrl, otherClubUrl, {
      formData: { f1: '自我介绍' },
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    const r = rdb.requestSupplement('act-002', app().applicantId, '请补充相关经历', new Date(Date.now() + 86400000).toISOString())
    expect(r.ok).toBe(true)
    expect(app().status).toBe('revision_requested')

    const out = await invokeHandler(applyUrl, otherClubUrl, {
      formData: { f1: '自我介绍', f3: '补充后的经历' },
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    expect(app().status).toBe('submitted')
    expect(app().answers).toMatchObject({ f1: '自我介绍', f3: '补充后的经历' })
  })

  it('退出招新端点（/withdraw）未被撤销端点遮蔽：confirm 后 submitted → exited 并记录退出时间', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(applyUrl, otherClubUrl, {
      formData: { f1: '自我介绍' },
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    expect(app().status).toBe('submitted')

    const exit = await invokeHandler('/api/activity/recruitment/:activityId/withdraw', otherClubUrl, { confirm: true })
    expect(exit.statusCode, JSON.stringify(exit.body)).toBe(200)
    expect(app().status, '退出招新语义保持 exited').toBe('exited')
    expect(app().withdrawnAt, '退出招新记录退出时间').not.toBeNull()
  })

  it('身份异常（identity_anomaly）不可保存草稿、不可重新提交', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
    await invokeHandler(applyUrl, otherClubUrl, {
      formData: { f1: '自我介绍' },
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    const r = rdb.markIdentityAnomaly('act-002', app().applicantId)
    expect(r.ok).toBe(true)
    expect(app().status).toBe('identity_anomaly')

    const draft = await invokeHandler(draftUrl, otherClubUrl, {})
    expect(draft.statusCode, JSON.stringify(draft.body)).toBe(422)
    const submit = await invokeHandler(applyUrl, otherClubUrl, {
      formData: { f1: '伪造内容' },
      preferences: [{ departmentId: 'dept-101' }],
      allowAdjustment: true,
    })
    expect(submit.statusCode, JSON.stringify(submit.body)).toBe(422)
    expect(app().answers, '身份异常时内容不被覆盖').toMatchObject({ f1: '自我介绍' })
  })
})

/** 公开活动详情（explore） */
describe('公开活动详情', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
  })

  it('公开详情返回 allowAdjustmentDefault（报名页调剂开关默认值来源）', async () => {
    const out = await invokeHandler('/api/explore/activities/:id', '/api/explore/activities/act-002', undefined, 'get')
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    expect((out.body.data as Record<string, unknown>)).toMatchObject({ id: 'act-002', allowAdjustmentDefault: true })
  })
})
