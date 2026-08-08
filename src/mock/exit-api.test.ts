/**
 * 成员退出/移除 API 层回归（P1/P2 修复）：
 * - mark_exit 与 remove 按 action 分支，语义/通知/职位处置不同
 * - 成员自视角 GET exit 可访问（普通成员 view-self），canWithdraw 仅 under_review
 * - 主动退出申请受 allowSelfExit 配置约束
 * - 退出审批仅社团负责人/人事（canManageMembersFull），部门负责人 403
 */
import { describe, expect, it, beforeEach } from 'vitest'
import handlers from './index'
import { resolveMockUser, clearMockSession } from './auth'
import { resetRecruitmentDB, resetNotifications, resetCorrections, resetDb, resetOrgDb, resetGovernance } from './reset'
import * as db from './db'
import { sysNotifications } from './notifications'

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

function invokeHandler(urlPattern: string, method: string, reqUrl: string, body?: unknown): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const handler = handlers.find((h) => h.url === urlPattern && h.method === method)
  if (!handler?.rawResponse) throw new Error(`handler 未找到: ${method} ${urlPattern}`)
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

function pushActiveMember(id: string, name: string): string {
  db.members.push({
    id, clubId: 'club-001', studentId: '20' + id, name,
    email: id + '@example.edu.cn', phone: '13800000000',
    status: 'active', joinedAt: '2024-09-01T00:00:00+08:00', exitedAt: null,
    positions: [{ id: 'pos-' + id, departmentId: 'dept-001', departmentName: '技术部', title: '干事', startDate: '2024-09-01', endDate: null, plannedEndDate: null, status: 'active' }],
    tenures: [], departmentHistory: [], anomalies: [],
  })
  return id
}

/** 通过 /api/auth/reauth 获取当前 mock 用户的重认证 proof（P1-011 高风险命令门禁） */
async function reauthAs(user: string): Promise<string> {
  resolveMockUser('/api/auth/session?_mock_user=' + user)
  const out = await invokeHandler('/api/auth/reauth', 'post', '/api/auth/reauth?_mock_user=' + user, {})
  expect(out.statusCode).toBe(200)
  return (out.body.data as unknown as { proof: string }).proof
}

describe('成员退出/移除 API（action 分支 + 权限口径）', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
    resetNotifications()
    resetCorrections()
    resetDb()
    resetOrgDb()
    resetGovernance()
  })

  it('mark_exit：软退出——仅记 exitedAt，保留职位档案，不产生「被移出」通知', async () => {
    const memId = pushActiveMember('mem-ap-01', '标记退出人')
    resolveMockUser('/api/auth/session?_mock_user=leader')
    const out = await invokeHandler('/api/org/:clubId/members/exit', 'post', '/api/org/club-001/members/exit', {
      input: { memberId: memId, action: 'mark_exit', reason: '主动退出' },
    })
    expect(out.statusCode).toBe(200)
    const data = out.body.data as { memberId: string; action: string; status: string }
    expect(data).toMatchObject({ memberId: memId, action: 'mark_exit', status: 'exited' })
    const member = db.findMember('club-001', memId)!
    expect(member.exitedAt).toBeTruthy()
    // 职位档案保留（未结束）
    expect(member.positions.every((p) => p.status === 'active')).toBe(true)
    // 无「被移出」通知
    const uid = db.resolveMemberId('user-member-001', 'club-001') // 占位，实际 mark_exit 不通知任何人
    expect(uid).toBeDefined()
    expect(sysNotifications.filter((n) => n.body.includes('被移出'))).toHaveLength(0)
  })

  it('remove：硬移除——P1-011 缺 proof 被 401；带 proof + 原因 → 结束职位 + 通知「被移出」', async () => {
    // mem-002 映射到 user-interviewer-001，可收到站内通知；leader 有移除权限
    resolveMockUser('/api/auth/session?_mock_user=leader')
    // 缺 proof → 401（member_remove 高风险命令门禁）
    const noProof = await invokeHandler('/api/org/:clubId/members/exit', 'post', '/api/org/club-001/members/exit', {
      input: { memberId: 'mem-002', action: 'remove', reason: '违规移除该成员' },
    })
    expect(noProof.statusCode).toBe(401)

    const before = sysNotifications.length
    const proof = await reauthAs('leader')
    const out = await invokeHandler('/api/org/:clubId/members/exit', 'post', '/api/org/club-001/members/exit', {
      input: { memberId: 'mem-002', action: 'remove', reason: '违规移除该成员', reauthProof: proof },
    })
    expect(out.statusCode).toBe(200)
    const member = db.findMember('club-001', 'mem-002')!
    expect(member.status).toBe('exited')
    expect(member.positions.every((p) => p.status !== 'active')).toBe(true)
    expect(sysNotifications.length).toBeGreaterThan(before)
    expect(sysNotifications.some((n) => n.body.includes('被移出'))).toBe(true)
  })

  it('mark_exit：软退出免重认证门禁（非高风险），无 proof 亦成功', async () => {
    resolveMockUser('/api/auth/session?_mock_user=leader')
    const out = await invokeHandler('/api/org/:clubId/members/exit', 'post', '/api/org/club-001/members/exit', {
      input: { memberId: 'mem-002', action: 'mark_exit', reason: '主动退出' },
    })
    expect(out.statusCode).toBe(200)
    const data = out.body.data as { memberId: string; action: string; status: string }
    expect(data).toMatchObject({ memberId: 'mem-002', action: 'mark_exit' })
    const member = db.findMember('club-001', 'mem-002')!
    expect(member.status).toBe('exited')
  })

  it('普通成员（view-self）可访问成员退出 GET，且 canWithdraw 仅 under_review', async () => {
    resolveMockUser('/api/auth/session?_mock_user=member')
    const out = await invokeHandler('/api/org/:clubId/members/exit', 'get', '/api/org/club-001/members/exit')
    expect(out.statusCode).toBe(200)
    const data = out.body.data as { items: unknown[]; exitRequestsWithFlags: { status: string; canWithdraw: boolean; canConfirm: boolean }[] }
    // 自视角：仅本人信息
    expect(data.items).toHaveLength(1)
    expect((data.items[0] as { id: string }).id).toBe('mem-001')
    // 种子 exit-req-002（mem-001 under_review）可撤回；approved 态 canWithdraw=false
    const underReview = data.exitRequestsWithFlags.find((r) => r.status === 'under_review')
    expect(underReview?.canWithdraw).toBe(true)
    for (const r of data.exitRequestsWithFlags) {
      if (r.status !== 'under_review') expect(r.canWithdraw).toBe(false)
    }
  })

  it('部门负责人对退出申请 decide 403（canManageMembersFull 口径）', async () => {
    resolveMockUser('/api/auth/session?_mock_user=deptleader')
    const out = await invokeHandler('/api/org/:clubId/members/exit-requests/:requestId/decide', 'post', '/api/org/club-001/members/exit-requests/exit-req-001/decide', {
      input: { decision: 'approve' },
    })
    expect(out.statusCode).toBe(403)
  })

  it('allowSelfExit=false 时主动退出申请被拒（422）', async () => {
    // 关闭平台配置 allowSelfExit（需 admin），再以成员视角发起
    resolveMockUser('/api/auth/session?_mock_user=admin')
    const cfg = await invokeHandler('/api/admin/config', 'post', '/api/admin/config', { input: { allowSelfExit: false } })
    expect(cfg.statusCode).toBe(200)
    resolveMockUser('/api/auth/session?_mock_user=member')
    const out = await invokeHandler('/api/org/:clubId/members/exit-requests', 'post', '/api/org/club-001/members/exit-requests', {
      input: { reason: '毕业' },
    })
    expect(out.statusCode).toBe(422)
    expect((out.body as { message: string }).message).toMatch(/不允许成员自行退出/)
  })
})
