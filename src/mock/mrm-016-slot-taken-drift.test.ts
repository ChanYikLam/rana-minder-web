import { describe, expect, it, beforeEach } from 'vitest'
import {
  recruitmentActivities,
  recruitmentInterviews,
  recruitmentApplications,
  jointInterviews,
  jointActivities,
  jointSlots,
  withdrawApplication,
  invalidateInterview,
  cancelActivity,
  forceCompleteActivity,
  publishNotQualified,
  cancelJointActivity,
  forceCloseJointActivity,
  saveApplicationDraft,
  submitApplication,
  bookInterview,
  markIdentityAnomaly,
} from './db-recruitment'

/**
 * 种子快照：仅覆盖 MRM-016 slot.taken 漂移修复需要回滚的字段。
 */
type InterviewSnap = {
  status: string
  slotId: string | null
  version: number
}
type SlotSnap = { taken: number }
type AppSnap = { status: string; version: number }
type JointIntSnap = { status: string; slotId: string | null; version: number }
type JointActSnap = {
  status: string
  cancelConfirmRound: number
  cancelConfirmations: Record<string, string>
  cancelConfirmDeadline: string | null
  channelStatus: string
  firstInviteAt: string | null
  version: number
}
type ActSnap = {
  status: string
  channelStatus: string
  cancelledAt: string | null
  completedAt: string | null
}

const SEED_INTERVIEWS: Record<string, InterviewSnap> = {
  'int-001': { status: 'scheduled', slotId: 'slot-001', version: 1 },
  'int-002': { status: 'completed', slotId: 'slot-001', version: 2 },
}

const SEED_SLOTS: Record<string, SlotSnap> = {
  'slot-001': { taken: 12 },
  'slot-002': { taken: 8 },
  'slot-003': { taken: 0 },
}

const SEED_APPS: Record<string, AppSnap> = {
  'app-001': { status: 'submitted', version: 1 },
  'app-002': { status: 'submitted', version: 1 },
  'app-003': { status: 'submitted', version: 1 },
  'app-004': { status: 'submitted', version: 1 },
  'app-005': { status: 'submitted', version: 1 },
}

const SEED_ACTS: Record<string, ActSnap> = {
  'act-001': { status: 'in_progress', channelStatus: 'open', cancelledAt: null, completedAt: null },
}

const SEED_JOINT_INTS: Record<string, JointIntSnap> = {
  'jint-001': { status: 'scheduled', slotId: 'jslot-001', version: 1 },
}

const SEED_JOINT_SLOTS: Record<string, SlotSnap> = {
  'jslot-001': { taken: 1 },
  'jslot-002': { taken: 0 },
}

const SEED_JOINT_ACTS: Record<string, JointActSnap> = {
  'jnt-001': {
    status: 'invite_phase',
    cancelConfirmRound: 0,
    cancelConfirmations: {},
    cancelConfirmDeadline: null,
    channelStatus: 'open',
    firstInviteAt: null,
    version: 1,
  },
}

function resetSeeds(): void {
  for (const it of recruitmentInterviews) {
    const snap = SEED_INTERVIEWS[it.id]
    if (!snap) continue
    it.status = snap.status as typeof it.status
    it.slotId = snap.slotId
    it.version = snap.version
  }
  for (const a of recruitmentActivities) {
    const snap = SEED_ACTS[a.id]
    if (snap) {
      a.status = snap.status as typeof a.status
      a.channelStatus = snap.channelStatus as typeof a.channelStatus
      a.cancelledAt = snap.cancelledAt
      a.completedAt = snap.completedAt
    }
    for (const r of a.rounds) {
      for (const s of r.slots) {
        const snap2 = SEED_SLOTS[s.id]
        if (snap2) s.taken = snap2.taken
      }
    }
  }
  for (const app of recruitmentApplications) {
    const snap = SEED_APPS[app.id]
    if (!snap) continue
    app.status = snap.status as typeof app.status
    app.version = snap.version
  }
  for (const it of jointInterviews) {
    const snap = SEED_JOINT_INTS[it.id]
    if (!snap) continue
    it.status = snap.status as typeof it.status
    it.slotId = snap.slotId
    it.version = snap.version
  }
  for (const s of jointSlots) {
    const snap = SEED_JOINT_SLOTS[s.id]
    if (snap) s.taken = snap.taken
  }
  for (const ja of jointActivities) {
    const snap = SEED_JOINT_ACTS[ja.id]
    if (!snap) continue
    ja.status = snap.status as typeof ja.status
    ja.cancelConfirmRound = snap.cancelConfirmRound
    ja.cancelConfirmations = { ...snap.cancelConfirmations }
    ja.cancelConfirmDeadline = snap.cancelConfirmDeadline
    ja.channelStatus = snap.channelStatus as typeof ja.channelStatus
    ja.firstInviteAt = snap.firstInviteAt
    ja.version = snap.version
  }
}

const findSlot = (slotId: string) => {
  for (const a of recruitmentActivities) {
    for (const r of a.rounds) {
      const s = r.slots.find((x) => x.id === slotId)
      if (s) return s
    }
  }
  return null
}

const findJointSlot = (slotId: string) => jointSlots.find((s) => s.id === slotId) ?? null

const findInterview = (id: string) => recruitmentInterviews.find((i) => i.id === id)!
const findJointInterview = (id: string) => jointInterviews.find((i) => i.id === id)!
const findApp = (id: string) => recruitmentApplications.find((a) => a.id === id)!
void findApp

/** MRM-016 回归：6 处置终态不释放 slot.taken 导致容量计数漂移
 *
 * 此前以下 6 个处置路径把 interview 状态改成 cancelled / invalidated / cancelled_archived
 * 但没有释放 slot.taken，导致该 slot 误报满员，无法被新申请人预约。
 *
 * 受影响的 6 条路径：
 *  1. cancelActivity → 处置终态 cancelled（活动取消）
 *  2. forceCompleteActivity → 处置终态 cancelled（活动强制完成）
 *  3. invalidateInterview → 处置终态 invalidated（单条面试作废）
 *  4. withdrawApplication → 处置终态 cancelled（申请人退出招新）
 *  5. publishNotQualified → 处置终态 cancelled（资格失效）
 *  6. cancelJointActivity / forceCloseJointActivity → 处置终态 cancelled_archived（联合活动取消/强制结束）
 */
describe('MRM-016 处置终态释放 slot.taken（容量计数不漂移）', () => {
  beforeEach(() => {
    resetSeeds()
  })

  it('withdrawApplication → cancelled：应释放 slot.taken', () => {
    const int0 = findInterview('int-001')
    expect(int0.status).toBe('scheduled')
    const slot = findSlot('slot-001')!
    const before = slot.taken

    const r = withdrawApplication('act-001', 'u-001', true)
    expect(r.ok, JSON.stringify(r)).toBe(true)
    expect(findInterview('int-001').status).toBe('cancelled')
    expect(slot.taken, 'slot.taken 应在取消后回退').toBe(before - 1)
  })

  it('invalidateInterview → invalidated：应释放 slot.taken', () => {
    const slot = findSlot('slot-001')!
    const before = slot.taken

    const r = invalidateInterview('int-001', '测试作废')
    expect(r.ok, JSON.stringify(r)).toBe(true)
    expect(findInterview('int-001').status).toBe('invalidated')
    expect(slot.taken, 'slot.taken 应在作废后回退').toBe(before - 1)
  })

  it('cancelActivity → cancelled：应释放所有相关 slot.taken', () => {
    const slot = findSlot('slot-001')!
    const before = slot.taken

    const r = cancelActivity('act-001', '活动取消测试', true)
    expect(r.ok, JSON.stringify(r)).toBe(true)
    expect(findInterview('int-001').status).toBe('cancelled')
    expect(slot.taken, 'slot.taken 应在活动取消后回退').toBe(before - 1)
  })

  it('forceCompleteActivity → cancelled：应释放所有相关 slot.taken', () => {
    const slot = findSlot('slot-001')!
    const before = slot.taken

    const r = forceCompleteActivity('act-001', '强制完成测试')
    expect(r.ok, JSON.stringify(r)).toBe(true)
    expect(findInterview('int-001').status).toBe('cancelled')
    expect(slot.taken, 'slot.taken 应在强制完成后回退').toBe(before - 1)
  })

  it('publishNotQualified → cancelled：应释放相关 slot.taken', () => {
    const slot = findSlot('slot-001')!
    const before = slot.taken
    const markR = markIdentityAnomaly('act-001', 'u-001')
    expect(markR.ok, JSON.stringify(markR)).toBe(true)

    const r = publishNotQualified('act-001', 'u-001', '资格失效测试')
    expect(r.ok, JSON.stringify(r)).toBe(true)
    expect(findInterview('int-001').status).toBe('cancelled')
    expect(slot.taken, 'slot.taken 应在资格失效后回退').toBe(before - 1)
  })

  it('cancelJointActivity → cancelled_archived：应释放 joint slot.taken', () => {
    const ja = jointActivities.find((j) => j.id === 'jnt-001')!
    ja.firstInviteAt = null
    ja.status = 'draft'
    const slot = findJointSlot('jslot-001')!
    const before = slot.taken

    ja.clubs.forEach((c) => {
      cancelJointActivity(ja.id, c.clubId, '测试')
    })
    expect(findJointInterview('jint-001').status).toBe('cancelled_archived')
    expect(slot.taken, 'joint slot.taken 应在联合活动取消后回退').toBe(before - 1)
  })

  it('forceCloseJointActivity → cancelled_archived：应释放 joint slot.taken', () => {
    const slot = findJointSlot('jslot-001')!
    const before = slot.taken

    const r = forceCloseJointActivity('jnt-001', '强制结束测试')
    expect(r.ok, JSON.stringify(r)).toBe(true)
    expect(findJointInterview('jint-001').status).toBe('cancelled_archived')
    expect(slot.taken, 'joint slot.taken 应在强制结束后回退').toBe(before - 1)
  })

  it('场景：填满 slot 取消后，预约不再误报满员（回归主诉）', () => {
    const slot = findSlot('slot-003')!
    const cap = slot.capacity

    const app5 = findApp('app-005')
    app5.status = 'draft'
    app5.preferences = []
    app5.submittedAt = null
    app5.withdrawnAt = null
    app5.version = 1

    const draft = saveApplicationDraft('act-001', 'u-005', {})
    expect(draft.ok, JSON.stringify(draft)).toBe(true)
    const sub = submitApplication('act-001', 'u-005', {
      preferences: [{ departmentId: 'dept-001' }],
      allowAdjustment: true,
    })
    expect(sub.ok, JSON.stringify(sub)).toBe(true)

    slot.taken = cap
    const book = bookInterview('act-001', 'u-005', 'rd-002', 'slot-003', 'u-005', true)
    expect(book.ok, JSON.stringify(book)).toBe(false)
    expect(book.error).toBe('该时段已满员')

    slot.taken = cap - 1
    const book2 = bookInterview('act-001', 'u-005', 'rd-002', 'slot-003', 'u-005', true)
    expect(book2.ok, JSON.stringify(book2)).toBe(true)
  })
})
