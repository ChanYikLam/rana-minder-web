import { describe, expect, it, beforeEach } from 'vitest'
import handlers, { resetSharedState } from './index'
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

/** MRM-010 回归：平台域共享状态（permissionTemplates/retentionPolicies/retentionPreviewVersion/reauthProofs 等）
 * 随 resetSharedState 一并还原——「先跑含发布用例的测试，再跑断言策略状态的用例」互不污染。 */
describe('MRM-010 平台域共享状态重置', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
    resetNotifications()
    resetCorrections()
    resetAuditLogs()
    resetSharedState()
    resolveMockUser('/api/auth/session?_mock_user=admin')
  })

  async function reauth(): Promise<string> {
    const out = await invokeHandler('/api/auth/reauth', 'post', '/api/auth/reauth')
    expect(out.statusCode).toBe(200)
    return (out.body.data as { proof: string }).proof
  }

  it('发布用例：发布保留策略草稿 + 发布权限模板草稿', async () => {
    // 保留策略：创建草稿 → 预览 → 发布
    const created = await invokeHandler('/api/admin/retention', 'post', '/api/admin/retention', {
      input: { scope: '过期面试记录', retentionDays: 180, action: 'auto_delete' },
    })
    expect(created.statusCode, JSON.stringify(created.body)).toBe(200)
    const policyId = (created.body.data as { id: string }).id
    const pv = await invokeHandler('/api/admin/retention/:policyId/preview', 'get', `/api/admin/retention/${policyId}/preview`)
    const previewVersion = (pv.body.data as { previewVersion: number }).previewVersion
    const published = await invokeHandler('/api/admin/retention/:policyId/publish', 'post', `/api/admin/retention/${policyId}/publish`, {
      input: { reason: '清理过期面试数据，控制存储成本', reauthProof: await reauth(), previewVersion },
    })
    expect(published.statusCode, JSON.stringify(published.body)).toBe(200)

    // 权限模板：创建草稿 → diff → 发布
    const tpl = await invokeHandler('/api/admin/config/permission-templates', 'post', '/api/admin/config/permission-templates', {
      input: { name: '宣传组模板', permissions: ['club:announce:manage'] },
    })
    expect(tpl.statusCode, JSON.stringify(tpl.body)).toBe(200)
    const tplId = (tpl.body.data as { id: string }).id
    const diff = await invokeHandler('/api/admin/config/permission-templates/:templateId/diff', 'get', `/api/admin/config/permission-templates/${tplId}/diff`)
    const tplPreviewVersion = (diff.body.data as { previewVersion: number }).previewVersion
    const tplPublished = await invokeHandler('/api/admin/config/permission-templates/:templateId/publish', 'post', `/api/admin/config/permission-templates/${tplId}/publish`, {
      input: { reason: '发布宣传组模板，统一权限口径', reauthProof: await reauth(), previewVersion: tplPreviewVersion },
    })
    expect(tplPublished.statusCode, JSON.stringify(tplPublished.body)).toBe(200)
  })

  it('断言策略状态的用例：beforeEach 完整重置后平台域回到种子（retentionPolicies 3 条 / permissionTemplates 3 条 / previewVersion=1）', async () => {
    const retention = await invokeHandler('/api/admin/retention', 'get', '/api/admin/retention')
    const policies = (retention.body.data as { policies: unknown[] }).policies
    const draftVersion = (retention.body.data as { draftVersion: number | null }).draftVersion
    expect(policies).toHaveLength(3) // rp-001/002/003，无发布用例残留
    expect(policies.every((p) => (p as { status: string }).status === 'active')).toBe(true)
    expect(draftVersion).toBeNull()

    const tpls = await invokeHandler('/api/admin/config/permission-templates', 'get', '/api/admin/config/permission-templates')
    const items = (tpls.body.data as { items: unknown[] }).items
    expect(items).toHaveLength(3) // tpl-001/002/003，无发布用例残留
    expect(items.every((t) => (t as { status: string }).status === 'published')).toBe(true)
    expect(items.every((t) => (t as { draftVersion: number | null }).draftVersion === null)).toBe(true)

    // previewVersion 回到种子：种子为 1；MRM-011 修复后 GET diff 幂等（不自增），重置后首个 diff 应为 1（发布用例残留的 4+ 不复现）
    const tpl2 = await invokeHandler('/api/admin/config/permission-templates', 'post', '/api/admin/config/permission-templates', {
      input: { name: '临时模板', permissions: ['club:member:manage'] },
    })
    const tplId2 = (tpl2.body.data as { id: string }).id
    const diff2 = await invokeHandler('/api/admin/config/permission-templates/:templateId/diff', 'get', `/api/admin/config/permission-templates/${tplId2}/diff`)
    expect((diff2.body.data as { previewVersion: number }).previewVersion).toBe(1)
  })

  it('显式 resetSharedState：发布污染后平台域共享状态还原到种子', async () => {
    // 发布保留策略（污染 retentionPolicies + retentionPreviewVersion）
    const created = await invokeHandler('/api/admin/retention', 'post', '/api/admin/retention', {
      input: { scope: '过期面试记录', retentionDays: 180, action: 'auto_delete' },
    })
    const policyId = (created.body.data as { id: string }).id
    const pv = await invokeHandler('/api/admin/retention/:policyId/preview', 'get', `/api/admin/retention/${policyId}/preview`)
    const previewVersion = (pv.body.data as { previewVersion: number }).previewVersion
    const published = await invokeHandler('/api/admin/retention/:policyId/publish', 'post', `/api/admin/retention/${policyId}/publish`, {
      input: { reason: '清理过期面试数据，控制存储成本', reauthProof: await reauth(), previewVersion },
    })
    expect(published.statusCode, JSON.stringify(published.body)).toBe(200)
    // 发布权限模板（污染 permissionTemplates + templatePreviewVersion）
    const tpl = await invokeHandler('/api/admin/config/permission-templates', 'post', '/api/admin/config/permission-templates', {
      input: { name: '宣传组模板', permissions: ['club:announce:manage'] },
    })
    const tplId = (tpl.body.data as { id: string }).id
    const diff = await invokeHandler('/api/admin/config/permission-templates/:templateId/diff', 'get', `/api/admin/config/permission-templates/${tplId}/diff`)
    const tplPublished = await invokeHandler('/api/admin/config/permission-templates/:templateId/publish', 'post', `/api/admin/config/permission-templates/${tplId}/publish`, {
      input: { reason: '发布宣传组模板，统一权限口径', reauthProof: await reauth(), previewVersion: (diff.body.data as { previewVersion: number }).previewVersion },
    })
    expect(tplPublished.statusCode, JSON.stringify(tplPublished.body)).toBe(200)

    resetSharedState()

    const retention = await invokeHandler('/api/admin/retention', 'get', '/api/admin/retention')
    expect((retention.body.data as { policies: unknown[] }).policies).toHaveLength(3)
    const tpls = await invokeHandler('/api/admin/config/permission-templates', 'get', '/api/admin/config/permission-templates')
    expect((tpls.body.data as { items: unknown[] }).items).toHaveLength(3)
  })
})
