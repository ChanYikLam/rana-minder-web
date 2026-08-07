import { describe, expect, it, beforeEach } from 'vitest'
import handlers from './index'
import { resolveMockUser, clearMockSession } from './auth'
import { resetRecruitmentDB, resetNotifications, resetCorrections, resetDb, resetOrgDb } from './reset'
import { getClubAccess } from './db-organization'

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

const wizardPattern = '/api/admin/clubs/wizard'
const exploreUrl = '/api/explore/clubs'
const clubsListUrl = '/api/admin/clubs'

interface ExploreClub { id: string; name: string; description: string; memberCount: number }
interface ClubItem { clubId: string; clubName: string; description: string; status: string }

/** P0-001 回归：两套社团注册表数据分裂（mockClubs vs orgdb.clubAccesses）——统一为 orgdb 单一权威 */
describe('P0-001 社团注册表统一（orgdb 单一权威）', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
    resetNotifications()
    resetCorrections()
    resetDb()
    resetOrgDb()
    resolveMockUser('/api/auth/session?_mock_user=admin')
  })

  it('explore 目录仅派生 orgdb 已启用社团（含简介，停用/异常/待接入不出现）', async () => {
    const out = await invokeHandler('/api/explore/clubs', 'get', exploreUrl)
    expect(out.statusCode).toBe(200)
    const items = (out.body.data as { items: ExploreClub[] }).items
    expect(items.map((c) => c.name).sort()).toEqual(['电子设计协会', '计算机协会'])
    expect(items.every((c) => c.description.length > 0)).toBe(true)
    const comp = items.find((c) => c.name === '计算机协会')
    expect(comp?.memberCount).toBe(6)
  })

  it('wizard 提交创建 wizard_pending 条目（无审批环节），未启用前不进目录', async () => {
    const out = await invokeHandler(wizardPattern, 'post', wizardUrl(), {
      input: { groupId: 'grp-004', name: '智能影像社', description: '影像创作与后期', leaderGroupId: 'grp-lead-004' },
    })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const created = out.body.data as { id: string; status: string; wizardStep: number }
    expect(created.status).toBe('wizard_pending')
    expect(created.id).toBe('club-006')

    const list = await invokeHandler('/api/admin/clubs', 'get', clubsListUrl)
    const items = (list.body.data as { items: ClubItem[] }).items
    const entry = items.find((c) => c.clubId === created.id)
    expect(entry?.status).toBe('wizard_pending')
    expect(entry?.description).toBe('影像创作与后期')

    const explore = await invokeHandler('/api/explore/clubs', 'get', exploreUrl)
    const exploreNames = (explore.body.data as { items: ExploreClub[] }).items.map((c) => c.name)
    expect(exploreNames).not.toContain('智能影像社')
  })

  it('创建后经 save-step → complete 启用，进入目录且 Group 完成绑定（重复绑定被拒）', async () => {
    const created = await invokeHandler(wizardPattern, 'post', wizardUrl(), {
      input: { groupId: 'grp-004', name: '智能影像社', description: '影像创作与后期', leaderGroupId: 'grp-lead-004' },
    })
    const id = (created.body.data as { id: string }).id

    const step = await invokeHandler('/api/admin/clubs/wizard/save-step', 'post', '/api/admin/clubs/wizard/save-step', {
      input: { clubId: id, step: 3, selectedGroupId: 'grp-004', leaderGroupId: 'grp-lead-004' },
    })
    expect(step.statusCode).toBe(200)

    const complete = await invokeHandler('/api/admin/clubs/wizard/complete', 'post', '/api/admin/clubs/wizard/complete', {
      input: { clubId: id },
    })
    expect(complete.statusCode, JSON.stringify(complete.body)).toBe(200)
    expect((complete.body.data as { status: string }).status).toBe('enabled')

    const explore = await invokeHandler('/api/explore/clubs', 'get', exploreUrl)
    const names = (explore.body.data as { items: ExploreClub[] }).items.map((c) => c.name)
    expect(names).toContain('智能影像社')

    const dup = await invokeHandler(wizardPattern, 'post', wizardUrl(), {
      input: { groupId: 'grp-004', name: '影像二社', description: '', leaderGroupId: 'grp-lead-004' },
    })
    expect(dup.statusCode).toBe(422)
    expect(dup.body.message).toContain('已被社团 club-006 绑定')
  })

  it('校验拒绝：名称重复 / 非社团级用途 / 负责人不在层级下', async () => {
    const dupName = await invokeHandler(wizardPattern, 'post', wizardUrl(), {
      input: { groupId: 'grp-004', name: '计算机协会', description: '', leaderGroupId: 'grp-lead-004' },
    })
    expect(dupName.statusCode).toBe(422)
    expect(dupName.body.message).toContain('社团名称已存在')

    const wrongPurpose = await invokeHandler(wizardPattern, 'post', wizardUrl(), {
      input: { groupId: 'grp-dept-001', name: '部门冒充社团', description: '', leaderGroupId: 'grp-lead-001' },
    })
    expect(wrongPurpose.statusCode).toBe(422)
    expect(wrongPurpose.body.message).toContain('仅 club 用途可绑定为社团')

    const bound = await invokeHandler(wizardPattern, 'post', wizardUrl(), {
      input: { groupId: 'grp-001', name: '重复绑定', description: '', leaderGroupId: 'grp-lead-001' },
    })
    expect(bound.statusCode).toBe(422)
    expect(bound.body.message).toContain('已被社团 club-001 绑定')

    const wrongLeader = await invokeHandler(wizardPattern, 'post', wizardUrl(), {
      input: { groupId: 'grp-004', name: '错级负责人', description: '', leaderGroupId: 'grp-lead-001' },
    })
    expect(wrongLeader.statusCode).toBe(422)
    expect(wrongLeader.body.message).toContain('必须在所选社团层级下')
  })

  it('旧审批/审核端点已移除（孤儿端点回归守卫）', () => {
    expect(() => invokeHandler('/api/admin/clubs/:clubId/approve', 'post', '/api/admin/clubs/club-001/approve')).toThrow(/handler 未找到/)
    expect(() => invokeHandler('/api/admin/casdoor/groups', 'get', '/api/admin/casdoor/groups')).toThrow(/handler 未找到/)
  })

  it('非平台管理员提交 wizard 被拒（403）', async () => {
    resolveMockUser('/api/auth/session?_mock_user=member')
    const out = await invokeHandler(wizardPattern, 'post', wizardUrl(), {
      input: { groupId: 'grp-004', name: '越权', description: '', leaderGroupId: 'grp-lead-004' },
    })
    expect(out.statusCode).toBe(403)
  })
})

/** 审计修复：负责人职位层级复检（complete/save-step）与成员数单一数据源（seed 不再双口径） */
describe('审计修复：负责人层级复检与成员数单一数据源', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
    resetNotifications()
    resetCorrections()
    resetDb()
    resetOrgDb()
    resolveMockUser('/api/auth/session?_mock_user=admin')
  })

  it('save-step 拒绝写入非法负责人绑定（grp-lead-001 不属于 grp-004 层级）', async () => {
    const created = await invokeHandler(wizardPattern, 'post', wizardUrl(), {
      input: { groupId: 'grp-004', name: '智能影像社', description: '', leaderGroupId: 'grp-lead-004' },
    })
    const id = (created.body.data as { id: string }).id

    const illegal = await invokeHandler('/api/admin/clubs/wizard/save-step', 'post', '/api/admin/clubs/wizard/save-step', {
      input: { clubId: id, step: 2, selectedGroupId: 'grp-004', leaderGroupId: 'grp-lead-001' },
    })
    expect(illegal.statusCode).toBe(422)
    expect(illegal.body.message).toContain('必须在所选社团层级下')

    const still = getClubAccess(id)!
    expect(still.status).toBe('wizard_pending')
    expect(still.wizard?.leaderGroupId).toBe('grp-lead-004')
  })

  it('save-step 仅改选 Group 时按生效组合复检，残留旧职位引用被拒', async () => {
    const created = await invokeHandler(wizardPattern, 'post', wizardUrl(), {
      input: { groupId: 'grp-004', name: '智能影像社', description: '', leaderGroupId: 'grp-lead-004' },
    })
    const id = (created.body.data as { id: string }).id

    const stale = await invokeHandler('/api/admin/clubs/wizard/save-step', 'post', '/api/admin/clubs/wizard/save-step', {
      input: { clubId: id, step: 1, selectedGroupId: 'grp-004', leaderGroupId: 'grp-lead-001' },
    })
    expect(stale.statusCode).toBe(422)
    expect(stale.body.message).toContain('必须在所选社团层级下')
  })

  it('complete 启用前复检负责人层级（审计复现：grp-lead-001 绑到 grp-004 被拒，不产生绑定）', async () => {
    const created = await invokeHandler(wizardPattern, 'post', wizardUrl(), {
      input: { groupId: 'grp-004', name: '智能影像社', description: '', leaderGroupId: 'grp-lead-004' },
    })
    const id = (created.body.data as { id: string }).id

    const club = getClubAccess(id)!
    club.wizard!.leaderGroupId = 'grp-lead-001'
    club.wizard!.selectedGroupId = 'grp-004'

    const complete = await invokeHandler('/api/admin/clubs/wizard/complete', 'post', '/api/admin/clubs/wizard/complete', {
      input: { clubId: id },
    })
    expect(complete.statusCode).toBe(422)
    expect(complete.body.message).toContain('必须在所选社团层级下')

    expect(club.status).toBe('wizard_pending')
    expect(club.groupId).toBeNull()

    const list = await invokeHandler('/api/admin/groups', 'get', '/api/admin/groups')
    const groups = (list.body.data as { items: { id: string; boundClubId: string | null }[] }).items
    expect(groups.find((g) => g.id === 'grp-004')?.boundClubId).toBeNull()
  })

  it('管理列表与公开目录成员数同口径（成员表为单一数据源，无 128/86/64 幻数）', async () => {
    const list = await invokeHandler('/api/admin/clubs', 'get', clubsListUrl)
    const items = (list.body.data as { items: { clubId: string; memberCount: number; importedCount: number }[] }).items
    const byId = Object.fromEntries(items.map((c) => [c.clubId, c]))

    expect(byId['club-001'].memberCount).toBe(6)
    expect(byId['club-002'].memberCount).toBe(1)
    expect(byId['club-003'].memberCount).toBe(0)
    expect(byId['club-005'].memberCount).toBe(0)
    expect(items.every((c) => c.memberCount < 128 && c.importedCount < 128)).toBe(true)

    const explore = await invokeHandler('/api/explore/clubs', 'get', exploreUrl)
    const exploreItems = (explore.body.data as { items: { id: string; memberCount: number }[] }).items
    for (const c of exploreItems) {
      expect(byId[c.id].memberCount).toBe(c.memberCount)
    }
  })

  it('新接入完成后成员数同样来自成员表（与公开目录一致）', async () => {
    const created = await invokeHandler(wizardPattern, 'post', wizardUrl(), {
      input: { groupId: 'grp-004', name: '智能影像社', description: '影像创作与后期', leaderGroupId: 'grp-lead-004' },
    })
    const id = (created.body.data as { id: string }).id
    await invokeHandler('/api/admin/clubs/wizard/save-step', 'post', '/api/admin/clubs/wizard/save-step', {
      input: { clubId: id, step: 3, selectedGroupId: 'grp-004', leaderGroupId: 'grp-lead-004' },
    })
    await invokeHandler('/api/admin/clubs/wizard/complete', 'post', '/api/admin/clubs/wizard/complete', {
      input: { clubId: id },
    })

    const list = await invokeHandler('/api/admin/clubs', 'get', clubsListUrl)
    const items = (list.body.data as { items: { clubId: string; memberCount: number }[] }).items
    expect(items.find((c) => c.clubId === id)?.memberCount).toBe(0)

    const explore = await invokeHandler('/api/explore/clubs', 'get', exploreUrl)
    const exploreItems = (explore.body.data as { items: { id: string; memberCount: number }[] }).items
    expect(exploreItems.find((c) => c.id === id)?.memberCount).toBe(0)
  })
})

function wizardUrl(): string {
  return '/api/admin/clubs/wizard'
}
