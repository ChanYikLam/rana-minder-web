/**
 * 治理安全（P1-011）：13 类高风险命令目录 + GOV-006 异常访问检测 + GOV-002 真实数据开关
 *
 * 高风险命令重认证契约（mock 实现）：
 * - 每类命令在 HIGH_RISK_COMMANDS 中登记，端点处理时通过 assertHighRisk() 统一校验
 *   ① 命令已登记且启用；② 重认证 proof 有效且未被消费（一次性凭证）；
 *   ③ 原因必填（reason ≥ 5 字）；④ 全部成功执行写入审计日志
 * - 与既有 5 类（保留策略发布/执行、权限模板发布、正式删除执行）保持同一 proof 机制
 *
 * GOV-006 异常访问检测：敏感端点访问事件采集（403 拒绝、短时高频、跨域访问），
 * 触发阈值后生成异常事件并写审计日志；超管可查询 /api/admin/governance/anomaly-access
 *
 * GOV-002 真实数据开关：演示数据 → 真实数据切换为高风险命令（real_data_switch），
 * 开启需重认证 + 原因；关闭（回到演示数据）无需重认证但写审计日志
 */

import { writeAuditLog } from './db-audit'

// ============ 重认证 proof 机制（index.ts 与 recruitment-api.ts 共享） ============

/** 重认证 proof 有效期（一次性凭证，高风险操作校验后即消费） */
export const REAUTH_TTL_MS = 10 * 60 * 1000
const reauthProofs = new Map<string, { userId: string; expiresAt: number }>()

export function issueReauthProof(userId: string): { proof: string; expiresAt: string } {
  const proof = `reauth-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const expiresAt = Date.now() + REAUTH_TTL_MS
  reauthProofs.set(proof, { userId, expiresAt })
  return { proof, expiresAt: new Date(expiresAt).toISOString() }
}

export function consumeReauthProof(proof: unknown, operatorId: string | undefined | null): boolean {
  if (typeof proof !== 'string') return false
  const record = reauthProofs.get(proof)
  if (!operatorId || !record || record.userId !== operatorId || record.expiresAt <= Date.now()) return false
  reauthProofs.delete(proof)
  return true
}

/**
 * 高风险命令统一门禁：① 命令已登记且 enforced；② proof 有效（一次性消费）；③ reason ≥ 5 字。
 * 返回 null 表示通过；否则返回错误信封（401 需重认证 / 422 原因缺失）。
 */
export function assertHighRisk(
  commandKey: HighRiskCommandKey,
  input: { reauthProof?: string; reason?: string } | undefined,
  operatorId: string | undefined | null,
): { statusCode: number; body: Record<string, unknown> } | null {
  const cmd = findHighRiskCommand(commandKey)
  if (!cmd.enforced) return null // 灰度：停用门禁时仅放行（调用方仍应写审计日志）
  if (!consumeReauthProof(input?.reauthProof, operatorId)) {
    return { statusCode: 401, body: { code: 'IFC-ERR-002', message: '请重新验证身份' } }
  }
  if (!input?.reason || input.reason.trim().length < 5) {
    return { statusCode: 422, body: { code: 'IFC-ERR-005', message: '高风险操作必须填写原因（至少 5 字）' } }
  }
  return null
}

// ============ 13 类高风险命令目录 ============

export type HighRiskCommandKey =
  | 'retention_publish'        // 1. 保留策略发布
  | 'retention_execute'        // 2. 保留策略执行
  | 'formal_delete'            // 3. 正式删除执行
  | 'permission_template_publish' // 4. 权限模板发布
  | 'club_force_suspend'       // 5. 社团紧急停用
  | 'club_disconnect'          // 6. 解除接入
  | 'batch_execute'            // 7. 批量执行（成员/候选人批量操作）
  | 'joint_force_close'        // 8. 联合活动强制关闭
  | 'recruitment_force_complete' // 9. 招新活动强制结束
  | 'export_download'          // 10. 导出文件下载（含联系方式等敏感字段）
  | 'member_remove'            // 11. 移除成员
  | 'transition_execute'       // 12. 换届执行
  | 'real_data_switch'         // 13. 真实数据开关开启

export interface HighRiskCommand {
  key: HighRiskCommandKey
  label: string
  /** 命中的端点（method + url pattern），供治理面审计与联调用 */
  endpoints: { method: 'post' | 'get'; url: string }[]
  /** 是否启用重认证门禁（停用后仅记录不拦截——治理面灰度能力） */
  enforced: boolean
}

/** 13 类高风险命令注册表：enforced=false 时端点放行但写治理事件（灰度/演练场景） */
export const HIGH_RISK_COMMANDS: HighRiskCommand[] = [
  { key: 'retention_publish', label: '保留策略发布', enforced: true,
    endpoints: [{ method: 'post', url: '/api/admin/retention/:policyId/publish' }] },
  { key: 'retention_execute', label: '保留策略执行', enforced: true,
    endpoints: [{ method: 'post', url: '/api/admin/retention/execute' }] },
  { key: 'formal_delete', label: '正式删除执行', enforced: true,
    endpoints: [{ method: 'post', url: '/api/admin/delete/execute' }] },
  { key: 'permission_template_publish', label: '权限模板发布', enforced: true,
    endpoints: [{ method: 'post', url: '/api/admin/config/permission-templates/:templateId/publish' }] },
  { key: 'club_force_suspend', label: '社团紧急停用', enforced: true,
    endpoints: [{ method: 'post', url: '/api/admin/clubs/:clubId/force-suspend' }] },
  { key: 'club_disconnect', label: '解除接入', enforced: true,
    endpoints: [{ method: 'post', url: '/api/admin/clubs/:clubId/disconnect' }] },
  { key: 'batch_execute', label: '批量执行', enforced: true,
    endpoints: [{ method: 'post', url: '/api/org/:clubId/batch/execute' }] },
  { key: 'joint_force_close', label: '联合活动强制关闭', enforced: true,
    endpoints: [{ method: 'post', url: '/api/admin/joint/:jointId/force-close' }] },
  { key: 'recruitment_force_complete', label: '招新活动强制结束', enforced: true,
    endpoints: [{ method: 'post', url: '/api/admin/recruitment/:activityId/force-complete' }] },
  { key: 'export_download', label: '导出文件下载', enforced: true,
    endpoints: [
      { method: 'post', url: '/api/admin/exports/:id/download' },
      { method: 'post', url: '/api/org/:clubId/exports/:id/download' },
    ] },
  { key: 'member_remove', label: '移除成员', enforced: true,
    endpoints: [{ method: 'post', url: '/api/org/:clubId/members/exit' }] },
  { key: 'transition_execute', label: '换届执行', enforced: true,
    endpoints: [{ method: 'post', url: '/api/org/:clubId/members/transition' }] },
  { key: 'real_data_switch', label: '真实数据开关', enforced: true,
    endpoints: [{ method: 'post', url: '/api/admin/governance/real-data' }] },
]

export function findHighRiskCommand(key: HighRiskCommandKey): HighRiskCommand {
  const cmd = HIGH_RISK_COMMANDS.find((c) => c.key === key)
  if (!cmd) throw new Error(`高风险命令未登记: ${key}`)
  return cmd
}

// ============ GOV-002 真实数据开关 ============

export interface RealDataSwitchState {
  /** false=演示数据（默认）；true=真实数据 */
  useRealData: boolean
  updatedAt: string | null
  updatedBy: string | null
  auditRef: string | null
}

const realDataSwitch: RealDataSwitchState = {
  useRealData: false,
  updatedAt: null,
  updatedBy: null,
  auditRef: null,
}

export function getRealDataSwitch(): RealDataSwitchState {
  return { ...realDataSwitch }
}

export function setRealDataSwitch(useRealData: boolean, actorName: string): RealDataSwitchState {
  realDataSwitch.useRealData = useRealData
  realDataSwitch.updatedAt = new Date().toISOString()
  realDataSwitch.updatedBy = actorName
  realDataSwitch.auditRef = 'GOV-' + Date.now()
  return { ...realDataSwitch }
}

// ============ OIDC 安全配置 ============

export interface OidcSecurityConfig {
  issuer: string
  clientId: string
  callbackUrl: string
  /** 会话有效期（分钟） */
  sessionTtlMinutes: number
  /** 是否强制 MFA */
  mfaRequired: boolean
  /** 允许的时钟偏移（秒） */
  clockSkewSeconds: number
  /** 是否强制校验 state/nonce（防 CSRF/重放） */
  enforceStateNonce: boolean
  /** 敏感操作会话提级（重认证）有效期（分钟） */
  stepUpTtlMinutes: number
  updatedAt: string
}

const oidcConfig: OidcSecurityConfig = {
  issuer: 'https://casdoor.example.edu.cn',
  clientId: 'ranaminder-web',
  callbackUrl: 'https://ranaminder.example.edu.cn/auth/callback',
  sessionTtlMinutes: 120,
  mfaRequired: true,
  clockSkewSeconds: 60,
  enforceStateNonce: true,
  stepUpTtlMinutes: 10,
  updatedAt: new Date().toISOString(),
}

export function getOidcConfig(): OidcSecurityConfig {
  return { ...oidcConfig }
}

export function updateOidcConfig(patch: Partial<OidcSecurityConfig>): OidcSecurityConfig {
  Object.assign(oidcConfig, patch, { updatedAt: new Date().toISOString() })
  return { ...oidcConfig }
}

// ============ GOV-006 异常访问检测 ============

export type AnomalyKind = 'forbidden_attempt' | 'rate_burst' | 'cross_scope_attempt'

export interface AccessEvent {
  actorId: string
  actorName: string
  method: string
  path: string
  outcome: 'allowed' | 'forbidden' | 'rejected'
  at: number
}

export interface AnomalyAlert {
  id: string
  kind: AnomalyKind
  actorId: string
  actorName: string
  path: string
  /** 触发详情（如 10 分钟内 403 次数） */
  detail: string
  detectedAt: string
  status: 'open' | 'acknowledged'
}

/** 访问事件环形缓冲（mock 内存实现，上限 500 条防无限增长） */
const accessEvents: AccessEvent[] = []
const ACCESS_EVENT_LIMIT = 500
/** 检测窗口：10 分钟 */
const ANOMALY_WINDOW_MS = 10 * 60 * 1000
/** 窗口内 403 达到该次数即告警 */
const FORBIDDEN_THRESHOLD = 3

const anomalyAlerts: AnomalyAlert[] = []
let anomalySeq = 0

/** 采集访问事件并即时检测（GOV-006）。
 * 403 触发 forbidden_attempt；同 actor 窗口内 403 次数达到阈值触发 rate_burst 汇总告警。 */
export function trackAccessEvent(event: AccessEvent): AnomalyAlert | null {
  accessEvents.unshift(event)
  if (accessEvents.length > ACCESS_EVENT_LIMIT) accessEvents.length = ACCESS_EVENT_LIMIT

  if (event.outcome !== 'forbidden') return null

  anomalySeq += 1
  const alert: AnomalyAlert = {
    id: 'anomaly-' + anomalySeq,
    kind: 'forbidden_attempt',
    actorId: event.actorId,
    actorName: event.actorName,
    path: event.path,
    detail: `${event.actorName} 无权限访问 ${event.method} ${event.path} 被拒绝`,
    detectedAt: new Date().toISOString(),
    status: 'open',
  }
  anomalyAlerts.unshift(alert)
  writeAuditLog({
    actorName: '系统',
    action: '异常访问检测',
    targetType: '访问安全',
    targetId: alert.id,
    detail: alert.detail,
    scope: 'platform',
  })

  // 窗口内同 actor 403 聚合成 rate_burst（≥ 阈值时告警一次）
  const windowStart = event.at - ANOMALY_WINDOW_MS
  const recent403 = accessEvents.filter(
    (e) => e.actorId === event.actorId && e.outcome === 'forbidden' && e.at >= windowStart,
  )
  if (recent403.length === FORBIDDEN_THRESHOLD) {
    anomalySeq += 1
    const burst: AnomalyAlert = {
      id: 'anomaly-' + anomalySeq,
      kind: 'rate_burst',
      actorId: event.actorId,
      actorName: event.actorName,
      path: event.path,
      detail: `${event.actorName} 在 10 分钟内 ${FORBIDDEN_THRESHOLD} 次无权限访问被拒绝，疑似异常访问`,
      detectedAt: new Date().toISOString(),
      status: 'open',
    }
    anomalyAlerts.unshift(burst)
    writeAuditLog({
      actorName: '系统',
      action: '异常访问告警',
      targetType: '访问安全',
      targetId: burst.id,
      detail: burst.detail,
      scope: 'platform',
    })
  }
  return alert
}

export function listAnomalyAlerts(): AnomalyAlert[] {
  return [...anomalyAlerts]
}

export function acknowledgeAnomaly(id: string, actorName: string): AnomalyAlert | null {
  const alert = anomalyAlerts.find((a) => a.id === id)
  if (!alert) return null
  alert.status = 'acknowledged'
  writeAuditLog({
    actorName,
    action: '确认异常访问告警',
    targetType: '访问安全',
    targetId: id,
    detail: `确认告警：${alert.detail}`,
    scope: 'platform',
  })
  return alert
}

/** 测试用：复位治理模块全部内存状态 */
export function resetGovernanceState(): void {
  accessEvents.length = 0
  anomalyAlerts.length = 0
  anomalySeq = 0
  reauthProofs.clear()
  realDataSwitch.useRealData = false
  realDataSwitch.updatedAt = null
  realDataSwitch.updatedBy = null
  realDataSwitch.auditRef = null
  HIGH_RISK_COMMANDS.forEach((c) => { c.enforced = true })
}
