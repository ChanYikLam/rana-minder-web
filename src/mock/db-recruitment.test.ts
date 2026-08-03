import { describe, expect, it } from 'vitest'

import { saveJointApplicationDraft, submitJointApplication, createJointInvitation, interviewerTimeConflict, bookInterview, tightenRecruitmentRules, applyAdjustmentTimeouts, resolveAdjustment, submitApplication, recruitmentApplications, submitReview, cancelRound, recruitmentReviews } from './db-recruitment'
/** PRD-OPT-013：明确面试官任务硬冲突检测 */
describe('面试官任务冲突检测', () => {
  const act = 'act-001'
  const round = 'rd-001'
  const slot = 'slot-001'

  it('同一面试官在同一时段已有任务时判定冲突', () => {
    const first = bookInterview(act, 'u-008', round, slot, '', true, ['u-002'])
    expect(first.ok).toBe(true)
    const t = first.data!
    const direct = interviewerTimeConflict('u-002', t.startAt, t.endAt)
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
    const r = resolveAdjustment('act-001', 'u-002', 'not_qualified', '不满足收紧后的学院条件')
    expect(r.ok).toBe(true)
    expect(r.data?.status).toBe('not_qualified')
    expect(r.data?.notQualifiedReason).toBe('不满足收紧后的学院条件')
  })

  it('窗口有效期内可延长截止（submitted 保持）', () => {
    const r = resolveAdjustment('act-001', 'u-003', 'extend', '申请人需要更多时间调整志愿')
    expect(r.ok).toBe(true)
    expect(r.data?.status).toBe('submitted')
    expect(r.data?.adjustmentDeadline).toBeTruthy()
  })

  it('通道暂停且无补救窗口时拒绝提交', () => {
    const r = submitApplication('act-001', 'u-012', {
      preferences: [{ departmentId: 'dept-001' }],
      allowAdjustment: true,
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('未开放')
  })

  it('无补救窗口的申请不能作出资格不符结论', () => {
    const r = resolveAdjustment('act-001', 'u-011', 'not_qualified', '测试')
    expect(r.ok).toBe(false)
  })
})

describe('评价提交链路（REC-014/015）', () => {
  it('多作者各自独立评价，同一作者修改保留历史', () => {
    const r1 = submitReview('act-001', 'u-004', { comment: '第一作者评语', authorId: 'mem-a', authorName: '作者甲', authorRole: 'club_leader' })
    expect(r1.ok).toBe(true)
    const r2 = submitReview('act-001', 'u-004', { comment: '第二作者评语', authorId: 'mem-b', authorName: '作者乙', authorRole: 'temp_interviewer' })
    expect(r2.ok).toBe(true)
    expect(recruitmentReviews.filter((x) => x.applicantId === 'u-004').length).toBe(2)
    const upd = submitReview('act-001', 'u-004', { comment: '作者甲修改', authorId: 'mem-a', authorName: '作者甲', authorRole: 'club_leader' })
    expect(upd.ok).toBe(true)
    expect(upd.data?.history?.length).toBe(1)
    expect(upd.data?.history?.[0].comment).toBe('第一作者评语')
    expect(upd.data?.comment).toBe('作者甲修改')
  })

  it('轮次关闭后评价被锁定，未关闭轮次可提交', () => {
    const closed = cancelRound('act-001', 'rd-002', '测试关闭轮次')
    expect(closed.ok).toBe(true)
    const locked = submitReview('act-001', 'u-004', { comment: '关闭后评价', authorId: 'mem-c', authorName: '作者丙', authorRole: 'club_leader', roundId: 'rd-002' })
    expect(locked.ok).toBe(false)
    expect(locked.error).toContain('关闭')
    const okOpen = submitReview('act-001', 'u-004', { comment: '未关闭轮次评价', authorId: 'mem-c', authorName: '作者丙', authorRole: 'club_leader', roundId: 'rd-001' })
    expect(okOpen.ok).toBe(true)
  })
})

