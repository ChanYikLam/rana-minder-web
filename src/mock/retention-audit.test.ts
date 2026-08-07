import { describe, expect, it, beforeEach } from 'vitest'
import handlers, { retentionSubjects, resetRetentionState } from './index'
import { resolveMockUser, clearMockSession } from './auth'
import { resetRecruitmentDB, resetNotifications, resetCorrections, resetAuditLogs } from './reset'

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

const executeUrl = '/api/admin/retention/execute'
const executePattern = '/api/admin/retention/execute'
const retentionUrl = '/api/admin/retention'
const retentionPattern = '/api/admin/retention'
const previewPattern = '/api/admin/retention/:policyId/preview'
const publishPattern = '/api/admin/retention/:policyId/publish'
const adminAuditLogsUrl = '/api/admin/audit/logs'
const adminAuditLogsPattern = '/api/admin/audit/logs'

interface ExecuteResult { policyId: string; scope: string; action: string; executedCount: number; skippedCount: number }
interface AuditLogItem { action: string; targetId: string; detail?: string }

/** P1-010：保留策略不再只是静态数据——执行器真实处置到期数据，且每次发布/执行都写入审计日志 */
describe('保留策略执行器（P1-010 审计闭环）', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
    resetNotifications()
    resetCorrections()
    resetAuditLogs()
    resetRetentionState()
    resolveMockUser('/api/auth/session?_mock_user=admin')
  })

  async function reauth(): Promise<string> {
    const out = await invokeHandler('/api/auth/reauth', 'post', '/api/auth/reauth')
    expect(out.statusCode).toBe(200)
    return (out.body.data as { proof: string }).proof
  }

  it('执行器按生效策略处置到期数据（auto_delete 删除 / archive 归档 / keep 保留）', async () => {
    const proof = await reauth()
    const out = await invokeHandler(executePattern, 'post', executeUrl, { input: { reason: '例行数据保留执行', reauthProof: proof } })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const data = out.body.data as { runId: string; results: ExecuteResult[] }
    expect(data.runId).toMatch(/^RPX-/)
    expect(data.results).toHaveLength(3)

    const del = data.results.find((r) => r.policyId === 'rp-001')
    expect(del?.action).toBe('auto_delete')
    expect(del?.executedCount).toBe(2) // rs-001/rs-002 超过 365 天被删除；rs-003 未到期跳过
    expect(del?.skippedCount).toBe(1)

    const arch = data.results.find((r) => r.policyId === 'rp-002')
    expect(arch?.action).toBe('archive')
    expect(arch?.executedCount).toBe(2) // rs-004/rs-005 归档；rs-006 未到期跳过
    expect(arch?.skippedCount).toBe(1)

    // 实际状态已变更：删除/归档真实落库
    expect(retentionSubjects.find((s) => s.id === 'rs-001')?.state).toBe('deleted')
    expect(retentionSubjects.find((s) => s.id === 'rs-004')?.state).toBe('archived')
    expect(retentionSubjects.find((s) => s.id === 'rs-003')?.state).toBe('active')
  })

  it('重复执行不重复处置（已处置对象计入跳过）', async () => {
    const proof = await reauth()
    await invokeHandler(executePattern, 'post', executeUrl, { input: { reason: '第一次执行', reauthProof: proof } })
    const proof2 = await reauth()
    const second = await invokeHandler(executePattern, 'post', executeUrl, { input: { reason: '第二次执行', reauthProof: proof2 } })
    const results = (second.body.data as { results: ExecuteResult[] }).results
    const del = results.find((r) => r.policyId === 'rp-001')
    expect(del?.executedCount).toBe(0)
    expect(del?.skippedCount).toBe(3)
  })

  it('执行结果写入平台审计日志（逐策略 + 批量触发）', async () => {
    const proof = await reauth()
    await invokeHandler(executePattern, 'post', executeUrl, { input: { reason: '审计验证执行', reauthProof: proof } })

    const logs = await invokeHandler(adminAuditLogsPattern, 'get', adminAuditLogsUrl)
    expect(logs.statusCode).toBe(200)
    const items = (logs.body.data as { items: AuditLogItem[] }).items
    expect(items.some((l) => l.action === '执行保留策略（自动删除）' && l.targetId === 'rp-001')).toBe(true)
    expect(items.some((l) => l.action === '执行保留策略（归档）' && l.targetId === 'rp-002')).toBe(true)
    expect(items.some((l) => l.action === '触发保留策略批量执行')).toBe(true)
  })

  it('发布保留策略写入审计日志（闭环：发布 → 审计可见）', async () => {
    // 创建草稿
    const created = await invokeHandler(retentionPattern, 'post', retentionUrl, { input: { scope: '过期面试记录', retentionDays: 180, action: 'auto_delete' } })
    expect(created.statusCode, JSON.stringify(created.body)).toBe(200)
    const policy = created.body.data as { id: string }

    // 预览影响（版本递增）
    const proof = await reauth()
    const preview = await invokeHandler(previewPattern, 'get', `${retentionUrl}/${policy.id}/preview`)
    expect(preview.statusCode).toBe(200)
    const pv = (preview.body.data as { previewVersion: number }).previewVersion

    // 发布
    const published = await invokeHandler(publishPattern, 'post', `${retentionUrl}/${policy.id}/publish`, {
      input: { reason: '清理过期面试数据，控制存储成本', reauthProof: proof, previewVersion: pv },
    })
    expect(published.statusCode, JSON.stringify(published.body)).toBe(200)

    const logs = await invokeHandler(adminAuditLogsPattern, 'get', adminAuditLogsUrl)
    const items = (logs.body.data as { items: AuditLogItem[] }).items
    const hit = items.find((l) => l.action === '发布保留策略' && l.targetId === policy.id)
    expect(hit, '发布动作应写入审计日志').toBeTruthy()
    expect(hit?.detail).toContain('过期面试记录')
  })

  it('执行端点校验：未重认证 401、无原因 422、非管理员 403', async () => {
    const noReauth = await invokeHandler(executePattern, 'post', executeUrl, { input: { reason: '无重认证' } })
    expect(noReauth.statusCode).toBe(401)

    const proof = await reauth()
    const noReason = await invokeHandler(executePattern, 'post', executeUrl, { input: { reauthProof: proof } })
    expect(noReason.statusCode).toBe(422)

    resolveMockUser('/api/auth/session?_mock_user=member')
    const proofMember = await invokeHandler('/api/auth/reauth', 'post', '/api/auth/reauth')
    const memberProof = (proofMember.body.data as { proof: string }).proof
    const denied = await invokeHandler(executePattern, 'post', executeUrl, { input: { reason: '越权尝试', reauthProof: memberProof } })
    expect(denied.statusCode).toBe(403)
  })
})
