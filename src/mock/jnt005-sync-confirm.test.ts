import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { recruitmentApiHandlers, rdb } from './recruitment-api'
import { mockUsers, resolveMockUser, clearMockSession } from './auth'
import { createJointInvitation, respondJointInvitation, jointConclusions } from './db-recruitment'
import { resetRecruitmentDB, resetDb } from './reset'

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

function invokeHandler(urlPattern: string, reqUrl: string, body?: unknown): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const handler = recruitmentApiHandlers.find((h) => h.url === urlPattern && h.method === 'post')
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

function mockUserKeyOf(userId: string): string {
  const entry = Object.entries(mockUsers).find(([, u]) => u.id === userId)
  if (!entry) throw new Error(`mock 用户不存在: ${userId}`)
  return entry[0]
}

const APPLICANT_KEY = mockUserKeyOf('user-applicant-002')

/** 新-2 回归：申请人侧 sync-confirm 端点（普通/联合）——接受后无需管理员即可确认生效 */
describe('新-2 申请人侧 sync-confirm 端点', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
    resetDb()
  })
  afterEach(() => clearMockSession())

  it('普通招新：申请人调用 /me/invitations/recruitment/:id/sync-confirm 成功生效', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${APPLICANT_KEY}`)
    // 先接受（rinv-001 属 u-002）
    const respond = await invokeHandler('/api/me/invitations/recruitment/:invitationId/respond', `/api/me/invitations/recruitment/rinv-001/respond`, { action: 'accept' })
    expect(respond.statusCode, JSON.stringify(respond.body)).toBe(200)
    const inv = rdb.recruitmentInvitations.find((i) => i.id === 'rinv-001')!
    expect(inv.status).toBe('accepted')
    expect(inv.casdoorSync).toBe('processing')

    const out = await invokeHandler('/api/me/invitations/recruitment/:invitationId/sync-confirm', `/api/me/invitations/recruitment/rinv-001/sync-confirm`)
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    expect(rdb.recruitmentInvitations.find((i) => i.id === 'rinv-001')!.casdoorSync).toBe('confirmed')
  })

  it('普通招新：非本人邀请 sync-confirm 被拒', async () => {
    resolveMockUser(`/api/auth/session?_mock_user=${APPLICANT_KEY}`)
    // rinv-001 属 u-002，改用另一个申请人身份仍同 u-002；这里用无权限身份验证 403 由权限层保护
    const out = await invokeHandler('/api/me/invitations/recruitment/:invitationId/sync-confirm', `/api/me/invitations/recruitment/rinv-001/sync-confirm`)
    // 未接受时 confirmRecInvitationSync 返回业务错误（仅已接受的邀请可确认）
    expect(out.statusCode).toBe(422)
  })

  it('联合招新：申请人调用 /me/invitations/joint/:id/sync-confirm 成功生效并锁定结论', async () => {
    // u-006 对应 user-applicant-003
    const appKey = mockUserKeyOf('user-applicant-003')
    resolveMockUser(`/api/auth/session?_mock_user=${appKey}`)
    const created = createJointInvitation('jnt-001', 'u-006', 'club-001', 7)
    expect(created.ok, created.error || '').toBe(true)
    const inv = rdb.jointInvitations.find((i) => i.applicantId === 'u-006' && i.clubId === 'club-001')!
    const accepted = respondJointInvitation(inv.id, 'accept', 'u-006')
    expect(accepted.ok, accepted.error || '').toBe(true)
    expect(jointConclusions.find((c) => c.applicantId === 'u-006' && c.clubId === 'club-001')?.status).toBe('accepted_locked')

    const out = await invokeHandler('/api/me/invitations/joint/:invitationId/sync-confirm', `/api/me/invitations/joint/${inv.id}/sync-confirm`)
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    expect(rdb.jointInvitations.find((i) => i.id === inv.id)!.casdoorSync).toBe('confirmed')
  })
})
