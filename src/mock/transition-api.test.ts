/**
 * ORG-001/017 换届执行同步（API 层）：/api/org/:clubId/members/transition 执行换届时
 * 旧负责人移出负责人职位 Group、新任加入；leaderCandidate 为空（无负责人候选人）的空态分支一并覆盖。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import handlers from './index'
import * as db from './db'
import { resetDb } from './reset'
import { getGroupDetail, clubAccesses } from './db-organization'

/** 走 mock 真实分发路径（mergePathParams 已并入路径参数） */
function invoke(urlPattern: string, method: string, reqUrl: string, body: unknown = {}): {
  code?: number
  data?: { executedAt?: string | null; results?: { memberId: string; name: string; targetTitle: string; success: boolean }[]; syncFailures?: { memberId: string; memberName: string; title: string; active: boolean; error: string }[] }
  statusCode?: number
  body?: { code?: string; message?: string }
} {
  const handler = handlers.find((h) => h.url === urlPattern && h.method === method)
  if (!handler) throw new Error(`handler 未找到: ${method} ${urlPattern}`)
  const url = new URL(reqUrl, 'http://localhost')
  const query: Record<string, string> = {}
  url.searchParams.forEach((v, k) => { query[k] = v })
  return handler.response({ url: url.pathname + url.search, query, body, headers: {} }) as never
}

function plan(candidates?: { memberId: string; name: string; currentTitle: string; proposedTitle: string; department: string }[]) {
  return invoke('/api/org/:clubId/members/transition/plan', 'post', '/api/org/club-001/members/transition/plan?_mock_user=leader', {
    input: { candidates, appointments: [] },
  })
}

describe('换届执行：职位 Group 成员同步（ORG-001/017，API 层）', () => {
  beforeEach(() => {
    resetDb()
  })

  it('无负责人候选人：leaderCandidate 为空态分支生效——负责人资格与 Group 保持不变', () => {
    const saved = plan([{ memberId: 'mem-002', name: '王浩然', currentTitle: '副部长', proposedTitle: '部长', department: '技术部' }])
    expect(saved.code).toBe(0)

    const out = invoke('/api/org/:clubId/members/transition', 'post', '/api/org/club-001/members/transition?_mock_user=leader', {})
    expect(out.code).toBe(0)
    expect(out.data?.results).toHaveLength(1)
    expect(out.data?.results?.[0]).toMatchObject({ memberId: 'mem-002', targetTitle: '部长', success: true })

    // 空态分支：无负责人交接 → 旧任仍在负责人 Group、状态/职位不变化
    const lead = db.findMember('club-001', 'mem-004')!
    expect(lead.status).toBe('active')
    expect(lead.positions.some((p) => p.title === '负责人' && p.status === 'active')).toBe(true)
    expect(getGroupDetail('grp-lead-001')!.members.map((m) => m.id)).toContain('mem-004')
    expect(db.transitionState.currentLeader).toMatchObject({ id: 'mem-004', title: '负责人' })
  })

  it('有负责人候选人：旧任退出负责人 Group 并结束职位，新任通过 join 入组；重复执行被拒', () => {
    const saved = plan([{ memberId: 'mem-005', name: '刘子豪', currentTitle: '干事', proposedTitle: '负责人', department: '技术部' }])
    expect(saved.code).toBe(0)

    const out = invoke('/api/org/:clubId/members/transition', 'post', '/api/org/club-001/members/transition?_mock_user=leader', {})
    expect(out.code).toBe(0)
    expect(out.data?.results?.[0]).toMatchObject({ memberId: 'mem-005', targetTitle: '负责人', success: true })

    // 旧任 mem-004：职位结束、状态 exiting，移出负责人 Group
    const old = db.findMember('club-001', 'mem-004')!
    expect(old.status).toBe('exited')
    expect(old.positions.find((p) => p.title === '负责人')?.status).toBe('ended')
    expect(getGroupDetail('grp-lead-001')!.members.map((m) => m.id)).not.toContain('mem-004')
    // 新任 mem-005：加入负责人 Group，currentLeader 交接
    expect(getGroupDetail('grp-lead-001')!.members.map((m) => m.id)).toContain('mem-005')
    expect(db.transitionState.currentLeader).toMatchObject({ id: 'mem-005', title: '负责人' })

    // 重复执行：已执行不可再来
    const again = invoke('/api/org/:clubId/members/transition', 'post', '/api/org/club-001/members/transition?_mock_user=leader', {})
    expect(again.statusCode).toBe(422)
    expect(again.body?.message).toContain('换届已执行')
  })

  it('未授权角色执行被拒（canManageMembersFull 校验）', () => {
    plan([])
    const out = invoke('/api/org/:clubId/members/transition/plan', 'post', '/api/org/club-001/members/transition/plan?_mock_user=member', {
      input: { candidates: [{ memberId: 'mem-005', name: '刘子豪', currentTitle: '干事', proposedTitle: '负责人', department: '技术部' }] },
    })
    expect(out.statusCode).toBe(403)
  })

  it('负责人 Group 悬空：换届完成但 syncFailures 留痕（position 已交接、Group 未同步可观测）', () => {
    const access = clubAccesses.find((c) => c.clubId === 'club-001')!
    const prevLeader = access.leaderGroupId
    access.leaderGroupId = 'grp-lead-ghost'
    try {
      const saved = plan([{ memberId: 'mem-005', name: '刘子豪', currentTitle: '干事', proposedTitle: '负责人', department: '技术部' }])
      expect(saved.code).toBe(0)

      const out = invoke('/api/org/:clubId/members/transition', 'post', '/api/org/club-001/members/transition?_mock_user=leader', {})
      expect(out.code).toBe(0)
      // 旧任移出与新任加入均遇悬空 → 两项留痕；结果本身仍按宽容语义推进
      expect(out.data?.syncFailures).toEqual(expect.arrayContaining([
        expect.objectContaining({ memberId: 'mem-004', title: '负责人', active: false, error: '负责人职位 Group 不存在或已失效' }),
        expect.objectContaining({ memberId: 'mem-005', title: '负责人', active: true, error: '负责人职位 Group 不存在或已失效' }),
      ]))
      expect(db.transitionState.syncFailures).toHaveLength(2)
      // GET 详情同步暴露 syncFailures
      const detail = invoke('/api/org/:clubId/members/transition', 'get', '/api/org/club-001/members/transition?_mock_user=leader', {})
      expect(detail.data?.syncFailures).toHaveLength(2)
    } finally {
      access.leaderGroupId = prevLeader
    }
  })
})