import { beforeEach, describe, expect, it, afterEach, vi } from 'vitest'

import { mockUsers, USER_APPLICANT_MAP } from './auth'
import { saveJointApplicationDraft, submitJointApplication, createJointInvitation, interviewerTimeConflict, bookInterview, tightenRecruitmentRules, applyAdjustmentTimeouts, resolveAdjustment, submitApplication, saveApplicationDraft, closeChannel, recruitmentApplications, submitReview, cancelRound, recruitmentReviews, applicantNameOf, applicantStudentIdOf, markAttendance, requestSupplement, assignInterviewerTask, cancelJointActivity, tasksOfActivity, jointActivities, interviewerTasks, markJointAttendance, bookJointInterview, jointSlots, jointInterviews, jointReviewExtras, upsertJointReviewExtra } from './db-recruitment'
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
/** 已提交申请闸门：submitted 不再经 edit_before_deadline 折返可编辑 */
describe('已提交申请闸门', () => {
  it('已提交申请再次提交被拒，状态不折返 draft', () => {
    const first = submitApplication('act-001', 'u-006', { preferences: [{ departmentId: 'dept-001' }], allowAdjustment: false })
    expect(first.ok).toBe(true)
    const second = submitApplication('act-001', 'u-006', { preferences: [{ departmentId: 'dept-001' }], allowAdjustment: false })
    expect(second.ok).toBe(false)
    expect(second.error).toContain('撤销提交')
    const app = recruitmentApplications.find((a) => a.applicantId === 'u-006')
    expect(app?.status).toBe('submitted')
  })

  it('已提交申请保存草稿被拒，状态不折返 draft', () => {
    const first = submitApplication('act-001', 'u-006', { preferences: [{ departmentId: 'dept-001' }], allowAdjustment: false })
    expect(first.ok).toBe(true)
    const draft = saveApplicationDraft('act-001', 'u-006', { answers: { name: '改个名字' } })
    expect(draft.ok).toBe(false)
    expect(draft.error).toContain('撤销提交')
    const app = recruitmentApplications.find((a) => a.applicantId === 'u-006')
    expect(app?.status).toBe('submitted')
    expect(app?.answers.name).toBeUndefined()
  })

  it('通道关闭时已提交用户重提仍优先命中闸门提示（前置通道校验之前）', () => {
    const first = submitApplication('act-001', 'u-006', { preferences: [{ departmentId: 'dept-001' }], allowAdjustment: false })
    expect(first.ok).toBe(true)
    const closed = closeChannel('act-001', '测试关闭通道')
    expect(closed.ok).toBe(true)
    const second = submitApplication('act-001', 'u-006', { preferences: [{ departmentId: 'dept-001' }], allowAdjustment: false })
    expect(second.ok).toBe(false)
    expect(second.error).toContain('撤销提交')
  })

  it('收紧暂停通道后窗口内已提交用户重提仍可走 rule_tightening（闸门不拦截窗口内用户）', () => {
    const first = submitApplication('act-001', 'u-006', { preferences: [{ departmentId: 'dept-001' }], allowAdjustment: false })
    expect(first.ok).toBe(true)
    tightenRecruitmentRules('act-001', '学院范围收紧为信息学院', 7)
    const re = submitApplication('act-001', 'u-006', { preferences: [{ departmentId: 'dept-001' }], allowAdjustment: true })
    expect(re.ok, re.error || '').toBe(true)
    expect(re.data?.status).toBe('submitted')
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

describe('联合评价提交链路（JNT-012 覆盖写保留修改历史）', () => {
  it('种子记录 history 初始化为空数组，修改时追加旧值且保留原版本号', () => {
    const seed = jointReviewExtras.find((e) => e.jointId === 'jnt-001' && e.applicantId === 'u-006' && e.clubId === 'club-002')!
    expect(seed.history).toEqual([])
    const extra = upsertJointReviewExtra('jnt-001', 'u-006', 'club-002', {
      rating: 5, comment: '修改后评语', authorName: '林晓峰', authorRole: 'club_leader',
    })
    expect(extra.history.length).toBe(1)
    expect(extra.history[0]).toMatchObject({ rating: 4, comment: '编程基础扎实，沟通表达清晰，建议优先考虑。', version: 1 })
    expect(extra.history[0].updatedAt).toBeTruthy()
    expect(extra.version).toBe(2)
    expect(extra.rating).toBe(5)
    expect(extra.comment).toBe('修改后评语')
  })

  it('首次新建记录初始化 history: []，且不写入历史', () => {
    const extra = upsertJointReviewExtra('jnt-001', 'u-001', 'club-003', {
      rating: 3, comment: '初次评价', authorName: '王教练', authorRole: 'club_leader',
    })
    expect(extra.history).toEqual([])
    expect(extra.version).toBe(1)
    expect(jointReviewExtras.some((e) => e.jointId === 'jnt-001' && e.applicantId === 'u-001' && e.clubId === 'club-003')).toBe(true)
  })

  it('多次修改累积多轮 history，按时间顺序保留每次旧值', () => {
    upsertJointReviewExtra('jnt-001', 'u-006', 'club-002', {
      rating: 2, comment: '第一次修改', authorName: '林晓峰', authorRole: 'club_leader',
    })
    const extra = upsertJointReviewExtra('jnt-001', 'u-006', 'club-002', {
      rating: 1, comment: '第二次修改', authorName: '林晓峰', authorRole: 'club_leader',
    })
    expect(extra.history.length).toBe(2)
    expect(extra.history[0].comment).toBe('编程基础扎实，沟通表达清晰，建议优先考虑。')
    expect(extra.history[0].version).toBe(1)
    expect(extra.history[1].comment).toBe('第一次修改')
    expect(extra.history[1].version).toBe(2)
    expect(extra.version).toBe(3)
  })

  it('MRM-021：history 条目的 updatedAt 记录本次修改时间，而非复用旧 concludedAt', () => {
    vi.useFakeTimers()
    try {
      const seed = jointReviewExtras.find((e) => e.jointId === 'jnt-001' && e.applicantId === 'u-006' && e.clubId === 'club-002')!
      const oldConcludedAt = seed.concludedAt
      const extra = upsertJointReviewExtra('jnt-001', 'u-006', 'club-002', {
        rating: 5, comment: '修改评语', authorName: '林晓峰', authorRole: 'club_leader',
      })
      expect(extra.history.length).toBe(1)
      // 旧值的时间字段保留为旧的 concludedAt（评价当时），而 updatedAt 是本次修改发生的时间
      expect(extra.history[0].concludedAt).toBe(oldConcludedAt)
      expect(extra.history[0].updatedAt).toBeTruthy()
      expect(extra.history[0].updatedAt).not.toBe(oldConcludedAt)
      // 时间推进后再次修改：新 history 条目 updatedAt 为修改时刻，区别于上一条的 concludedAt
      vi.setSystemTime(new Date(new Date(extra.history[0].concludedAt!).getTime() + 60_000))
      const extra2 = upsertJointReviewExtra('jnt-001', 'u-006', 'club-002', {
        rating: 4, comment: '再次修改', authorName: '林晓峰', authorRole: 'club_leader',
      })
      expect(extra2.history.length).toBe(2)
      expect(extra2.history[1].updatedAt).not.toBe(extra2.history[1].concludedAt)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('状态机事件名对齐（SM-REC-003/SM-REC-005）', () => {
  it('请假/迟到/缺席后重排走 rearrange 事件（而非 reschedule）', () => {
    const first = bookInterview('act-001', 'u-008', 'rd-001', 'slot-001', '', true, [])
    expect(first.ok).toBe(true)
    const marked = markAttendance(first.data!.id, 'leave', true)
    expect(marked.ok).toBe(true)
    expect(marked.data?.slotId).toBeNull()
    expect(marked.data?.startAt).toBeNull()
    expect(marked.data?.endAt).toBeNull()
    const rearranged = bookInterview('act-001', 'u-008', 'rd-001', 'slot-002', '', true, [])
    expect(rearranged.ok, rearranged.error || '').toBe(true)
    expect(rearranged.data?.status).toBe('scheduled')
  })

  it('联合请假清空旧时段引用，重排后容量不重复占用', () => {
    const slot = jointSlots.find((s) => s.id === 'jslot-001')!
    const it = jointInterviews.find((i) => i.id === 'jint-001')!
    const before = slot.taken
    const leave = markJointAttendance('jnt-001', it.applicantId, 'leave')
    expect(leave.ok).toBe(true)
    expect(it.slotId).toBeNull()
    expect(it.startAt).toBeNull()
    expect(it.endAt).toBeNull()
    expect(jointSlots.find((s) => s.id === 'jslot-001')!.taken).toBe(Math.max(0, before - 1))
    const rebook = bookJointInterview('jnt-001', it.applicantId, 'jslot-001', true)
    expect(rebook.ok, rebook.error || '').toBe(true)
    expect(jointSlots.find((s) => s.id === 'jslot-001')!.taken).toBe(Math.max(0, before))
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

