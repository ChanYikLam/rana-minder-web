import { describe, expect, it, beforeEach } from 'vitest'
import handlers from './index'
import { resolveMockUser, clearMockSession } from './auth'
import { resetRecruitmentDB, resetNotifications, resetCorrections, resetAuditLogs, resetSharedState } from './reset'

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

const retentionUrl = '/api/admin/retention'
const previewPattern = '/api/admin/retention/:policyId/preview'
const publishPattern = '/api/admin/retention/:policyId/publish'
const tplPattern = '/api/admin/config/permission-templates'
const diffPattern = '/api/admin/config/permission-templates/:templateId/diff'
const publishTplPattern = '/api/admin/config/permission-templates/:templateId/publish'

async function reauth(): Promise<string> {
  const out = await invokeHandler('/api/auth/reauth', 'post', '/api/auth/reauth')
  expect(out.statusCode).toBe(200)
  return (out.body.data as { proof: string }).proof
}

/** MRM-011 回归：GET 预览端点必须幂等——连续两次 GET preview/diff 不得自增 previewVersion；
 * 版本号仅在数据实际变化（发布成功）后递增，且递增后的值可被后续发布校验通过。 */
describe('MRM-011 GET 预览端点幂等性', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
    resetNotifications()
    resetCorrections()
    resetAuditLogs()
    resetSharedState()
    resolveMockUser('/api/auth/session?_mock_user=admin')
  })

  it('连续两次 GET 保留策略 preview，previewVersion 保持不变（幂等）', async () => {
    const created = await invokeHandler(retentionUrl, 'post', retentionUrl, {
      input: { scope: '过期面试记录', retentionDays: 180, action: 'auto_delete' },
    })
    const policyId = (created.body.data as { id: string }).id

    const first = await invokeHandler(previewPattern, 'get', `${retentionUrl}/${policyId}/preview`)
    const second = await invokeHandler(previewPattern, 'get', `${retentionUrl}/${policyId}/preview`)
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    const v1 = (first.body.data as { previewVersion: number }).previewVersion
    const v2 = (second.body.data as { previewVersion: number }).previewVersion
    expect(v1).toBe(v2)
  })

  it('连续两次 GET 权限模板 diff，previewVersion 保持不变（幂等）', async () => {
    const tpl = await invokeHandler(tplPattern, 'post', tplPattern, {
      input: { name: '宣传组模板', permissions: ['club:announce:manage'] },
    })
    const tplId = (tpl.body.data as { id: string }).id

    const first = await invokeHandler(diffPattern, 'get', `${tplPattern}/${tplId}/diff`)
    const second = await invokeHandler(diffPattern, 'get', `${tplPattern}/${tplId}/diff`)
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    const v1 = (first.body.data as { previewVersion: number }).previewVersion
    const v2 = (second.body.data as { previewVersion: number }).previewVersion
    expect(v1).toBe(v2)
  })

  it('发布成功后 previewVersion 才递增，且旧版本号发布被拒绝（409）', async () => {
    // 保留策略：预览 → 发布（版本递增）→ 用旧版本号再次发布 → 409
    const created = await invokeHandler(retentionUrl, 'post', retentionUrl, {
      input: { scope: '过期面试记录', retentionDays: 180, action: 'auto_delete' },
    })
    const policyId = (created.body.data as { id: string }).id
    const pv = await invokeHandler(previewPattern, 'get', `${retentionUrl}/${policyId}/preview`)
    const previewVersion = (pv.body.data as { previewVersion: number }).previewVersion

    const published = await invokeHandler(publishPattern, 'post', `${retentionUrl}/${policyId}/publish`, {
      input: { reason: '清理过期面试数据', reauthProof: await reauth(), previewVersion },
    })
    expect(published.statusCode, JSON.stringify(published.body)).toBe(200)

    // 发布后策略变 active 不可再预览；新建草稿预览，版本号应等于旧版本 + 1（发布使数据变化）
    const created2 = await invokeHandler(retentionUrl, 'post', retentionUrl, {
      input: { scope: '过期活动数据', retentionDays: 90, action: 'archive' },
    })
    const policyId2 = (created2.body.data as { id: string }).id
    const after = await invokeHandler(previewPattern, 'get', `${retentionUrl}/${policyId2}/preview`)
    expect(after.statusCode).toBe(200)
    const afterVersion = (after.body.data as { previewVersion: number }).previewVersion
    expect(afterVersion).toBe(previewVersion + 1)

    // 用旧版本号发布新草稿 → 版本不匹配 → 409
    const stale = await invokeHandler(publishPattern, 'post', `${retentionUrl}/${policyId2}/publish`, {
      input: { reason: '使用过期版本号', reauthProof: await reauth(), previewVersion },
    })
    expect(stale.statusCode).toBe(409)
  })

  it('发布权限模板后版本递增：旧版本号发布新草稿被拒绝（409）', async () => {
    const tpl = await invokeHandler(tplPattern, 'post', tplPattern, {
      input: { name: '宣传组模板', permissions: ['club:announce:manage'] },
    })
    const tplId = (tpl.body.data as { id: string }).id
    const diff = await invokeHandler(diffPattern, 'get', `${tplPattern}/${tplId}/diff`)
    const tplPreviewVersion = (diff.body.data as { previewVersion: number }).previewVersion

    const published = await invokeHandler(publishTplPattern, 'post', `${tplPattern}/${tplId}/publish`, {
      input: { reason: '发布宣传组模板', reauthProof: await reauth(), previewVersion: tplPreviewVersion },
    })
    expect(published.statusCode, JSON.stringify(published.body)).toBe(200)

    const tpl2 = await invokeHandler(tplPattern, 'post', tplPattern, {
      input: { name: '临时模板', permissions: ['club:member:manage'] },
    })
    const tplId2 = (tpl2.body.data as { id: string }).id
    const stale = await invokeHandler(publishTplPattern, 'post', `${tplPattern}/${tplId2}/publish`, {
      input: { reason: '使用过期版本号', reauthProof: await reauth(), previewVersion: tplPreviewVersion },
    })
    expect(stale.statusCode).toBe(409)
  })
})
