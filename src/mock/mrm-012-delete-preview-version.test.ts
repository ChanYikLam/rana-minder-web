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

const previewPattern = '/api/admin/delete/preview'
const executePattern = '/api/admin/delete/execute'

async function reauth(): Promise<string> {
  const out = await invokeHandler('/api/auth/reauth', 'post', '/api/auth/reauth')
  expect(out.statusCode).toBe(200)
  return (out.body.data as { proof: string }).proof
}

async function getPreviewVersion(): Promise<number> {
  const out = await invokeHandler(previewPattern, 'get', previewPattern)
  expect(out.statusCode).toBe(200)
  return (out.body.data as { previewVersion: number }).previewVersion
}

async function executeWith(version: number): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return invokeHandler(executePattern, 'post', executePattern, {
    input: { targetIds: ['act-003'], reason: '清理过期活动数据', reauthProof: await reauth(), previewVersion: version },
  })
}

/** MRM-012 回归：删除执行不得硬编码 previewVersion===4 魔法数——
 * 版本号应来自删除预览的动态返回值：传 3/4/5 等任意魔法数一律 409，只有传当前版本号才可通过；
 * 执行成功后版本递增，旧版本号再次执行被拒，reset 后还原。 */
describe('MRM-012 删除执行 previewVersion 动态校验', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
    resetNotifications()
    resetCorrections()
    resetAuditLogs()
    resetSharedState()
    resolveMockUser('/api/auth/session?_mock_user=admin')
  })

  it('删除预览返回动态 previewVersion，连续 GET 幂等且不等于固定魔法数 4', async () => {
    const v1 = await getPreviewVersion()
    const v2 = await getPreviewVersion()
    expect(v1).toBe(v2)
    // 初始版本号由状态变量决定（1），不再硬编码返回 4
    expect(v1).not.toBe(4)
  })

  it('初始版本下依次传 3/4/5 魔法数，全部被拒（409）', async () => {
    const current = await getPreviewVersion()
    for (const magic of [3, 4, 5]) {
      if (magic === current) continue // 当前版本号本身不在此场景（初始为 1）
      const out = await executeWith(magic)
      expect(out.statusCode, `传 ${magic} 应 409`).toBe(409)
    }
  })

  it('传当前预览版本号执行成功，成功后版本递增，旧版本号再次执行被拒（409）', async () => {
    const current = await getPreviewVersion()

    const ok = await executeWith(current)
    expect(ok.statusCode, JSON.stringify(ok.body)).toBe(200)

    const next = await getPreviewVersion()
    expect(next).toBe(current + 1)

    // 用执行前的旧版本号再次执行 → 版本不匹配 → 409
    const stale = await executeWith(current)
    expect(stale.statusCode).toBe(409)
  })

  it('resetSharedState 后删除预览版本号还原为初始值', async () => {
    const current = await getPreviewVersion()
    await executeWith(current)
    expect(await getPreviewVersion()).toBe(current + 1)

    resetSharedState()
    resolveMockUser('/api/auth/session?_mock_user=admin')
    expect(await getPreviewVersion()).toBe(1)
  })
})
