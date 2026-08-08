import { describe, expect, it, beforeEach } from 'vitest'
import {
  recruitmentApplications,
  setDeptLabel,
  decidePath,
  setWaitlist,
  publishDepartmentResult,
} from './db-recruitment'
import { assertTransition } from './state-machines/transitions'

/**
 * 种子快照：与 db-recruitment.ts 初始 seed 严格一一对应，用于在测试中精确回滚。
 * 仅覆盖 SM-REC-004 修复需要验证的字段。
 */
type PathSnap = {
  status: string
  decided: 'admit' | 'not_admit' | null
  labelSetBy: string | null
  waitlist: boolean
  holdDeadline: string | null
  publishedAt: string | null
  version: number
}
type AppSnap = { version: number; paths: Record<string, PathSnap> }

const SEED_SNAPSHOTS: Record<string, AppSnap> = {
  'app-001': {
    version: 1,
    paths: {
      'dept-001': { status: 'evaluating', decided: null, labelSetBy: null, waitlist: false, holdDeadline: null, publishedAt: null, version: 1 },
      'dept-003': { status: 'pending', decided: null, labelSetBy: null, waitlist: false, holdDeadline: null, publishedAt: null, version: 1 },
    },
  },
  'app-002': {
    version: 1,
    paths: {
      'dept-002': { status: 'evaluating', decided: null, labelSetBy: null, waitlist: false, holdDeadline: null, publishedAt: null, version: 1 },
    },
  },
  'app-003': {
    version: 1,
    paths: {
      'dept-001': { status: 'waitlist', decided: null, labelSetBy: '李思颖', waitlist: true, holdDeadline: null, publishedAt: null, version: 2 },
    },
  },
  'app-004': {
    version: 1,
    paths: {
      'dept-002': { status: 'published', decided: 'not_admit', labelSetBy: null, waitlist: false, holdDeadline: null, publishedAt: null, version: 2 },
    },
  },
}

function resetSeeds(): void {
  for (const app of recruitmentApplications) {
    const snap = SEED_SNAPSHOTS[app.id]
    if (!snap) continue
    app.version = snap.version
    for (const [deptId, pathSnap] of Object.entries(snap.paths)) {
      const path = app.paths[deptId]
      if (!path) continue
      path.status = pathSnap.status as typeof path.status
      path.decided = pathSnap.decided
      path.labelSetBy = pathSnap.labelSetBy
      path.waitlist = pathSnap.waitlist
      path.holdDeadline = pathSnap.holdDeadline
      path.publishedAt = pathSnap.publishedAt
      path.version = pathSnap.version
    }
  }
}

const findApp = (id: string) => recruitmentApplications.find((a) => a.id === id)!

/** MRM-015 回归：部门路径结论在 db 层未接线
 * 此前 4 个入口（set DeptLabel / decidePath / setWaitlist / publishDepartmentResult）
 * 直接改 path.status 而无任何状态机校验。本组测试断言所有合法转换仍能通过，
 * 所有不在 SM-REC-004 转换表内的转换均被拒并保持原状态。 */
describe('MRM-015 部门路径结论 db 层状态机校验（SM-REC-004）', () => {
  beforeEach(() => {
    resetSeeds()
  })

  it('SM-REC-004 转换表存在并接受所有业务事件名（set_label/decide/waitlist/hold/promote_invite/publish/clear_label/waitlist_off）', () => {
    // 种子路径覆盖 4 个起点：pending/evaluating/decided/waitlist/published
    const checkpoints: Array<[string, string, string]> = [
      ['pending', 'set_label', 'decided'],
      ['pending', 'hold', 'hold'],
      ['pending', 'publish', 'published'],
      ['pending', 'waitlist', 'waitlist'],
      ['evaluating', 'set_label', 'decided'],
      ['evaluating', 'hold', 'hold'],
      ['evaluating', 'decide', 'decided'],
      ['evaluating', 'publish', 'published'],
      ['hold', 'resume', 'evaluating'],
      ['hold', 'set_label', 'decided'],
      ['decided', 'clear_label', 'evaluating'],
      ['decided', 'publish', 'published'],
      ['decided', 'set_label', 'decided'],
      ['waitlist', 'promote_invite', 'published'],
      ['waitlist', 'clear_label', 'waitlist'],
      ['waitlist', 'waitlist_off', 'decided'],
      ['waitlist', 'waitlist_off', 'evaluating'],
      ['published', 'force_close', 'published'],
    ]
    for (const [from, event, to] of checkpoints) {
      const t = assertTransition('SM-REC-004', from, to, event)
      expect(t.ok, `转换 ${from} --${event}--> ${to} 应合法`).toBe(true)
    }
  })

  it('setDeptLabel(true) 合法 evaluating/pending/hold/waitlist→decided；非法 published→decided（保护已发布结论）', () => {
    // evaluating → decided
    expect(findApp('app-001').paths['dept-001'].status).toBe('evaluating')
    const ok1 = setDeptLabel('act-001', 'u-001', 'dept-001', true, 'u-001', 'tester', 'admin', false)
    expect(ok1.ok, JSON.stringify(ok1)).toBe(true)
    expect(findApp('app-001').paths['dept-001'].status).toBe('decided')

    // pending → decided
    expect(findApp('app-001').paths['dept-003'].status).toBe('pending')
    const ok2 = setDeptLabel('act-001', 'u-001', 'dept-003', true, 'u-001', 'tester', 'admin', false)
    expect(ok2.ok, JSON.stringify(ok2)).toBe(true)
    expect(findApp('app-001').paths['dept-003'].status).toBe('decided')

    // published → 拒绝（不再覆盖已发布结论）
    expect(findApp('app-004').paths['dept-002'].status).toBe('published')
    const bad = setDeptLabel('act-001', 'u-004', 'dept-002', true, 'u-004', 'tester', 'admin', false)
    expect(bad.ok).toBe(false)
    expect(findApp('app-004').paths['dept-002'].status).toBe('published')
  })

  it('setDeptLabel(false) 在 decided 起点合法 → evaluating；waitlist 起点合法 → 保持 waitlist', () => {
    // 先打到 decided
    setDeptLabel('act-001', 'u-001', 'dept-001', true, 'u-001', 'tester', 'admin', false)
    const p1 = findApp('app-001').paths['dept-001']
    expect(p1.status).toBe('decided')
    const clear = setDeptLabel('act-001', 'u-001', 'dept-001', false, 'u-001', 'tester', 'admin', false)
    expect(clear.ok, JSON.stringify(clear)).toBe(true)
    expect(p1.status).toBe('evaluating')

    // waitlist 起点 clear → 仍 waitlist
    const p2 = findApp('app-003').paths['dept-001']
    expect(p2.status).toBe('waitlist')
    const clear2 = setDeptLabel('act-001', 'u-003', 'dept-001', false, 'u-003', 'tester', 'admin', false)
    expect(clear2.ok, JSON.stringify(clear2)).toBe(true)
    expect(p2.status).toBe('waitlist')
  })

  it('decidePath(hold) 合法 evaluating→hold；非法：published 不能再 hold（无对应事件）', () => {
    const ok = decidePath('act-001', 'u-001', 'dept-001', 'hold', '2099-12-31T00:00:00.000Z')
    expect(ok.ok, JSON.stringify(ok)).toBe(true)
    expect(findApp('app-001').paths['dept-001'].status).toBe('hold')

    // published 不能再 hold（未在转换表内）
    const bad = decidePath('act-001', 'u-004', 'dept-002', 'hold', '2099-12-31T00:00:00.000Z')
    expect(bad.ok).toBe(false)
    expect(findApp('app-004').paths['dept-002'].status).toBe('published')
  })

  it('decidePath(admit) 合法 evaluating→decided / waitlist→published；非法：published→admit 无对应事件', () => {
    // evaluating → decided
    const a1 = decidePath('act-001', 'u-001', 'dept-001', 'admit')
    expect(a1.ok, JSON.stringify(a1)).toBe(true)
    expect(findApp('app-001').paths['dept-001'].status).toBe('decided')
    expect(findApp('app-001').paths['dept-001'].decided).toBe('admit')

    // waitlist → published
    const a2 = decidePath('act-001', 'u-003', 'dept-001', 'admit')
    expect(a2.ok, JSON.stringify(a2)).toBe(true)
    expect(findApp('app-003').paths['dept-001'].status).toBe('published')

    // published → admit 非法（表内无对应事件）
    const a3 = decidePath('act-001', 'u-004', 'dept-002', 'admit')
    expect(a3.ok).toBe(false)
    expect(findApp('app-004').paths['dept-002'].status).toBe('published')
  })

  it('decidePath(not_admit) 合法 evaluating/decided → published；非法：published→not_admit 已 published 不再被覆盖', () => {
    const d1 = decidePath('act-001', 'u-002', 'dept-002', 'not_admit')
    expect(d1.ok, JSON.stringify(d1)).toBe(true)
    expect(findApp('app-002').paths['dept-002'].status).toBe('published')

    const d2 = decidePath('act-001', 'u-004', 'dept-002', 'not_admit')
    expect(d2.ok).toBe(false)
    expect(findApp('app-004').paths['dept-002'].status).toBe('published')
  })

  it('setWaitlist(true) 合法 evaluating→waitlist；setWaitlist(false) 合法 waitlist→evaluating/decided', () => {
    const on = setWaitlist('act-001', 'u-001', 'dept-001', true)
    expect(on.ok, JSON.stringify(on)).toBe(true)
    expect(findApp('app-001').paths['dept-001'].status).toBe('waitlist')

    // 关 waitlist，decided=null → evaluating
    const off1 = setWaitlist('act-001', 'u-001', 'dept-001', false)
    expect(off1.ok, JSON.stringify(off1)).toBe(true)
    expect(findApp('app-001').paths['dept-001'].status).toBe('evaluating')

    // 已 waitlist（app-003）→ 关
    const off2 = setWaitlist('act-001', 'u-003', 'dept-001', false)
    expect(off2.ok, JSON.stringify(off2)).toBe(true)
    expect(findApp('app-003').paths['dept-001'].status).toBe('evaluating')
  })

  it('setWaitlist(true) 在 published 起点非法：published→waitlist 不在转换表内', () => {
    const bad = setWaitlist('act-001', 'u-004', 'dept-002', true)
    expect(bad.ok).toBe(false)
    expect(findApp('app-004').paths['dept-002'].status).toBe('published')
  })

  it('publishDepartmentResult 合法 decided/waitlist→published；非法 evaluating/hold/pending → 拒绝', () => {
    // evaluating 拒绝
    const p1 = publishDepartmentResult('act-001', 'u-001', 'dept-001', 'tester')
    expect(p1.ok).toBe(false)
    expect(findApp('app-001').paths['dept-001'].status).toBe('evaluating')

    // decided 接受（先打到 decided）
    setDeptLabel('act-001', 'u-001', 'dept-001', true, 'u-001', 'tester', 'admin', false)
    const p2 = publishDepartmentResult('act-001', 'u-001', 'dept-001', 'tester')
    expect(p2.ok, JSON.stringify(p2)).toBe(true)
    expect(findApp('app-001').paths['dept-001'].status).toBe('published')

    // waitlist 接受
    const p3 = publishDepartmentResult('act-001', 'u-003', 'dept-001', 'tester')
    expect(p3.ok, JSON.stringify(p3)).toBe(true)
    expect(findApp('app-003').paths['dept-001'].status).toBe('published')

    // pending 拒绝
    const p4 = publishDepartmentResult('act-001', 'u-001', 'dept-003', 'tester')
    expect(p4.ok).toBe(false)
    expect(findApp('app-001').paths['dept-003'].status).toBe('pending')
  })

  it('非法转换被拒后，path.version 不递增，path.status 保持原值（副作用为零）', () => {
    const p = findApp('app-004').paths['dept-002']
    const before = { version: p.version, status: p.status, decided: p.decided }
    const bad = decidePath('act-001', 'u-004', 'dept-002', 'hold', '2099-12-31T00:00:00.000Z')
    expect(bad.ok).toBe(false)
    expect(p.version).toBe(before.version)
    expect(p.status).toBe(before.status)
    expect(p.decided).toBe(before.decided)
  })
})
