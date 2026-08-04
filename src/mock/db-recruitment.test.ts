import { beforeEach, describe, expect, it, afterEach } from 'vitest'

import { mockUsers, USER_APPLICANT_MAP } from './auth'
import { saveJointApplicationDraft, submitJointApplication, createJointInvitation, interviewerTimeConflict, bookInterview, tightenRecruitmentRules, applyAdjustmentTimeouts, resolveAdjustment, submitApplication, recruitmentApplications, submitReview, cancelRound, recruitmentReviews, applicantNameOf, applicantStudentIdOf, markAttendance, requestSupplement, assignInterviewerTask, cancelJointActivity, tasksOfActivity, jointActivities, interviewerTasks } from './db-recruitment'
import { resetRecruitmentDB } from './reset'

beforeEach(() => {
  resetRecruitmentDB()
})
/** 身份域（auth.mockUsers）与业务域（db-recruitment APPLICANT_PROFILES）同实体姓名/学号必须一致 */
describe('申请人档案跨域一致性', () => {
  it('USER_APPLICANT_MAP 每个映射的姓名与学号与业务域档案一致', () => {
    for (const [userId, applicantId] of Object.entries(USER_APPLICANT_MAP)) {
      const user = Object.values(mockUsers).find((u) => u.id === userId)
      expect(user, `mockUsers 缺少 ${userId}`).toBeTruthy()
      expect(applicantNameOf(applicantId), `${userId} → ${applicantId} 姓名不一致`).toBe(user!.name)
      expect(applicantStudentIdOf(applicantId), `${userId} → ${applicantId} 学号不一致`).toBe(user!.studentId)
    }
  })
})
/** 申请人档案（u-xxx 域内编号 → 姓名/学号），用于新申请/新面试自动填充 */
describe('申请人档案填充', () => {
  it('按 u-xxx 申请人编号解析姓名与学号', () => {
    expect(applicantNameOf('u-001')).toBe('刘子豪')
    expect(applicantStudentIdOf('u-003')).toBe('20240003')
    expect(applicantNameOf('u-999')).toBe('')
  })

  it('submitApplication 新申请自动填充姓名与学号', () => {
    const result = submitApplication('act-001', 'u-006', { preferences: [{ departmentId: 'dept-001' }], allowAdjustment: false })
    expect(result.ok, result.error || '').toBe(true)
    const app = recruitmentApplications.find((a) => a.applicantId === 'u-006')
    expect(app?.applicantName).toBe('林婉婷')
    expect(app?.studentId).toBe('20240006')
  })
})
/** PRD-OPT-013：明确面试官任务硬冲突检测 */
describe('面试官任务冲突检测', () => {
  const act = 'act-001'
  const round = 'rd-001'
  const slot = 'slot-001'

  it('同一面试官在同一时段已有任务时判定冲突', () => {
    const first = bookInterview(act, 'u-008', round, slot, '', true, ['u-002'])
    expect(first.ok).toBe(true)
    const t = first.data!
    const direct = interviewerTimeConflict('u-002', t.startAt || '', t.endAt || '')
    expect(direct.conflict).toBe(true)
    expect(direct.detail).toContain('面试官')
  })

  it('bookInterview 对面试官冲突直接拒绝（seed 已占用同一时段）', () => {
    const second = bookInterview(act, 'u-009', round, slot, '', true, ['user-interviewer-001'])
    expect(second.ok).toBe(false)
    expect(second.error).toContain('面试官')
  })
})

/** US-JNT-04：未报名社团只有在申请人服从联合调剂时才能发出加入邀请 */
describe('联合邀请类型（意向社团 vs 调剂加入）', () => {
  it('未报名社团且申请人不服从调剂时，拒绝发出加入邀请', () => {
    saveJointApplicationDraft('jnt-001', 'u-003', '王梓涵', '20240003')
    const sub = submitJointApplication('jnt-001', 'u-003', {
      consented: true,
      allowJointAdjustment: false,
      volunteerClubIds: ['club-001'],
    })
    expect(sub.ok).toBe(true)

    const r = createJointInvitation('jnt-001', 'u-003', 'club-002', 7)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('服从联合调剂')
  })

  it('未报名社团且申请人服从调剂时，发出 join 型加入邀请', () => {
    saveJointApplicationDraft('jnt-001', 'u-004', '陈思远', '20240004')
    const sub = submitJointApplication('jnt-001', 'u-004', {
      consented: true,
      allowJointAdjustment: true,
      volunteerClubIds: ['club-001'],
    })
    expect(sub.ok).toBe(true)

    const r = createJointInvitation('jnt-001', 'u-004', 'club-002', 7)
    expect(r.ok).toBe(true)
    expect(r.data?.type).toBe('join')
  })

  it('意向社团发出 admit 型录取邀请', () => {
    saveJointApplicationDraft('jnt-001', 'u-005', '赵梦琪', '20240005')
    const sub = submitJointApplication('jnt-001', 'u-005', {
      consented: true,
      allowJointAdjustment: false,
      volunteerClubIds: ['club-001'],
    })
    expect(sub.ok).toBe(true)

    const r = createJointInvitation('jnt-001', 'u-005', 'club-001', 7)
    expect(r.ok).toBe(true)
    expect(r.data?.type).toBe('admit')
  })
})

describe('规则收紧补救窗口（REC-007/REC-044）', () => {
  /** 每个用例自建前置：收紧规则 → 把指定申请人的补救窗口改为已过期 → 惰性推进 */
  function expireAdjustmentWindow(applicantId: string): void {
    tightenRecruitmentRules('act-001', '学院范围收紧为信息学院', 7)
    const app = recruitmentApplications.find((x) => x.applicantId === applicantId)!
    app.adjustmentDeadline = new Date(Date.now() - 60_000).toISOString()
    applyAdjustmentTimeouts('act-001')
  }

  it('收紧规则暂停通道并为已提交申请开放补救窗口', () => {
    const r = tightenRecruitmentRules('act-001', '学院范围收紧为信息学院', 7)
    expect(r.ok).toBe(true)
    expect(r.data?.affected.length).toBe(5)
    const app = submitApplication('act-001', 'u-001', {
      preferences: [{ departmentId: 'dept-001' }],
      allowAdjustment: true,
    })
    expect(app.ok).toBe(true)
    expect(app.data?.adjustmentDeadline).toBeNull()
  })

  it('补救窗口到期惰性推进为调整逾期，不自动淘汰', () => {
    const app = recruitmentApplications.find((x) => x.id === 'app-002')!
    app.adjustmentDeadline = new Date(Date.now() - 60_000).toISOString()
    applyAdjustmentTimeouts('act-001')
    expect(app.status).toBe('adjustment_overdue')
  })

  it('调整逾期可填写原因作出资格不符结论', () => {
    expireAdjustmentWindow('u-002')
    const r = resolveAdjustment('act-001', 'u-002', 'not_qualified', '不满足收紧后的学院条件')
    expect(r.ok).toBe(true)
    expect(r.data?.status).toBe('not_qualified')
    expect(r.data?.notQualifiedReason).toBe('不满足收紧后的学院条件')
  })

  it('窗口有效期内可延长截止（submitted 保持）', () => {
    tightenRecruitmentRules('act-001', '学院范围收紧为信息学院', 7)
    const r = resolveAdjustment('act-001', 'u-003', 'extend', '申请人需要更多时间调整志愿')
    expect(r.ok).toBe(true)
    expect(r.data?.status).toBe('submitted')
    expect(r.data?.adjustmentDeadline).toBeTruthy()
  })

  it('通道暂停且无补救窗口时拒绝提交', () => {
    tightenRecruitmentRules('act-001', '学院范围收紧为信息学院', 7)
    const r = submitApplication('act-001', 'u-012', {
      preferences: [{ departmentId: 'dept-001' }],
      allowAdjustment: true,
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('未开放')
  })

  it('无补救窗口的申请不能作出资格不符结论', () => {
    const r = resolveAdjustment('act-001', 'u-001', 'not_qualified', '测试')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('无补救窗口')
  })
})

describe('评价提交链路（REC-014/015）', () => {
  it('多作者各自独立评价，同一作者修改保留历史', () => {
    const r1 = submitReview('act-001', 'u-004', { comment: '第一作者评语', rating: 4, authorId: 'mem-a', authorName: '作者甲', authorRole: 'club_leader' })
    expect(r1.ok).toBe(true)
    const r2 = submitReview('act-001', 'u-004', { comment: '第二作者评语', rating: 3, authorId: 'mem-b', authorName: '作者乙', authorRole: 'temp_interviewer' })
    expect(r2.ok).toBe(true)
    expect(recruitmentReviews.filter((x) => x.applicantId === 'u-004').length).toBe(2)
    const upd = submitReview('act-001', 'u-004', { comment: '作者甲修改', rating: 5, authorId: 'mem-a', authorName: '作者甲', authorRole: 'club_leader' })
    expect(upd.ok).toBe(true)
    expect(upd.data?.history?.length).toBe(1)
    expect(upd.data?.history?.[0].comment).toBe('第一作者评语')
    expect(upd.data?.comment).toBe('作者甲修改')
  })

  it('轮次关闭后评价被锁定，未关闭轮次可提交', () => {
    const closed = cancelRound('act-001', 'rd-002', '测试关闭轮次')
    expect(closed.ok).toBe(true)
    const locked = submitReview('act-001', 'u-004', { comment: '关闭后评价', rating: 4, authorId: 'mem-c', authorName: '作者丙', authorRole: 'club_leader', roundId: 'rd-002' })
    expect(locked.ok).toBe(false)
    expect(locked.error).toContain('关闭')
    const okOpen = submitReview('act-001', 'u-004', { comment: '未关闭轮次评价', rating: 4, authorId: 'mem-c', authorName: '作者丙', authorRole: 'club_leader', roundId: 'rd-001' })
    expect(okOpen.ok).toBe(true)
  })
})

describe('状态机事件名对齐（SM-REC-003/SM-REC-005）', () => {
  it('请假/迟到/缺席后重排走 rearrange 事件（而非 reschedule）', () => {
    const first = bookInterview('act-001', 'u-008', 'rd-001', 'slot-001', '', true, [])
    expect(first.ok).toBe(true)
    const marked = markAttendance(first.data!.id, 'leave', true)
    expect(marked.ok).toBe(true)
    const rearranged = bookInterview('act-001', 'u-008', 'rd-001', 'slot-002', '', true, [])
    expect(rearranged.ok, rearranged.error || '').toBe(true)
    expect(rearranged.data?.status).toBe('scheduled')
  })

  it('补充材料请求后重提走 submit_in_window 事件（而非 submit）', () => {
    const req = requestSupplement('act-001', 'u-001', '请补充获奖证明', new Date(Date.now() + 3600_000).toISOString())
    expect(req.ok).toBe(true)
    const app = recruitmentApplications.find((x) => x.id === 'app-001')!
    expect(app.status).toBe('revision_requested')
    const resubmit = submitApplication('act-001', 'u-001', { preferences: [{ departmentId: 'dept-001' }], allowAdjustment: true })
    expect(resubmit.ok, resubmit.error || '').toBe(true)
    expect(resubmit.data?.status).toBe('submitted')
  })
})

describe('临时面试官任务指派（ORG-037 scope 覆盖规则）', () => {
  const created: string[] = []

  function cleanupTasks() {
    for (const id of created) {
      const idx = interviewerTasks.findIndex((t) => t.id === id)
      if (idx >= 0) interviewerTasks.splice(idx, 1)
    }
    created.length = 0
  }

  afterEach(cleanupTasks)

  it('已有活动级任务时，轮次级指派被拒', () => {
    const first = assignInterviewerTask({ clubId: 'club-001', activityId: 'act-001', kind: 'recruitment', scope: 'activity', userId: 'user-member-002', userName: '陈雨桐' })
    expect(first.ok, first.error || '').toBe(true)
    created.push(first.data!.id)
    const dup = assignInterviewerTask({ clubId: 'club-001', activityId: 'act-001', kind: 'recruitment', scope: 'round', roundId: 'rd-001', userId: 'user-member-002', userName: '陈雨桐' })
    expect(dup.ok).toBe(false)
    expect(dup.error).toContain('活动级')
  })

  it('已有轮次级任务时，活动级升级指派允许（覆盖全部轮次）', () => {
    const first = assignInterviewerTask({ clubId: 'club-001', activityId: 'act-001', kind: 'recruitment', scope: 'round', roundId: 'rd-001', userId: 'user-member-002', userName: '陈雨桐' })
    expect(first.ok, first.error || '').toBe(true)
    created.push(first.data!.id)
    const upgrade = assignInterviewerTask({ clubId: 'club-001', activityId: 'act-001', kind: 'recruitment', scope: 'activity', userId: 'user-member-002', userName: '陈雨桐' })
    expect(upgrade.ok, upgrade.error || '').toBe(true)
    created.push(upgrade.data!.id)
  })

  it('同轮次重复轮次级被拒，不同轮次允许并存', () => {
    const first = assignInterviewerTask({ clubId: 'club-001', activityId: 'act-001', kind: 'recruitment', scope: 'round', roundId: 'rd-001', userId: 'user-member-002', userName: '陈雨桐' })
    expect(first.ok, first.error || '').toBe(true)
    created.push(first.data!.id)
    const sameRound = assignInterviewerTask({ clubId: 'club-001', activityId: 'act-001', kind: 'recruitment', scope: 'round', roundId: 'rd-001', userId: 'user-member-002', userName: '陈雨桐' })
    expect(sameRound.ok).toBe(false)
    const otherRound = assignInterviewerTask({ clubId: 'club-001', activityId: 'act-001', kind: 'recruitment', scope: 'round', roundId: 'rd-002', userId: 'user-member-002', userName: '陈雨桐' })
    expect(otherRound.ok, otherRound.error || '').toBe(true)
    created.push(otherRound.data!.id)
  })
})

describe('临时面试官任务失效（ORG-037/JNT-031）', () => {
  it('联合活动全部参与社团确认取消后，临时任务立即失效', () => {
    const task = assignInterviewerTask({ clubId: 'club-001', activityId: 'jnt-001', kind: 'joint', scope: 'activity', userId: 'user-member-002', userName: '陈雨桐' })
    expect(task.ok, task.error || '').toBe(true)
    const ja = jointActivities.find((j) => j.id === 'jnt-001')!
    try {
      ja.status = 'published'
      ja.firstInviteAt = null
      const first = cancelJointActivity('jnt-001', 'club-001', '张明远')
      expect(first.ok, first.error || '').toBe(true)
      expect(tasksOfActivity('jnt-001').find((t) => t.id === task.data!.id)?.status).toBe('active')
      const second = cancelJointActivity('jnt-001', 'club-002', '林晓峰')
      expect(second.ok, second.error || '').toBe(true)
      expect(ja.status).toBe('cancelled')
      expect(tasksOfActivity('jnt-001').find((t) => t.id === task.data!.id)?.status).toBe('expired')
    } finally {
      const idx = interviewerTasks.findIndex((t) => t.id === task.data!.id)
      if (idx >= 0) interviewerTasks.splice(idx, 1)
      ja.status = 'published'
      ja.channelStatus = 'open'
      ja.closedAt = null
      ja.firstInviteAt = null
      ja.cancelConfirmRound = 0
      ja.cancelConfirmDeadline = null
      ja.cancelConfirmations = {}
      ja.version += 1
    }
  })
})

