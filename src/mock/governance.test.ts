import { describe, expect, it, beforeEach } from 'vitest'
import handlers from './index'
import { resolveMockUser, clearMockSession } from './auth'
import { resetRecruitmentDB, resetNotifications, resetCorrections, resetAuditLogs, resetGovernance, resetOrgDb } from './reset'
import { auditLogsDb } from './db-audit'

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

async function reauthAs(user: string): Promise<string> {
  const out = await invokeHandler('/api/auth/reauth', 'post', `/api/auth/reauth?_mock_user=${user}`)
  expect(out.statusCode).toBe(200)
  return (out.body.data as { proof: string }).proof
}

/** P1-011：治理安全机制——13 类高风险命令重认证 + GOV-006 异常访问检测 + GOV-002 真实数据开关 + OIDC 安全配置 */
describe('P1-011 治理安全机制', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
    resetNotifications()
    resetCorrections()
    resetAuditLogs()
    resetGovernance()
    resetOrgDb()
  })

  describe('高风险命令目录（13/13 覆盖）', () => {
    it('登记 13 类高风险命令且全部启用重认证门禁', async () => {
      resolveMockUser('/api/auth/session?_mock_user=admin')
      const out = await invokeHandler('/api/admin/governance/high-risk-commands', 'get', '/api/admin/governance/high-risk-commands?_mock_user=admin')
      expect(out.statusCode).toBe(200)
      const data = out.body.data as { items: { key: string; label: string; enforced: boolean }[]; total: number; enforcedCount: number }
      expect(data.total).toBe(13)
      expect(data.enforcedCount).toBe(13)
      const keys = data.items.map((i) => i.key)
      // 既有 5 类
      expect(keys).toContain('retention_publish')
      expect(keys).toContain('retention_execute')
      expect(keys).toContain('formal_delete')
      expect(keys).toContain('permission_template_publish')
      // P1-011 补齐 8 类
      expect(keys).toContain('club_force_suspend')
      expect(keys).toContain('club_disconnect')
      expect(keys).toContain('batch_execute')
      expect(keys).toContain('joint_force_close')
      expect(keys).toContain('recruitment_force_complete')
      expect(keys).toContain('export_download')
      expect(keys).toContain('member_remove')
      expect(keys).toContain('transition_execute')
      expect(keys).toContain('real_data_switch')
    })

    it('非超管查询高风险命令目录被 403 拒绝', async () => {
      const out = await invokeHandler('/api/admin/governance/high-risk-commands', 'get', '/api/admin/governance/high-risk-commands?_mock_user=leader')
      expect(out.statusCode).toBe(403)
    })
  })

  describe('紧急停用 / 解除接入重认证', () => {
    it('紧急停用缺 proof 被 401 拒绝', async () => {
      resolveMockUser('/api/auth/session?_mock_user=admin')
      const out = await invokeHandler('/api/admin/clubs/:clubId/force-suspend', 'post', '/api/admin/clubs/club-001/force-suspend?_mock_user=admin', {
        input: { reason: '安全风险紧急处置' },
      })
      expect(out.statusCode).toBe(401)
      expect((out.body as { code: string }).code).toBe('IFC-ERR-002')
    })

    it('紧急停用：proof + 原因 → 成功并写审计日志', async () => {
      resolveMockUser('/api/auth/session?_mock_user=admin')
      const proof = await reauthAs('admin')
      const out = await invokeHandler('/api/admin/clubs/:clubId/force-suspend', 'post', '/api/admin/clubs/club-001/force-suspend?_mock_user=admin', {
        input: { reason: '安全风险紧急处置', reauthProof: proof },
      })
      expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
      expect(auditLogsDb.some((l) => l.action === '紧急停用社团' && l.targetId === 'club-001')).toBe(true)
    })

    it('解除接入缺 proof 被 401；proof 一次性消费后重放失败', async () => {
      resolveMockUser('/api/auth/session?_mock_user=admin')
      // club-005 种子状态为 sync_abnormal_ro（SM-ORG-001 允许 disconnect）
      const noProof = await invokeHandler('/api/admin/clubs/:clubId/disconnect', 'post', '/api/admin/clubs/club-005/disconnect?_mock_user=admin', {
        input: { reason: '社团长期未运营解除接入' },
      })
      expect(noProof.statusCode).toBe(401)

      const proof = await reauthAs('admin')
      const ok1 = await invokeHandler('/api/admin/clubs/:clubId/disconnect', 'post', '/api/admin/clubs/club-005/disconnect?_mock_user=admin', {
        input: { reason: '社团长期未运营解除接入', reauthProof: proof },
      })
      expect(ok1.statusCode, JSON.stringify(ok1.body)).toBe(200)
      expect(auditLogsDb.some((l) => l.action === '解除接入' && l.targetId === 'club-005')).toBe(true)

      // 同一 proof 重放（一次性消费）→ 401（门禁先于业务校验）
      const replay = await invokeHandler('/api/admin/clubs/:clubId/disconnect', 'post', '/api/admin/clubs/club-005/disconnect?_mock_user=admin', {
        input: { reason: '重放已消费的凭证', reauthProof: proof },
      })
      expect(replay.statusCode).toBe(401)
    })
  })

  describe('批量执行 / 导出下载 / 移除成员 / 换届重认证', () => {
    it('批量执行缺 proof 被 401 拒绝', async () => {
      resolveMockUser('/api/auth/session?_mock_user=leader')
      const out = await invokeHandler('/api/org/:clubId/batch/execute', 'post', '/api/org/club-001/batch/execute?_mock_user=leader', {
        input: { memberIds: ['m1'], action: 'mark_read', reason: '批量处理候选人' },
      })
      expect(out.statusCode).toBe(401)
    })

    it('批量执行：proof + 原因 → 成功并写审计日志', async () => {
      resolveMockUser('/api/auth/session?_mock_user=leader')
      const proof = await reauthAs('leader')
      const out = await invokeHandler('/api/org/:clubId/batch/execute', 'post', '/api/org/club-001/batch/execute?_mock_user=leader', {
        input: { memberIds: ['m1'], action: 'mark_read', reason: '批量处理候选人', reauthProof: proof },
      })
      expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
      expect(auditLogsDb.some((l) => l.action === '批量执行')).toBe(true)
    })

    it('平台导出下载缺 proof 被 401 拒绝', async () => {
      resolveMockUser('/api/auth/session?_mock_user=admin')
      const out = await invokeHandler('/api/admin/exports/:id/download', 'post', '/api/admin/exports/exp-001/download?_mock_user=admin', {
        input: { reason: '合规备案需要下载' },
      })
      expect(out.statusCode).toBe(401)
    })

    it('平台导出下载：proof + 原因 → 成功并写审计日志', async () => {
      resolveMockUser('/api/auth/session?_mock_user=admin')
      const proof = await reauthAs('admin')
      const out = await invokeHandler('/api/admin/exports/:id/download', 'post', '/api/admin/exports/exp-001/download?_mock_user=admin', {
        input: { reason: '合规备案需要下载', reauthProof: proof },
      })
      expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
      expect(auditLogsDb.some((l) => l.action === '导出文件下载' && l.targetId === 'exp-001')).toBe(true)
    })

    it('移除成员缺 proof 被 401；原因不足 5 字被 422', async () => {
      resolveMockUser('/api/auth/session?_mock_user=leader')
      const noProof = await invokeHandler('/api/org/:clubId/members/exit', 'post', '/api/org/club-001/members/exit?_mock_user=leader', {
        input: { memberId: 'mem-001', reason: '违规移除该成员' },
      })
      expect(noProof.statusCode).toBe(401)

      const proof = await reauthAs('leader')
      const shortReason = await invokeHandler('/api/org/:clubId/members/exit', 'post', '/api/org/club-001/members/exit?_mock_user=leader', {
        input: { memberId: 'mem-001', reason: '违规', reauthProof: proof },
      })
      expect(shortReason.statusCode).toBe(422)
    })

    it('换届执行缺 proof 被 401 拒绝', async () => {
      resolveMockUser('/api/auth/session?_mock_user=leader')
      const out = await invokeHandler('/api/org/:clubId/members/transition', 'post', '/api/org/club-001/members/transition?_mock_user=leader', {
        input: { reason: '学年末例行换届' },
      })
      expect(out.statusCode).toBe(401)
    })
  })

  describe('GOV-006 异常访问检测', () => {
    it('403 拒绝生成 forbidden_attempt 告警并写审计日志', async () => {
      // leader 无 platform:config:manage → 访问高风险命令目录被 403 并采集
      const out = await invokeHandler('/api/admin/governance/high-risk-commands', 'get', '/api/admin/governance/high-risk-commands?_mock_user=leader')
      expect(out.statusCode).toBe(403)

      resolveMockUser('/api/auth/session?_mock_user=admin')
      const alerts = await invokeHandler('/api/admin/governance/anomaly-access', 'get', '/api/admin/governance/anomaly-access?_mock_user=admin')
      expect(alerts.statusCode).toBe(200)
      const data = alerts.body.data as { items: { kind: string; actorName: string }[] }
      expect(data.items.some((a) => a.kind === 'forbidden_attempt' && a.actorName === '张明远')).toBe(true)
      expect(auditLogsDb.some((l) => l.action === '异常访问检测')).toBe(true)
    })

    it('10 分钟内 3 次 403 触发 rate_burst 汇总告警', async () => {
      for (let i = 0; i < 3; i++) {
        await invokeHandler('/api/admin/governance/high-risk-commands', 'get', '/api/admin/governance/high-risk-commands?_mock_user=leader')
      }
      resolveMockUser('/api/auth/session?_mock_user=admin')
      const alerts = await invokeHandler('/api/admin/governance/anomaly-access', 'get', '/api/admin/governance/anomaly-access?_mock_user=admin')
      const data = alerts.body.data as { items: { kind: string }[] }
      expect(data.items.some((a) => a.kind === 'rate_burst')).toBe(true)
      expect(auditLogsDb.some((l) => l.action === '异常访问告警')).toBe(true)
    })

    it('告警可确认（ack）并写审计日志', async () => {
      await invokeHandler('/api/admin/governance/high-risk-commands', 'get', '/api/admin/governance/high-risk-commands?_mock_user=leader')
      resolveMockUser('/api/auth/session?_mock_user=admin')
      const list = await invokeHandler('/api/admin/governance/anomaly-access', 'get', '/api/admin/governance/anomaly-access?_mock_user=admin')
      const first = (list.body.data as { items: { id: string }[] }).items[0]
      const ack = await invokeHandler('/api/admin/governance/anomaly-access/:alertId/ack', 'post', `/api/admin/governance/anomaly-access/${first.id}/ack?_mock_user=admin`)
      expect(ack.statusCode).toBe(200)
      expect((ack.body.data as { status: string }).status).toBe('acknowledged')
      expect(auditLogsDb.some((l) => l.action === '确认异常访问告警')).toBe(true)
    })
  })

  describe('GOV-002 真实数据开关', () => {
    it('默认演示数据（useRealData=false）', async () => {
      const out = await invokeHandler('/api/admin/governance/real-data', 'get', '/api/admin/governance/real-data')
      expect(out.statusCode).toBe(200)
      expect((out.body.data as { useRealData: boolean }).useRealData).toBe(false)
    })

    it('开启真实数据缺 proof 被 401；proof + 原因 → 成功并写审计日志', async () => {
      resolveMockUser('/api/auth/session?_mock_user=admin')
      const noProof = await invokeHandler('/api/admin/governance/real-data', 'post', '/api/admin/governance/real-data?_mock_user=admin', {
        input: { useRealData: true, reason: '上线切换至真实数据源' },
      })
      expect(noProof.statusCode).toBe(401)

      const proof = await reauthAs('admin')
      const on = await invokeHandler('/api/admin/governance/real-data', 'post', '/api/admin/governance/real-data?_mock_user=admin', {
        input: { useRealData: true, reason: '上线切换至真实数据源', reauthProof: proof },
      })
      expect(on.statusCode, JSON.stringify(on.body)).toBe(200)
      expect((on.body.data as { useRealData: boolean }).useRealData).toBe(true)
      expect(auditLogsDb.some((l) => l.action === '开启真实数据')).toBe(true)
    })

    it('切回演示数据无需 proof 但需原因并写审计日志', async () => {
      resolveMockUser('/api/auth/session?_mock_user=admin')
      const proof = await reauthAs('admin')
      await invokeHandler('/api/admin/governance/real-data', 'post', '/api/admin/governance/real-data?_mock_user=admin', {
        input: { useRealData: true, reason: '上线切换至真实数据源', reauthProof: proof },
      })
      const off = await invokeHandler('/api/admin/governance/real-data', 'post', '/api/admin/governance/real-data?_mock_user=admin', {
        input: { useRealData: false, reason: '回滚至演示数据演练' },
      })
      expect(off.statusCode, JSON.stringify(off.body)).toBe(200)
      expect((off.body.data as { useRealData: boolean }).useRealData).toBe(false)
      expect(auditLogsDb.some((l) => l.action === '关闭真实数据')).toBe(true)
    })

    it('非超管切换真实数据开关被 403 拒绝', async () => {
      const out = await invokeHandler('/api/admin/governance/real-data', 'post', '/api/admin/governance/real-data?_mock_user=leader', {
        input: { useRealData: true, reason: '尝试越权切换数据源' },
      })
      expect(out.statusCode).toBe(403)
    })
  })

  describe('OIDC 安全配置', () => {
    it('GET 返回默认 OIDC 配置', async () => {
      resolveMockUser('/api/auth/session?_mock_user=admin')
      const out = await invokeHandler('/api/admin/security/oidc', 'get', '/api/admin/security/oidc?_mock_user=admin')
      expect(out.statusCode).toBe(200)
      const cfg = out.body.data as { issuer: string; sessionTtlMinutes: number; mfaRequired: boolean; enforceStateNonce: boolean }
      expect(cfg.issuer).toContain('casdoor')
      expect(cfg.sessionTtlMinutes).toBe(120)
      expect(cfg.mfaRequired).toBe(true)
      expect(cfg.enforceStateNonce).toBe(true)
    })

    it('更新缺 proof 被 401；非法 TTL 被 422；合法更新写审计日志', async () => {
      resolveMockUser('/api/auth/session?_mock_user=admin')
      const noProof = await invokeHandler('/api/admin/security/oidc', 'post', '/api/admin/security/oidc?_mock_user=admin', {
        input: { sessionTtlMinutes: 60, reason: '缩短会话有效期提升安全' },
      })
      expect(noProof.statusCode).toBe(401)

      const proof1 = await reauthAs('admin')
      const badTtl = await invokeHandler('/api/admin/security/oidc', 'post', '/api/admin/security/oidc?_mock_user=admin', {
        input: { sessionTtlMinutes: 99999, reason: '非法 TTL 应被拒绝', reauthProof: proof1 },
      })
      expect(badTtl.statusCode).toBe(422)

      const proof2 = await reauthAs('admin')
      const ok = await invokeHandler('/api/admin/security/oidc', 'post', '/api/admin/security/oidc?_mock_user=admin', {
        input: { sessionTtlMinutes: 60, mfaRequired: true, reason: '缩短会话有效期提升安全', reauthProof: proof2 },
      })
      expect(ok.statusCode, JSON.stringify(ok.body)).toBe(200)
      expect((ok.body.data as { sessionTtlMinutes: number }).sessionTtlMinutes).toBe(60)
      expect(auditLogsDb.some((l) => l.action === '更新 OIDC 安全配置')).toBe(true)
    })

    it('非超管查询/更新 OIDC 配置被 403 拒绝', async () => {
      const get = await invokeHandler('/api/admin/security/oidc', 'get', '/api/admin/security/oidc?_mock_user=leader')
      expect(get.statusCode).toBe(403)
      const post = await invokeHandler('/api/admin/security/oidc', 'post', '/api/admin/security/oidc?_mock_user=leader', {
        input: { sessionTtlMinutes: 60, reason: '越权修改安全配置' },
      })
      expect(post.statusCode).toBe(403)
    })
  })
})
