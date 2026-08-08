import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  autoAdvanceAllJointDeadlines,
  autoAdvanceJointDeadlines,
  createJointActivity,
  daysFromNow,
  jointActivities,
  pauseJointChannel,
  publishJointActivity,
  resumeJointChannel,
} from './db-recruitment'
import type { JointActivity } from './db-recruitment'

/**
 * P1-007 期限自动推进 + channelOpenedAt 审计修复回归用例
 * 覆盖：到期自动关通道 / 未发邀请到期收尾 / 批量统计口径 / 发布自动开窗维护 window / 暂停-恢复顺延
 */

/** 创建一个已发布、通道 open、且能直接操作的联合活动，便于精确控制 deadline */
function makeOpenJoint(): JointActivity {
  const r = createJointActivity('club-001', '计算机协会', '测试员', {
    title: '审计回归测试活动',
    clubIds: ['club-001', 'club-002'],
    confirmDeadline: daysFromNow(1),
  })
  if (!r.ok || !r.data) throw new Error('创建联合活动失败')
  const ja = r.data
  // 让全部拟参与社团 accepted 并进入 confirmed，满足发布前置
  for (const c of ja.clubs) c.status = 'accepted'
  ja.status = 'confirmed'
  const pub = publishJointActivity(ja.id)
  if (!pub.ok) throw new Error(`发布失败: ${pub.error}`)
  return ja
}

function removeTestActivity(ja: JointActivity): void {
  const idx = jointActivities.findIndex((j) => j.id === ja.id)
  if (idx >= 0) jointActivities.splice(idx, 1)
}

describe('autoAdvanceJointDeadlines（P1-007）', () => {
  let ja: JointActivity

  beforeEach(() => {
    ja = makeOpenJoint()
  })

  afterEach(() => {
    vi.useRealTimers()
    removeTestActivity(ja)
  })

  it('open 通道到期后自动关闭通道，并返回 changed=true', () => {
    ja.channelStatus = 'open'
    ja.deadline = new Date(Date.now() - 60_000).toISOString()
    const r = autoAdvanceJointDeadlines(ja.id)
    expect(r.ok).toBe(true)
    expect(r.changed).toBe(true)
    expect(ja.channelStatus).toBe('closed')
  })

  it('未到期的 open 通道不会被误关闭', () => {
    ja.channelStatus = 'open'
    ja.deadline = daysFromNow(5)
    const r = autoAdvanceJointDeadlines(ja.id)
    expect(r.ok).toBe(true)
    expect(r.changed).toBe(false)
    expect(ja.channelStatus).toBe('open')
  })

  it('published 且从未发邀请的活动到期后直接收尾（deadline_expired），不误用 all_invites_final', () => {
    ja.status = 'published'
    ja.firstInviteAt = null
    ja.deadline = new Date(Date.now() - 60_000).toISOString()
    const r = autoAdvanceJointDeadlines(ja.id)
    expect(r.ok).toBe(true)
    expect(r.changed).toBe(true)
    expect(ja.status).toBe('closed')
    expect(ja.closedAt).toBeTruthy()
  })

  it('已发邀请的 published 活动到期后不得被直接推进为 closed（避免跳过邀请/结束确认）', () => {
    ja.status = 'published'
    ja.firstInviteAt = new Date().toISOString()
    ja.channelStatus = 'closed' // 通道已关，隔离出仅活动状态分支
    ja.deadline = new Date(Date.now() - 60_000).toISOString()
    const r = autoAdvanceJointDeadlines(ja.id)
    expect(r.ok).toBe(true)
    expect(r.changed).toBe(false)
    expect(ja.status).toBe('published')
  })

  it('批量推进按实际发生变更统计（channel 到期 + 未发邀请活动到期各自计入）', () => {
    // 用假时钟保证两次创建得到不同的 id（id 依赖 Date.now）
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-07T00:00:00Z'))
    // 活动 A：open 通道到期
    ja.channelStatus = 'open'
    ja.deadline = new Date(Date.now() - 60_000).toISOString()
    // 活动 B：published 未发邀请到期（错开毫秒生成不同 id）
    vi.advanceTimersByTime(2)
    const ja2 = makeOpenJoint()
    ja2.status = 'published'
    ja2.firstInviteAt = null
    ja2.channelStatus = 'closed' // 通道已关，避免双口径干扰
    ja2.deadline = new Date(Date.now() - 60_000).toISOString()
    try {
      const n = autoAdvanceAllJointDeadlines()
      expect(n).toBeGreaterThanOrEqual(2)
      expect(ja.channelStatus).toBe('closed')
      expect(ja2.status).toBe('closed')
    } finally {
      removeTestActivity(ja2)
      vi.useRealTimers()
    }
  })
})

describe('publishJointActivity 自动开放通道（JNT-029 window 维护）', () => {
  it('首次公布自动 not_open→open 并同步递增 window', () => {
    const r = createJointActivity('club-001', '计算机协会', '测试员', {
      title: 'window 维护测试',
      clubIds: ['club-001', 'club-002'],
      confirmDeadline: daysFromNow(1),
    })
    if (!r.ok || !r.data) throw new Error('创建失败')
    const ja = r.data
    try {
      const seqBefore = ja.window.seq
      const deadlineBefore = ja.deadline
      for (const c of ja.clubs) c.status = 'accepted'
      ja.status = 'confirmed'
      const pub = publishJointActivity(ja.id)
      expect(pub.ok).toBe(true)
      expect(ja.channelStatus).toBe('open')
      expect(ja.window.seq).toBe(seqBefore + 1)
      expect(ja.window.deadline).toBe(deadlineBefore)
      expect(ja.channelOpenedAt).toBeTruthy()
      expect(ja.publishedAt).toBeTruthy()
    } finally {
      removeTestActivity(ja)
    }
  })
})

describe('pauseJointChannel / resumeJointChannel 截止顺延语义', () => {
  it('恢复时未传新截止则按暂停时长顺延 deadline（对齐 resumeActivity）', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-07T00:00:00Z'))
    const ja = makeOpenJoint()
    try {
      ja.channelStatus = 'open'
      ja.deadline = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString()
      const deadlineBefore = new Date(ja.deadline).getTime()

      const p = pauseJointChannel(ja.id)
      expect(p.ok).toBe(true)
      expect(ja.channelStatus).toBe('paused')
      expect(ja.pauseStartAt).toBeTruthy()

      // 暂停 2 天后恢复，不传新截止
      vi.advanceTimersByTime(2 * 24 * 3600 * 1000)
      const r = resumeJointChannel(ja.id, '')
      expect(r.ok).toBe(true)
      expect(ja.channelStatus).toBe('open')
      expect(ja.pauseStartAt).toBeNull()
      expect(new Date(ja.deadline).getTime()).toBe(deadlineBefore + 2 * 24 * 3600 * 1000)
      expect(ja.window.seq).toBeGreaterThan(1)
    } finally {
      removeTestActivity(ja)
      vi.useRealTimers()
    }
  })

  it('恢复时传入新截止则采用新截止并清空暂停起点', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-07T00:00:00Z'))
    const ja = makeOpenJoint()
    try {
      ja.channelStatus = 'open'
      ja.deadline = daysFromNow(10)
      pauseJointChannel(ja.id)
      vi.advanceTimersByTime(3600 * 1000)
      const newDeadline = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString()
      const r = resumeJointChannel(ja.id, newDeadline)
      expect(r.ok).toBe(true)
      expect(ja.deadline).toBe(newDeadline)
      expect(ja.pauseStartAt).toBeNull()
    } finally {
      removeTestActivity(ja)
      vi.useRealTimers()
    }
  })
})
