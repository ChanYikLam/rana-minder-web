import { describe, expect, it, beforeEach } from 'vitest'
import { recruitmentApiHandlers, rdb } from './recruitment-api'
import { mockUsers, resolveMockUser, clearMockSession } from './auth'
import { listNotifications } from './notifications'
import { resetRecruitmentDB, resetNotifications } from './reset'

/** 最小 ServerResponse 替身（与 recruitment-apply.test.ts 同款） */
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

/** 复用真实分发路径（withStatus.rawResponse）：url + body + 最小 req/res 替身 */
function invokeHandler(urlPattern: string, reqUrl: string, body?: unknown, method = 'post'): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const handler = recruitmentApiHandlers.find((h) => h.url === urlPattern && h.method === method)
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

/** mockUsers 的 key 是角色名（如 leader），其 id 才是 user-leader-001；按 id 反查 key */
function mockUserKeyOf(userId: string): string {
  const entry = Object.entries(mockUsers).find(([, u]) => u.id === userId)
  if (!entry) throw new Error(`mock 用户不存在: ${userId}`)
  return entry[0]
}

const applyUrl = '/api/activity/recruitment/:activityId/apply'
const labelUrl = '/api/org/:clubId/recruitment/:activityId/applications/:applicantId/paths/:departmentId/label'
const decisionUrl = '/api/org/:clubId/recruitment/:activityId/applications/:applicantId/paths/:departmentId/decision'
const adjustmentUrl = '/api/org/:clubId/recruitment/:activityId/applications/:applicantId/paths/adjustment'

// 种子数据（db-recruitment.ts）：
//   act-001 属 club-001（计算机协会），部门 dept-001 技术部 / dept-002 运营部 / dept-003 设计部
//   app-001 (u-001 刘子豪) 志愿 [dept-001, dept-003]
//   app-003 (u-003 王梓涵) 志愿 [dept-001]，dept-001 已由 李思颖 打标（waitlist）
//   app-005 (u-005 李欣怡) 志愿 [dept-002]
// 用户：user-leader-001 张明远（club-001 负责人，mem-004）；user-hr-001 李思颖（mem-003）；
//       user-member-001 陈雨桐（member 可自动注册为申请人，报名其他社团）
// 申请人映射：user-applicant-001→u-001、user-applicant-002→u-002、user-applicant-003→u-006

const LEADER_KEY = mockUserKeyOf('user-leader-001')
const HR_KEY = mockUserKeyOf('user-hr-001')
const MEMBER_KEY = mockUserKeyOf('user-member-001')

describe('P1-012 REC 契约缺口修复', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
    resetNotifications()
  })

  // ============ 1. submitApplication 资格快照（REC-035） ============
  describe('REC-035 submitApplication 资格快照', () => {
    it('提交申请时固化 eligibilitySnapshot（answers/preferences/submittedAt/formVersion）', async () => {
      resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
      const out = await invokeHandler(applyUrl, '/api/activity/recruitment/act-002/apply', {
        formData: { name: '陈雨桐', grade: '2021' },
        preferences: [{ departmentId: 'dept-101' }, { departmentId: 'dept-102' }],
        allowAdjustment: true,
      })
      expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
      const app = rdb.recruitmentApplications.find((a) => a.activityId === 'act-002' && a.applicantName === '陈雨桐')
      expect(app).toBeTruthy()
      expect(app!.eligibilitySnapshot).not.toBeNull()
      expect(app!.eligibilitySnapshot!.answers).toEqual({ name: '陈雨桐', grade: '2021' })
      expect(app!.eligibilitySnapshot!.preferences.map((p) => p.departmentId)).toEqual(['dept-101', 'dept-102'])
      expect(app!.eligibilitySnapshot!.formVersion).toBe(1)
      expect(app!.eligibilitySnapshot!.submittedAt).toBeTruthy()
    })

    it('资格快照为提交时深拷贝：后续修改 answers 不影响快照', async () => {
      resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
      await invokeHandler(applyUrl, '/api/activity/recruitment/act-002/apply', {
        formData: { name: '陈雨桐' },
        preferences: [{ departmentId: 'dept-101' }],
        allowAdjustment: true,
      })
      const app = rdb.recruitmentApplications.find((a) => a.activityId === 'act-002' && a.applicantName === '陈雨桐')!
      const snapshotAnswers = JSON.stringify(app.eligibilitySnapshot!.answers)
      // 直接改写 answers（模拟服务端后续变更），快照应保持不变
      app.answers = { ...app.answers, extra: 'changed' }
      expect(JSON.stringify(app.eligibilitySnapshot!.answers)).toBe(snapshotAnswers)
    })

    it('GET 我的申请返回 eligibilitySnapshot 字段', async () => {
      resolveMockUser(`/api/auth/session?_mock_user=${MEMBER_KEY}`)
      await invokeHandler(applyUrl, '/api/activity/recruitment/act-002/apply', {
        formData: { name: '陈雨桐' },
        preferences: [{ departmentId: 'dept-101' }],
        allowAdjustment: true,
      })
      const out = await invokeHandler(applyUrl, '/api/activity/recruitment/act-002/apply', undefined, 'get')
      expect(out.statusCode).toBe(200)
      const data = out.body.data as Record<string, unknown>
      expect(data.eligibilitySnapshot).toBeTruthy()
    })
  })

  // ============ 2. source: 'adjustment' 路径创建（REC-036） ============
  describe('REC-036 调剂路径创建（source=adjustment）', () => {
    it('管理员可为申请人创建 source=adjustment 的部门路径', async () => {
      resolveMockUser(`/api/auth/session?_mock_user=${LEADER_KEY}`)
      const out = await invokeHandler(adjustmentUrl, '/api/org/club-001/recruitment/act-001/applications/u-005/paths/adjustment', {
        departmentId: 'dept-001',
        departmentName: '技术部',
        reason: '第一志愿未录取，调剂至技术部',
      })
      expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
      const app = rdb.findApplication('act-001', 'u-005')!
      const path = app.paths['dept-001']
      expect(path).toBeTruthy()
      expect(path.source).toBe('adjustment')
      expect(path.order).toBe(2) // 已有 dept-002 志愿路径 order=1
    })

    it('无权限成员不可创建调剂路径（403）', async () => {
      resolveMockUser('/api/auth/session?_mock_user=applicant')
      const out = await invokeHandler(adjustmentUrl, '/api/org/club-001/recruitment/act-001/applications/u-005/paths/adjustment', {
        departmentId: 'dept-001',
        departmentName: '技术部',
        reason: '调剂',
      })
      expect(out.statusCode).toBe(403)
    })

    it('调剂路径已存在 / 部门不在活动范围 / 缺少原因时拒绝', async () => {
      resolveMockUser(`/api/auth/session?_mock_user=${LEADER_KEY}`)
      // 部门不在活动范围
      const bad = await invokeHandler(adjustmentUrl, '/api/org/club-001/recruitment/act-001/applications/u-005/paths/adjustment', {
        departmentId: 'dept-999',
        departmentName: '不存在',
        reason: '调剂',
      })
      expect(bad.statusCode).toBe(422)
      // 缺少原因
      const noReason = await invokeHandler(adjustmentUrl, '/api/org/club-001/recruitment/act-001/applications/u-005/paths/adjustment', {
        departmentId: 'dept-001',
        departmentName: '技术部',
        reason: '',
      })
      expect(noReason.statusCode).toBe(422)
      // 路径已存在（u-005 已有 dept-002 志愿路径）
      const dup = await invokeHandler(adjustmentUrl, '/api/org/club-001/recruitment/act-001/applications/u-005/paths/adjustment', {
        departmentId: 'dept-002',
        departmentName: '运营部',
        reason: '调剂',
      })
      expect(dup.statusCode).toBe(422)
    })

    it('部门负责人不可为调剂路径设置标签（仅 volunteer 可操作）', async () => {
      resolveMockUser(`/api/auth/session?_mock_user=${LEADER_KEY}`)
      await invokeHandler(adjustmentUrl, '/api/org/club-001/recruitment/act-001/applications/u-005/paths/adjustment', {
        departmentId: 'dept-001',
        departmentName: '技术部',
        reason: '调剂至技术部',
      })
      const out = await invokeHandler(labelUrl, '/api/org/club-001/recruitment/act-001/applications/u-005/paths/dept-001/label', {
        label: true,
      })
      expect(out.statusCode).toBe(422)
      expect(String(out.body.message)).toContain('部门负责人仅能操作正式报名本部门的申请人')
    })
  })

  // ============ 3. setDeptLabel 标签历史（REC-039） ============
  describe('REC-039 setDeptLabel 标签历史', () => {
    it('设置标签写入 labelHistory（action=set）', async () => {
      resolveMockUser(`/api/auth/session?_mock_user=${LEADER_KEY}`)
      await invokeHandler(labelUrl, '/api/org/club-001/recruitment/act-001/applications/u-001/paths/dept-001/label', {
        label: true,
      })
      const path = rdb.findApplication('act-001', 'u-001')!.paths['dept-001']
      expect(path.labelHistory.length).toBe(1)
      expect(path.labelHistory[0].action).toBe('set')
      expect(path.labelHistory[0].actorName).toBe('张明远')
      expect(path.labelHistory[0].timestamp).toBeTruthy()
    })

    it('清除标签写入 labelHistory（action=clear）', async () => {
      resolveMockUser(`/api/auth/session?_mock_user=${LEADER_KEY}`)
      // app-003 dept-001 已有李思颖的标签（waitlist）
      await invokeHandler(labelUrl, '/api/org/club-001/recruitment/act-001/applications/u-003/paths/dept-001/label', {
        label: false,
      })
      const path = rdb.findApplication('act-001', 'u-003')!.paths['dept-001']
      const clearEntry = path.labelHistory.find((h) => h.action === 'clear')
      expect(clearEntry).toBeTruthy()
      expect(clearEntry!.actorName).toBe('张明远')
      expect(path.decided).toBeNull()
    })

    it('覆盖已有标签写入 labelHistory（action=override）并保留操作者', async () => {
      resolveMockUser(`/api/auth/session?_mock_user=${HR_KEY}`)
      // 李思颖先给 app-001 的 dept-001 打标
      await invokeHandler(labelUrl, '/api/org/club-001/recruitment/act-001/applications/u-001/paths/dept-001/label', {
        label: true,
      })
      resolveMockUser(`/api/auth/session?_mock_user=${LEADER_KEY}`)
      // 张明远覆盖
      await invokeHandler(labelUrl, '/api/org/club-001/recruitment/act-001/applications/u-001/paths/dept-001/label', {
        label: true,
      })
      const path = rdb.findApplication('act-001', 'u-001')!.paths['dept-001']
      expect(path.labelHistory.some((h) => h.action === 'override')).toBe(true)
      expect(path.labelSetBy).toBe('张明远')
      // history 保持追加：set + override 两条
      expect(path.labelHistory.length).toBe(2)
    })
  })

  // ============ 4. 普通标签改判内部通知（REC-018 label 层） ============
  describe('标签改判内部通知', () => {
    it('标签被他人覆盖时通知原设置者（label_override）', async () => {
      resolveMockUser(`/api/auth/session?_mock_user=${HR_KEY}`)
      // 李思颖先打标
      await invokeHandler(labelUrl, '/api/org/club-001/recruitment/act-001/applications/u-001/paths/dept-001/label', {
        label: true,
      })
      resolveMockUser(`/api/auth/session?_mock_user=${LEADER_KEY}`)
      // 张明远覆盖
      const out = await invokeHandler(labelUrl, '/api/org/club-001/recruitment/act-001/applications/u-001/paths/dept-001/label', {
        label: true,
      })
      expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
      const items = listNotifications('user-hr-001', false)
      const ntf = items.find((n) => n.type === 'label_override')
      expect(ntf).toBeTruthy()
      expect(ntf!.title).toBe('部门标签被改判')
      expect(ntf!.body).toContain('刘子豪')
      expect(ntf!.body).toContain('技术部')
      expect(ntf!.body).toContain('张明远')
    })

    it('同一操作者重复设置不触发改判通知', async () => {
      resolveMockUser(`/api/auth/session?_mock_user=${LEADER_KEY}`)
      await invokeHandler(labelUrl, '/api/org/club-001/recruitment/act-001/applications/u-001/paths/dept-001/label', {
        label: true,
      })
      await invokeHandler(labelUrl, '/api/org/club-001/recruitment/act-001/applications/u-001/paths/dept-001/label', {
        label: true,
      })
      const items = listNotifications('user-leader-001', false)
      expect(items.some((n) => n.type === 'label_override')).toBe(false)
    })
  })

  // ============ 5. 整体未录取通知 ============
  describe('整体未录取通知', () => {
    it('全部志愿路径均为 not_admit 时推送 overall_not_admitted 通知', async () => {
      resolveMockUser(`/api/auth/session?_mock_user=${LEADER_KEY}`)
      // app-002 (u-002 陈雨桐) 志愿 dept-002（唯一），全部 not_admit → user-applicant-002
      const out = await invokeHandler(decisionUrl, '/api/org/club-001/recruitment/act-001/applications/u-002/paths/dept-002/decision', {
        decision: 'not_admit',
      })
      expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
      const items = listNotifications('user-applicant-002', false)
      const ntf = items.find((n) => n.type === 'overall_not_admitted')
      expect(ntf).toBeTruthy()
      expect(ntf!.title).toBe('整体未录取通知')
      expect(ntf!.body).toContain('2025 秋季招新')
    })

    it('存在 admit 时仅部分录取不触发整体未录取通知', async () => {
      resolveMockUser(`/api/auth/session?_mock_user=${LEADER_KEY}`)
      // app-001 (u-001) 志愿 dept-001 + dept-003：dept-001 打标 admit，dept-003 not_admit
      await invokeHandler(labelUrl, '/api/org/club-001/recruitment/act-001/applications/u-001/paths/dept-001/label', {
        label: true,
      })
      await invokeHandler(decisionUrl, '/api/org/club-001/recruitment/act-001/applications/u-001/paths/dept-003/decision', {
        decision: 'not_admit',
      })
      const items = listNotifications('user-applicant-001', false)
      expect(items.some((n) => n.type === 'overall_not_admitted')).toBe(false)
    })

    it('存在待定/暂缓路径时不触发整体未录取通知', async () => {
      resolveMockUser(`/api/auth/session?_mock_user=${LEADER_KEY}`)
      // app-001 (u-001) 志愿 dept-001 + dept-003：dept-003 not_admit，dept-001 仍 evaluating
      await invokeHandler(decisionUrl, '/api/org/club-001/recruitment/act-001/applications/u-001/paths/dept-003/decision', {
        decision: 'not_admit',
      })
      const items = listNotifications('user-applicant-001', false)
      expect(items.some((n) => n.type === 'overall_not_admitted')).toBe(false)
    })
  })
})
