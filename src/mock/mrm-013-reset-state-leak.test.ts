import { describe, expect, it, beforeEach } from 'vitest'
import {
  APPLICANT_PROFILES,
  ensureApplicantProfile,
  applicantNameOf,
  assignInterviewerTask,
  interviewerTasks,
  // 导出被测标识：任务序号/档案序号是否真正归位
} from './db-recruitment'
import {
  syncPositionMembership,
  getGroupDetail,
  groupSyncTraces,
  listGroups,
  clubAccesses,
} from './db-organization'
import { cloneForm, listForms } from './db-forms'
import { resetRecruitmentDB, resetOrgDb } from './reset'

/**
 * MRM-013 回归：模拟「写入用例中断后重跑」场景——
 * 用例 A 产生动态状态（成员名/职位 Group/失败留痕/面试官任务/动态档案），
 * 不做任何手工清理；resetRecruitmentDB / resetOrgDb 必须将其全部还原到种子，
 * 保证随后用例 B 的断言不残留 A 的副作用。
 */
describe('MRM-013 reset 补齐模块级可变状态重置（回归）', () => {
  beforeEach(() => {
    resetRecruitmentDB()
    resetOrgDb()
  })

  it('recruitment 域：动态档案/面试官任务/自增序号随 resetRecruitmentDB 还原', () => {
    // —— 污染阶段（模拟中断写入用例）——
    const dynId = ensureApplicantProfile('20990001', '回归甲')
    expect(dynId).toMatch(/^u-auto-/)
    expect(Object.keys(APPLICANT_PROFILES)).toContain(dynId)
    // 已有种子档案也被改写（招生确认失败重试场景会临时改 studentId）
    APPLICANT_PROFILES['u-002'] = { name: '陈雨桐', studentId: '' }
    // 面试官任务：活动级（act-001）与轮次级（jnt-001）各一
    const a = assignInterviewerTask({ clubId: 'club-001', activityId: 'act-001', kind: 'recruitment', scope: 'activity', userId: 'user-member-002', userName: '陈雨桐' })
    const b = assignInterviewerTask({ clubId: 'club-001', activityId: 'jnt-001', kind: 'joint', scope: 'round', roundId: 'rd-001', userId: 'user-member-002', userName: '陈雨桐' })
    expect(a.ok && b.ok).toBe(true)
    expect(interviewerTasks).toHaveLength(2)
    expect(interviewerTasks.map((t) => t.id)).toEqual(['itask-1', 'itask-2'])

    // —— reset 后（模拟重跑）——
    resetRecruitmentDB()

    // 动态档案与种子改写全部还原
    expect(Object.keys(APPLICANT_PROFILES)).not.toContain(dynId)
    expect(applicantNameOf('u-002')).toBe('陈雨桐')
    expect(APPLICANT_PROFILES['u-002']).toEqual({ name: '陈雨桐', studentId: '20240002' })
    // 任务清空、序号归位（重跑首条任务 id 回到 itask-1，不会 id 膨胀）
    expect(interviewerTasks).toHaveLength(0)
    const again = assignInterviewerTask({ clubId: 'club-001', activityId: 'act-001', kind: 'recruitment', scope: 'activity', userId: 'user-member-002', userName: '陈雨桐' })
    expect(again.ok && again.data!.id).toBe('itask-1')
  })

  it('organization 域：动态成员名/运行时职位 Group/失败留痕/序号随 resetOrgDb 还原', () => {
    // —— 污染阶段 ——
    // ① 动态成员名（syncPositionMembership 写入）
    syncPositionMembership({ clubId: 'club-001', memberId: 'mem-005', memberName: '刘子豪', departmentName: '技术部', title: '干事', active: true })
    // ② 运行时新建的职位 Group（grp-pos-*）
    const detail = getGroupDetail('grp-dept-001')!
    const pos = detail.positions.find((p) => p.name === '干事')
    expect(pos).toBeTruthy()
    // ③ 失败留痕
    syncPositionMembership({ clubId: 'club-ghost', memberId: 'mem-001', memberName: 'x', departmentName: null, title: '干事', active: true })
    expect(groupSyncTraces.length).toBeGreaterThan(0)

    // —— reset 后 ——
    resetOrgDb()

    // 运行时职位 Group 被截断清理
    const after = getGroupDetail('grp-dept-001')!
    expect(after.positions.some((p) => p.name === '干事')).toBe(false)
    expect(getGroupDetail('grp-dept-001')!.positions).toHaveLength(0)
    expect(clubAccesses).toHaveLength(5) // club-001..005，无运行时新增
    // 失败留痕清空
    expect(groupSyncTraces).toHaveLength(0)
    // 序号归位：重跑同一任命，新建职位 Group 的 id 回到 grp-pos-1（而非 grp-pos-N 膨胀）
    const before = listGroups().length
    const again = syncPositionMembership({ clubId: 'club-001', memberId: 'mem-005', memberName: '刘子豪', departmentName: '技术部', title: '干事', active: true })
    expect(again.ok && again.groupId).toBe('grp-pos-1')
    // reset 前 groups 已被截断回种子（无 grp-pos-* 残留），重建后仅比种子多 1
    expect(listGroups().length).toBe(before + 1)
  })

  it('forms 域：克隆序号（formSeq）随 resetRecruitmentDB 归位，克隆 id 不膨胀', () => {
    // —— 污染阶段 ——
    const f1 = cloneForm('form-001', '招新报名表 2026')
    const f2 = cloneForm('form-001', '招新报名表 2027')
    expect(f1.ok && f2.ok).toBe(true)
    // reset 前克隆 id 携带递增序号（formSeq=1、2）
    expect(f1.ok && f1.data.id).toMatch(/.+1$/)
    expect(f2.ok && f2.data.id).toMatch(/.+2$/)

    // —— reset 后（模拟重跑）——
    resetRecruitmentDB()

    // 克隆出的草稿被还原（formDefinitions 回到种子）
    const club = listForms('club-001')
    expect(club.ok).toBe(true)
    expect(club.ok && club.data.items.some((i) => i.id === (f1.ok ? f1.data!.id : ''))).toBe(false)
    // 序号归位：重跑首个克隆 id 的序号回到 1，而非继续膨胀到 3+
    const again = cloneForm('form-001', '招新报名表 2028')
    expect(again.ok && again.data.id).toMatch(/.+1$/)
  })
})
