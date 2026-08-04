/**
 * 招新（REC）+ 联合（JNT）+ 邀请（INV）API 处理器注册层
 * 数据源与业务规则：src/mock/db-recruitment.ts（有状态，状态机由 db 层 assertTransition 把关）
 * 权限边界：社团管理操作需 club:recruitment:manage / club:joint:manage；
 *          面试官操作需 club:interview:view|evaluate；平台强制操作需 platform:delete:execute
 * 响应约定：vite-plugin-mock 不会把返回对象里的 statusCode 转为 HTTP 状态码，
 *          故统一用 rawResponse 直出：错误信封 { statusCode, body } → 真实 HTTP 状态 + 标准错误体
 */
import type { MockMethod } from './types'
// Node HTTP types via any (mock layer, no @types/node in remote baseline)
type RawReq = any
type RawRes = any
import { resolveMockUser, getPermissions, getWorkspace, USER_MEMBER_MAP, USER_APPLICANT_MAP, mockUsers } from './auth'
import { pushNotifications, userIdOfApplicant, userIdOfMember, userIdOfName } from './notifications'
import * as rdb from './db-recruitment'
import * as db from './db'

/** 错误信封类型 */
interface ErrorEnvelope {
  statusCode: number
  body: Record<string, unknown>
}

function isErrorEnvelope(v: unknown): v is ErrorEnvelope {
  return !!v && typeof v === 'object' && 'statusCode' in v && typeof (v as ErrorEnvelope).statusCode === 'number'
}

/** 读取请求体（rawResponse 下自行解析） */
async function readBody(req: RawReq): Promise<unknown> {
  const chunks: any[] = []
  for await (const chunk of req) chunks.push(chunk)
  const buf = (globalThis as any).Buffer
  const text = buf ? buf.concat(chunks).toString('utf8') : new TextDecoder().decode(new Uint8Array(chunks.flatMap((c: any) => Array.from(c))))
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

/** 从 URL 提取路径参数与查询参数（rawResponse 下自行合并） */
function splitParams(url: string): { query: Record<string, string>; pathname: string } {
  try {
    const u = new URL(url, 'http://localhost')
    const query: Record<string, string> = {}
    u.searchParams.forEach((v, k) => (query[k] = v))
    return { query, pathname: u.pathname }
  } catch {
    return { query: {}, pathname: url }
  }
}

function pathParamsFrom(pathname: string, pattern: string): Record<string, string> {
  const pathSegs = pathname.split('/').filter(Boolean)
  const pattSegs = pattern.split('/').filter(Boolean)
  const out: Record<string, string> = {}
  pattSegs.forEach((s, i) => {
    if (s.startsWith(':')) out[s.slice(1)] = pathSegs[i] ?? ''
  })
  return out
}

/**
 * 把 response 风格 handler 包装为 rawResponse：
 * - 合并路径参数与查询参数到 query（兼容 GET/POST 两种丢参场景）
 * - 返回错误信封时直出真实 HTTP 状态码 + 标准错误体
 */
export function withStatus(handler: MockMethod): MockMethod {
  const original = handler.response
  return {
    ...handler,
    rawResponse: async (req: RawReq, res: RawRes) => {
      try {
        const { query: rawQuery, pathname } = splitParams(req.url || '')
        const query = { ...pathParamsFrom(pathname, handler.url), ...rawQuery }
        const body = await readBody(req)
        const headers = (req.headers || {}) as Record<string, string>
        const out = (original as (r: unknown) => unknown)({ url: req.url, query, body, headers })
        res.setHeader('Content-Type', 'application/json')
        if (isErrorEnvelope(out)) {
          res.statusCode = out.statusCode
          res.end(JSON.stringify(out.body))
          return
        }
        res.statusCode = 200
        res.end(JSON.stringify(out ?? { code: 0, data: null }))
      } catch {
        res.statusCode = 500
        res.end(
          JSON.stringify({
            code: 'IFC-ERR-016',
            message: '系统出现未知错误，请稍后再试',
            supportId: `MOCK-${Date.now().toString(36).toUpperCase()}`,
          }),
        )
      }
    },
  }
}

/** 业务规则拒绝（HTTP 422 + IFC-ERR-006） */
function businessError(message: string) {
  return {
    statusCode: 422,
    body: { code: 'IFC-ERR-006', message, supportId: `MOCK-${Date.now().toString(36).toUpperCase()}` },
  }
}

/** 无权限（HTTP 403 + IFC-ERR-003） */
function forbidden() {
  return {
    statusCode: 403,
    body: { code: 'IFC-ERR-003', message: '您没有执行此操作的权限', supportId: `MOCK-${Date.now().toString(36).toUpperCase()}` },
  }
}

/** 资源不存在（HTTP 404 + IFC-ERR-015） */
function notFound(message = '请求的内容不存在或已被移除') {
  return {
    statusCode: 404,
    body: { code: 'IFC-ERR-015', message, supportId: `MOCK-${Date.now().toString(36).toUpperCase()}` },
  }
}

const ok = (data: unknown) => ({ code: 0, data })

function actorApplicantId(user: { id: string }): string | null {
  return USER_APPLICANT_MAP[user.id] || null
}

/** 社团招新管理权限 */
function canManageRec(url: string, clubId: string): boolean {
  return getPermissions(resolveMockUser(url), clubId).includes('club:recruitment:manage')
}

/** 社团联合活动管理权限；联合活动被紧急停用的社团立即失权（SM-JNT-002 force_suspended） */
function canManageJoint(url: string, clubId: string): boolean {
  if (!getPermissions(resolveMockUser(url), clubId).includes('club:joint:manage')) return false
  const m = url.match(/\/joint\/([^/]+)/)
  if (!m) return true
  const ja = rdb.findJoint(m[1])
  if (!ja) return true
  const club = ja.clubs.find((c) => c.clubId === clubId)
  return !club || club.status !== 'force_suspended'
}

/** 面试官权限（查看或评价） */
function canInterview(url: string, clubId: string): boolean {
  const perms = getPermissions(resolveMockUser(url), clubId)
  return perms.includes('club:interview:view') || perms.includes('club:interview:evaluate') || perms.includes('club:recruitment:manage')
}

/** 平台强制操作权限 */
function isPlatformAdmin(url: string): boolean {
  return getPermissions(resolveMockUser(url), '').includes('platform:delete:execute')
}

/** 兼容两种请求体约定：{ input: ... } 或平铺 */
function unwrap(body: unknown): Record<string, unknown> {
  const b = (body || {}) as Record<string, unknown>
  return (b.input && typeof b.input === 'object' ? b.input : b) as Record<string, unknown>
}

/** 统一业务函数结果响应（ok → code 0；error → 422） */
function result(r: { ok: boolean; error?: string; data?: unknown }) {
  return r.ok ? ok(r.data) : businessError(r.error || '操作不符合业务规则')
}

/** 查询候选人所用 applicantId */
function applicantIdOf(url: string): string | null {
  return actorApplicantId(resolveMockUser(url))
}

/** 当前操作者成员信息（用于评价人、确认人等署名） */
function actorInfo(url: string): { memberId: string | null; name: string; role: string } {
  const user = resolveMockUser(url)
  const ws = getWorkspace(user)
  return { memberId: USER_MEMBER_MAP[user.id] || null, name: user.name, role: ws?.role || 'member' }
}

/** 根据社团查找具备面试权限的面试官 */
function findInterviewersForClub(clubId: string): string[] {
  return Object.values(mockUsers)
    .filter((u) => u.roles.some((r) => r.clubId === clubId && (r.permissions.includes('club:interview:view') || r.permissions.includes('club:interview:evaluate'))))
    .map((u) => u.id)
}

/** 面试详情行（管理视角） */
function interviewRow(it: rdb.RecInterview) {
  const a = rdb.findAnyActivity(it.activityId)
  const app = rdb.recruitmentApplications.find((x) => x.applicantId === it.applicantId)
  const round = a?.rounds.find((r) => r.id === it.roundId)
  return {
    id: it.id, activityId: it.activityId, activityTitle: a?.title || '', roundId: it.roundId, roundName: round?.name || '',
    applicantId: it.applicantId, applicantName: app?.applicantName || it.applicantName, studentId: app?.studentId || '',
    status: it.status, slotId: it.slotId, scheduledTime: it.startAt, endTime: it.endAt,
    attendance: it.attendance,
    invalidReason: it.invalidReason, skipReason: it.skipReason, version: it.version,
  }
}

// ================= 招新活动 =================

const recHandlers: MockMethod[] = [
  // 活动详情（公开）
  {
    url: '/api/explore/activities/:id',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      const a = rdb.findAnyActivity(query.id || 'act-001')
      if (!a) return notFound('活动不存在')
      if (a.status !== 'in_progress' && a.status !== 'paused') return notFound('活动不存在或未开放')
      return ok({
        id: a.id, clubId: a.clubId, clubName: a.clubName, title: a.title, type: 'recruitment',
        status: a.status === 'in_progress' ? 'open' : a.status, channelStatus: a.channelStatus,
        deadline: a.deadline, description: a.description, departments: a.departments, formId: a.formId,
        eligibility: a.eligibility, volunteerRules: a.volunteerRules,
      })
    },
  },
// 公开报名表单（US-REC-08：与活动详情同一 rdb 数据源，仅开放状态可读）
  // 报名表单（公开）
  {
    url: '/api/explore/activities/:id/form',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      const a = rdb.findAnyActivity(query.id || 'act-001')
      if (!a) return notFound('活动不存在')
if (a.status !== 'in_progress' && a.status !== 'paused') return notFound('活动不存在或未开放')
      return ok({
        id: a.formId, clubId: a.clubId, title: '招新报名表', status: 'published',
        versions: [
          {
            version: a.formVersion, status: 'published', publishedAt: a.publishedAt || new Date().toISOString(),
            fields: [
              { id: 'f1', type: 'text', label: '自我介绍', description: '简要介绍自己的特长和兴趣', required: true, readonly: false, permission: 'read_write', options: null, conditionalFieldId: null, conditionalValue: null, arrayFieldTemplateId: null },
              { id: 'f2', type: 'select', label: '意向部门', description: null, required: true, readonly: false, permission: 'read_write', options: (a.departments || []).map((d) => d.name), conditionalFieldId: null, conditionalValue: null, arrayFieldTemplateId: null },
              { id: 'f3', type: 'textarea', label: '相关经历', description: '如有相关项目或活动经历请填写', required: false, readonly: false, permission: 'read_write', options: null, conditionalFieldId: null, conditionalValue: null, arrayFieldTemplateId: null },
              { id: 'f4', type: 'file', label: '作品附件', description: '可选，上传作品集或简历', required: false, readonly: false, permission: 'read_write', options: null, conditionalFieldId: null, conditionalValue: null, arrayFieldTemplateId: null },
            ],
          },
        ],
      })
    },
  },
  // 联合活动详情（公开）
  {
    url: '/api/explore/joint/:id',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      const j = rdb.findJoint(query.id || 'jnt-001')
      if (!j) return notFound('活动不存在')
      if (j.status !== 'published') return notFound('活动不存在或未开放')
      return ok({
        id: j.id, title: j.title, type: 'joint',
        status: j.status === 'published' ? 'open' : j.status, channelStatus: j.channelStatus,
        deadline: j.deadline, description: j.description, formId: j.formId,
        clubs: j.clubs.map((c) => ({ id: c.clubId, name: c.clubName })),
      })
    },
  },
  // 活动列表（管理视角；面试职能角色可读，创建/编辑仍限负责人与人事）
  {
    url: '/api/org/:clubId/recruitment',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId) && !canInterview(url, query.clubId)) return forbidden()
      const items = rdb.listActivities(query.clubId).map((a) => ({
        id: a.id, clubId: a.clubId, title: a.title, status: a.status, channelStatus: a.channelStatus,
        deadline: a.deadline, applicantCount: a.applicantIds.length, createdAt: a.createdAt,
      }))
      return ok({ items, nextCursor: null })
    },
  },
  // 创建活动
  {
    url: '/api/org/:clubId/recruitment',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { title: string; description?: string; deadline?: string; departments?: { id: string; name: string }[]; formId?: string }
      if (!input.title?.trim()) return businessError('活动名称不能为空')
      const clubName = resolveMockUser(url).roles.find((r) => r.clubId === query.clubId)?.clubName || query.clubId
      const r = rdb.createActivity(query.clubId, clubName, { title: input.title, description: input.description, deadline: input.deadline, departments: input.departments, formId: input.formId })
      return result(r)
    },
  },
  // 活动详情（管理视角；面试职能角色可读，更新仍限负责人与人事）
  {
    url: '/api/org/:clubId/recruitment/:activityId',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId) && !canInterview(url, query.clubId)) return forbidden()
      const a = rdb.findActivity(query.clubId, query.activityId)
      if (!a) return notFound('活动不存在')
      return ok({
        id: a.id, clubId: a.clubId, clubName: a.clubName, title: a.title, description: a.description,
        status: a.status, channelStatus: a.channelStatus, deadline: a.deadline, deadlineVersion: a.deadlineVersion,
        window: a.window, formId: a.formId, formVersion: a.formVersion, departments: a.departments,
        eligibility: a.eligibility, volunteerRules: a.volunteerRules, allowAdjustmentDefault: a.allowAdjustmentDefault,
        conclusionMode: a.conclusionMode, applicantCount: a.applicantIds.length,
        interviewCount: rdb.recruitmentInterviews.filter((i) => i.activityId === a.id).length,
        invitationCount: rdb.recruitmentInvitations.filter((i) => i.activityId === a.id).length,
        publishedAt: a.publishedAt, completedAt: a.completedAt, cancelledAt: a.cancelledAt,
        createdAt: a.createdAt, version: a.version,
      })
    },
  },
  // 更新活动
  {
    url: '/api/org/:clubId/recruitment/:activityId',
    method: 'put',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as unknown as rdb.RecActivity
      const r = rdb.updateActivity(query.activityId, input)
      return result(r)
    },
  },
  // 发布活动
  {
    url: '/api/org/:clubId/recruitment/:activityId/publish',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      return result(rdb.publishActivity(query.activityId))
    },
  },
  // 暂停活动
  {
    url: '/api/org/:clubId/recruitment/:activityId/pause',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { reason?: string }
      return result(rdb.pauseActivity(query.activityId, input.reason ?? ''))
    },
  },
  // 恢复活动
  {
    url: '/api/org/:clubId/recruitment/:activityId/resume',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      return result(rdb.resumeActivity(query.activityId))
    },
  },
  // 结束活动
  {
    url: '/api/org/:clubId/recruitment/:activityId/complete',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      return result(rdb.completeActivity(query.activityId))
    },
  },
  // 取消活动（含已接受同步任务二次确认）
  {
    url: '/api/org/:clubId/recruitment/:activityId/cancel',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { reason?: string; confirmAcceptedSync?: boolean }
      if (!input.reason?.trim()) return businessError('取消活动必须填写原因')
      return result(rdb.cancelActivity(query.activityId, input.reason, !!input.confirmAcceptedSync))
    },
  },
  // 强制结束（平台）
  {
    url: '/api/admin/recruitment/:activityId/force-complete',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!isPlatformAdmin(url)) return forbidden()
      const input = unwrap(body) as { reason?: string }
      if (!input.reason?.trim()) return businessError('强制结束必须填写原因')
      return result(rdb.forceCompleteActivity(query.activityId, input.reason))
    },
  },
  // 报名通道操作（open/close/pause/resume/reopen）
  {
    url: '/api/org/:clubId/recruitment/:activityId/channel',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { action: string; reason?: string; newDeadline?: string }
      const activityId = query.activityId
      switch (input.action) {
        case 'open':
          return result(rdb.reopenChannel(activityId, input.newDeadline || ''))
        case 'close':
          return result(rdb.closeChannel(activityId, input.reason ?? ''))
        case 'pause':
          return result(rdb.pauseChannel(activityId))
        case 'resume':
          return result(rdb.resumeChannel(activityId, input.newDeadline || ''))
        case 'reopen':
          return result(rdb.reopenChannel(activityId, input.newDeadline || ''))
        default:
          return businessError('不支持的通道操作')
      }
    },
  },
  // 轮次列表
  {
    url: '/api/org/:clubId/recruitment/:activityId/rounds',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const a = rdb.findActivity(query.clubId, query.activityId)
      if (!a) return notFound('活动不存在')
      return ok({
        items: a.rounds.map((r) => ({
          id: r.id, name: r.name, status: r.status, mode: r.mode, selectDeadline: r.selectDeadline,
          slots: r.slots.map((s) => ({ ...s, available: Math.max(0, s.capacity - s.taken) })),
          bookedCount: r.slots.reduce((n, s) => n + s.taken, 0),
        })),
        nextCursor: null,
      })
    },
  },
  // 创建轮次
  {
    url: '/api/org/:clubId/recruitment/:activityId/rounds',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as unknown as rdb.RecRound
      return result(rdb.createRound(query.activityId, input))
    },
  },
  // 更新轮次
  {
    url: '/api/org/:clubId/recruitment/:activityId/rounds/:roundId',
    method: 'put',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { name?: string; selectDeadline?: string }
      return result(rdb.updateRound(query.activityId, query.roundId, input))
    },
  },
  // 取消轮次
  {
    url: '/api/org/:clubId/recruitment/:activityId/rounds/:roundId/cancel',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { reason?: string }
      if (!input.reason?.trim()) return businessError('取消轮次必须填写原因')
      return result(rdb.cancelRound(query.activityId, query.roundId, input.reason))
    },
  },
  // 收紧招新规则（REC-007/044）：暂停通道 + 受影响申请人补救窗口
  {
    url: '/api/org/:clubId/recruitment/:activityId/rules/tighten',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { reason?: string; deadlineDays?: number }
      const r = rdb.tightenRecruitmentRules(query.activityId, input.reason || '', Number(input.deadlineDays) || 0)
      if (!r.ok) return businessError(r.error || '收紧失败')
      return ok({ affectedCount: r.data?.affected.length || 0, affected: r.data?.affected || [] })
    },
  },
  // 处理调整逾期（REC-044）：延长窗口或资格不符结论
  {
    url: '/api/org/:clubId/recruitment/:activityId/applications/:applicantId/adjustment',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { action?: 'extend' | 'not_qualified'; reason?: string; newDeadline?: string }
      if (!input.action || !['extend', 'not_qualified'].includes(input.action)) return businessError('无效的处理动作')
      const r = rdb.resolveAdjustment(query.activityId, query.applicantId, input.action, input.reason || '', input.newDeadline)
      return result(r)
    },
  },
  // 报名申请列表
  {
    url: '/api/org/:clubId/recruitment/:activityId/applications',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      rdb.applyAdjustmentTimeouts(query.activityId)
      let items = rdb.recruitmentApplications
        .filter((a) => a.activityId === query.activityId)
        .map((a) => ({
          id: a.id, activityId: a.activityId, applicantId: a.applicantId, applicantName: a.applicantName,
          applicantStudentId: a.studentId, status: a.status,
          preferences: a.preferences, allowAdjustment: a.allowAdjustment,
          submittedAt: a.submittedAt, withdrawnAt: a.withdrawnAt, formVersion: a.formVersion,
          identityAnomalyAt: a.identityAnomalyAt, recoveryWindowDeadline: a.recoveryWindowDeadline,
          adjustmentDeadline: a.adjustmentDeadline, adjustmentReason: a.adjustmentReason, notQualifiedReason: a.notQualifiedReason,
        }))
      const status = query.status
      if (status && status !== 'all') items = items.filter((a) => a.status === status)
      return ok({ items, nextCursor: null })
    },
  },
  // 报名申请详情（管理视角）
  {
    url: '/api/org/:clubId/recruitment/:activityId/applications/:applicantId',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const act = rdb.findActivity(query.clubId, query.activityId)
      if (!act) return notFound('活动不存在')
      const app = rdb.recruitmentApplications.find((a) => a.activityId === query.activityId && a.applicantId === query.applicantId)
      if (!app) return notFound('申请不存在')
      return ok({
        id: app.id, activityId: app.activityId, applicantId: app.applicantId, applicantName: app.applicantName,
        applicantStudentId: app.studentId, status: app.status, preferences: app.preferences,
        allowAdjustment: app.allowAdjustment, formVersion: app.formVersion, answers: app.answers,
        paths: app.paths, submittedAt: app.submittedAt, withdrawnAt: app.withdrawnAt,
        identityAnomalyAt: app.identityAnomalyAt, recoveryWindowDeadline: app.recoveryWindowDeadline,
        adjustmentDeadline: app.adjustmentDeadline, adjustmentReason: app.adjustmentReason, notQualifiedReason: app.notQualifiedReason,
        version: app.version,
      })
    },
  },
  // 提交报名申请
  {
    url: '/api/activity/recruitment/:activityId/apply',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      const applicantId = applicantIdOf(url)
      if (!applicantId) return forbidden()
const act = rdb.findAnyActivity(query.activityId)
      if (!act) return notFound('活动不存在')
      const studentId = mockUsers[applicantId]?.studentId ?? ''
      const isExistingMember = db.members.some(
        (m) => m.clubId === act.clubId
          && m.studentId === studentId
          && (m.status === 'active' || m.status === 'pending_effective'),
      )
      if (isExistingMember) return businessError('本社团成员无需报名本社团招新')
      const input = unwrap(body) as { preferences: { departmentId: string }[]; allowAdjustment: boolean; answers?: Record<string, unknown>; formData?: Record<string, unknown>; formAnswers?: Record<string, unknown> }
      const r = rdb.submitApplication(query.activityId, applicantId, { ...input, answers: input.answers ?? input.formData ?? input.formAnswers })
      if (r.ok) {
        pushNotifications([applicantId], {
          type: 'application',
          title: '报名申请已提交',
          body: `您的报名申请已提交，请等待「${act.title}」的审核。`,
          link: '/me/todo',
        })
      }
      return result(r)
    },
  },
  // 保存报名草稿
  {
    url: '/api/activity/recruitment/:activityId/draft',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      const applicantId = applicantIdOf(url)
      if (!applicantId) return forbidden()
      const input = unwrap(body) as { answers?: Record<string, unknown>; formData?: Record<string, unknown>; formAnswers?: Record<string, unknown> }
      const r = rdb.saveApplicationDraft(query.activityId, applicantId, { answers: input.answers ?? input.formData ?? input.formAnswers })
      if (!r.ok) return businessError(r.error || '保存失败')
      return ok({ activityId: query.activityId, status: 'draft', savedAt: new Date().toISOString(), ...r.data })
    },
  },
  // 我的申请（申请人视角）
  {
    url: '/api/activity/recruitment/:activityId/apply',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const applicantId = applicantIdOf(url)
      if (!applicantId) return forbidden()
      rdb.applyAdjustmentTimeouts(query.activityId)
      const app = rdb.findApplication(query.activityId, applicantId)
      if (!app) return notFound('尚未提交申请')
      return ok({
        id: app.id, activityId: app.activityId, status: app.status, preferences: app.preferences,
        allowAdjustment: app.allowAdjustment, answers: app.answers, formVersion: app.formVersion,
        submittedAt: app.submittedAt, withdrawnAt: app.withdrawnAt, identityAnomalyAt: app.identityAnomalyAt,
        recoveryWindowDeadline: app.recoveryWindowDeadline, adjustmentDeadline: app.adjustmentDeadline,
        adjustmentReason: app.adjustmentReason, notQualifiedReason: app.notQualifiedReason,
        paths: app.paths, version: app.version,
      })
    },
  },
  // 退出招新（二次确认）
  {
    url: '/api/activity/recruitment/:activityId/withdraw',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      const applicantId = applicantIdOf(url)
      if (!applicantId) return forbidden()
      const input = unwrap(body) as { confirm?: boolean }
      return result(rdb.withdrawApplication(query.activityId, applicantId, !!input.confirm))
    },
  },
  // 恢复报名窗口（逾期/误退）
  {
    url: '/api/org/:clubId/recruitment/:activityId/applications/:applicantId/recovery-window',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { deadline?: string }
      if (!input.deadline) return businessError('必须指定恢复窗口截止时间')
      return result(rdb.createRecoveryWindow(query.activityId, query.applicantId, input.deadline))
    },
  },
  // 要求补充材料
  {
    url: '/api/org/:clubId/recruitment/:activityId/applications/:applicantId/supplement',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { requirement?: string; deadline?: string }
      if (!input.requirement?.trim()) return businessError('必须填写补充要求')
      return result(rdb.requestSupplement(query.activityId, query.applicantId, input.requirement, input.deadline || ''))
    },
  },
  // 标记身份异常
  {
    url: '/api/org/:clubId/recruitment/:activityId/applications/:applicantId/identity-anomaly',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      return result(rdb.markIdentityAnomaly(query.activityId, query.applicantId))
    },
  },
  // 恢复身份异常
  {
    url: '/api/org/:clubId/recruitment/:activityId/applications/:applicantId/identity-anomaly/recover',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      return result(rdb.recoverIdentityAnomaly(query.activityId, query.applicantId))
    },
  },
  // 公布不通过
  {
    url: '/api/org/:clubId/recruitment/:activityId/applications/:applicantId/not-qualified',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { reason?: string }
      if (!input.reason?.trim()) return businessError('公布不通过必须填写原因')
      return result(rdb.publishNotQualified(query.activityId, query.applicantId, input.reason))
    },
  },
  // 部门意向标记（部门负责人）
  {
    url: '/api/org/:clubId/recruitment/:activityId/applications/:applicantId/paths/:departmentId/label',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { label?: boolean }
      const me = actorInfo(url)
      const member = me.memberId ? db.findMember(query.clubId, me.memberId) : undefined
      const isDeptLeader = !!member && member.positions.some((p) => p.status === 'active' && p.departmentId === query.departmentId && (p.title === '部长' || p.title === '负责人'))
      const applicantUserId = Object.keys(USER_MEMBER_MAP).find((uid) => USER_MEMBER_MAP[uid] === me.memberId) || null
      return result(rdb.setDeptLabel(query.activityId, query.applicantId, query.departmentId, !!input.label, me.memberId || '', me.name, me.role, isDeptLeader, applicantUserId))
    },
  },
  // 部门路径决策（admit / not_admit / hold）
  {
    url: '/api/org/:clubId/recruitment/:activityId/applications/:applicantId/paths/:departmentId/decision',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { decision: 'admit' | 'not_admit' | 'hold'; holdDeadline?: string }
      return result(rdb.decidePath(query.activityId, query.applicantId, query.departmentId, input.decision, input.holdDeadline))
    },
  },
  // 候补名单
  {
    url: '/api/org/:clubId/recruitment/:activityId/applications/:applicantId/paths/:departmentId/waitlist',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { on?: boolean }
      return result(rdb.setWaitlist(query.activityId, query.applicantId, query.departmentId, !!input.on))
    },
  },
  // 发布部门结论
  {
    url: '/api/org/:clubId/recruitment/:activityId/applications/:applicantId/paths/:departmentId/publish',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const me = actorInfo(url)
      return result(rdb.publishDepartmentResult(query.activityId, query.applicantId, query.departmentId, me.name))
    },
  },
  // 面试列表（管理视角）
  {
    url: '/api/org/:clubId/recruitment/:activityId/interviews',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId) && !canInterview(url, query.clubId)) return forbidden()
      const items = rdb.recruitmentInterviews
        .filter((i) => i.activityId === query.activityId)
        .map(interviewRow)
      return ok({ items, nextCursor: null })
    },
  },
  // 面试详情（管理视角）
  {
    url: '/api/org/:clubId/recruitment/:activityId/interviews/:interviewId',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId) && !canInterview(url, query.clubId)) return forbidden()
      const act = rdb.findActivity(query.clubId, query.activityId)
      if (!act) return notFound('活动不存在')
      const it = rdb.recruitmentInterviews.find((i) => i.id === query.interviewId && i.activityId === query.activityId)
      if (!it) return notFound('面试不存在')
      const a = rdb.findAnyActivity(it.activityId)
      const round = a?.rounds.find((r) => r.id === it.roundId)
      const app = rdb.recruitmentApplications.find((x) => x.activityId === it.activityId && x.applicantId === it.applicantId)
      const interviewers = it.interviewerIds.map((id) => {
        const u = mockUsers[id]
        return { id, name: u?.name || id }
      })
      return ok({
        id: it.id, activityId: it.activityId, activityTitle: a?.title || '', roundId: it.roundId, roundName: round?.name || '',
        applicantId: it.applicantId, applicantName: app?.applicantName || it.applicantName, status: it.status,
        scheduledTime: it.startAt, endTime: it.endAt, interviewers, attendance: it.attendance,
        invalidReason: it.invalidReason, skipReason: it.skipReason, cancelReason: it.cancelReason, version: it.version,
      })
    },
  },
  // 管理代预约面试
  {
    url: '/api/org/:clubId/recruitment/:activityId/interviews/book',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { applicantId?: string; roundId?: string; slotId?: string }
      if (!input.applicantId || !input.slotId) return businessError('必须指定申请人与面试时段')
      const a = rdb.findActivity(query.clubId, query.activityId)
      const slot = a?.rounds.flatMap((r) => r.slots).find((s) => s.id === input.slotId)
      if (!slot) return notFound('面试时段不存在')
      const r = rdb.bookInterview(query.activityId, input.applicantId, slot.roundId, input.slotId, '', true, findInterviewersForClub(query.clubId))
      if (r.ok) {
        const uid = userIdOfApplicant(input.applicantId)
        if (uid) {
          pushNotifications([uid], {
            type: 'interview',
            title: '面试已排期',
            body: `您的「${a?.title || '招新活动'}」面试已安排，请及时查看日程并准备。`,
            link: '/me/schedule',
          })
        }
      }
      return result(r)
    },
  },
  // 面试官任务列表（本人视角：我参与面试的普通招新任务，含冲突检测对齐 applicantTimeConflict）
  {
    url: '/api/me/interviews/tasks',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const me = resolveMockUser(url)
      const items = rdb.recruitmentInterviews
        .filter((it) => (it.interviewerIds || []).includes(me.id) && canInterview(url, it.clubId))
        .map((it) => {
          const a = rdb.findAnyActivity(it.activityId)
          const round = a?.rounds.find((r) => r.id === it.roundId)
          const conflict = it.startAt && it.endAt ? rdb.applicantTimeConflict(it.applicantId, it.startAt, it.endAt, it.id) : { conflict: false }
          return {
            id: it.id, type: 'recruitment',
            activityId: it.activityId, activityTitle: a?.title || '',
            clubId: it.clubId, clubName: a?.clubName || '',
            applicantId: it.applicantId, applicantName: it.applicantName,
            roundId: it.roundId, roundName: round?.name || '',
            status: it.status, startAt: it.startAt, endAt: it.endAt,
            attendance: it.attendance, conflict,
          }
        })
      return ok({ items, nextCursor: null })
    },
  },
  // 面试详情（本人视角，含可选时段）
  {
    url: '/api/me/interviews/recruitment/:interviewId',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      const it = rdb.recruitmentInterviews.find((i) => i.id === query.interviewId)
      if (!it) return notFound('面试不存在')
      const a = rdb.findAnyActivity(it.activityId)
      const round = a?.rounds.find((r) => r.id === it.roundId)
      const app = rdb.recruitmentApplications.find((x) => x.applicantId === it.applicantId)
      const availableSlots = (round?.slots || [])
        .filter((s) => s.id === it.slotId || s.taken < s.capacity)
        .map((s) => ({
          id: s.id, time: s.startAt, endAt: s.endAt, capacity: s.capacity, booked: s.taken,
        }))
      return ok({
        id: it.id, activityId: it.activityId, activityTitle: a?.title || '', roundId: it.roundId, roundName: round?.name || '',
        applicantName: app?.applicantName || it.applicantName, status: it.status,
        scheduledTime: it.startAt, endTime: it.endAt,
        interviewers: [], attendance: it.attendance, invalidReason: it.invalidReason, version: it.version,
        availableSlots,
      })
    },
  },
  // 预约/改期面试（本人）
  {
    url: '/api/me/interviews/recruitment/:interviewId/book',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      const applicantId = applicantIdOf(url)
      if (!applicantId) return forbidden()
      const it = rdb.recruitmentInterviews.find((i) => i.id === query.interviewId)
      if (!it) return notFound('面试不存在')
      if (it.applicantId !== applicantId) return forbidden()
      const input = unwrap(body) as { slotId?: string }
      if (!input.slotId) return businessError('必须选择面试时段')
      const a = rdb.findAnyActivity(it.activityId)
      const slot = a?.rounds.flatMap((r) => r.slots).find((s) => s.id === input.slotId)
      if (!slot) return notFound('面试时段不存在')
      const r = rdb.bookInterview(it.activityId, applicantId, slot.roundId, input.slotId, '', false, findInterviewersForClub(it.clubId))
      if (r.ok) {
        pushNotifications([applicantId], {
          type: 'interview',
          title: '面试时间已确认',
          body: `您「${a?.title || '招新活动'}」的面试时间已确认，请查看日程。`,
          link: '/me/schedule',
        })
      }
      return result(r)
    },
  },
  // 出席登记（迟到/请假/缺席）
  {
    url: '/api/org/:clubId/recruitment/:activityId/interviews/:interviewId/attendance',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId) && !canInterview(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { event: 'leave' | 'late' | 'absent' }
      return result(rdb.markAttendance(query.interviewId, input.event, canManageRec(url, query.clubId)))
    },
  },
  // 开始面试
  {
    url: '/api/org/:clubId/recruitment/:activityId/interviews/:interviewId/start',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId) && !canInterview(url, query.clubId)) return forbidden()
      return result(rdb.startInterview(query.interviewId))
    },
  },
  // 完成面试
  {
    url: '/api/org/:clubId/recruitment/:activityId/interviews/:interviewId/complete',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId) && !canInterview(url, query.clubId)) return forbidden()
      return result(rdb.completeInterview(query.interviewId))
    },
  },
  // 作废面试（须填原因）
  {
    url: '/api/org/:clubId/recruitment/:activityId/interviews/:interviewId/invalidate',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId) && !canInterview(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { reason?: string }
      if (!input.reason?.trim()) return businessError('作废面试必须填写原因')
      return result(rdb.invalidateInterview(query.interviewId, input.reason))
    },
  },
  // 跳轮/免试
  {
    url: '/api/org/:clubId/recruitment/:activityId/rounds/:roundId/skip',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { applicantId?: string; reason?: string }
      if (!input.applicantId) return businessError('必须指定申请人')
      if (!input.reason?.trim()) return businessError('跳轮/免试必须填写原因')
      return result(rdb.skipRoundInterview(query.activityId, input.applicantId, query.roundId, input.reason))
    },
  },
  // 评价列表（按申请人派生，多作者；首评前隔离 REC-015）
  {
    url: '/api/org/:clubId/recruitment/:activityId/reviews',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId) && !canInterview(url, query.clubId)) return forbidden()
      const me = actorInfo(url)
      const isManager = canManageRec(url, query.clubId)
      const act = rdb.findAnyActivity(query.activityId)
      const items = rdb.recruitmentApplications
        .filter((a) => a.activityId === query.activityId && a.status !== 'draft')
        .map((app) => {
          const reviews = act
            ? rdb.recruitmentReviews.filter((r) => act.reviewIds.includes(r.id) && r.applicantId === app.applicantId)
            : rdb.recruitmentReviews.filter((r) => r.activityId === query.activityId && r.applicantId === app.applicantId)
          const sorted = [...reviews].sort((x, y) => (y.updatedAt || y.createdAt).localeCompare(x.updatedAt || x.createdAt))
          const latest = sorted[0]
          // REC-015: 评分/评语按作者取本人那条 review；负责人/人事展示最近一条已提交评价
          const myReview = reviews.find((r) => me.memberId && r.authorId === me.memberId)
          const shown = isManager ? latest : myReview
          const mySubmitted = !!myReview
          const peerViewLocked = !isManager && !mySubmitted
          const paths = Object.values(app.paths || {})
          const anyPublished = paths.some((p) => p.publishedAt)
          const anyEvaluating = paths.some((p) => p.status === 'evaluating')
          let status = 'pending'
          if (anyPublished) status = 'published'
          else if (shown) status = 'concluded'
          else if (anyEvaluating) status = 'evaluating'
          return {
            id: app.id, applicantId: app.applicantId, applicantName: app.applicantName,
            departmentName: app.preferences[0]?.departmentName || '', status,
            rating: shown?.rating ?? null, comment: shown?.comment || '',
            concludedAt: shown?.updatedAt || null, concludedBy: shown?.authorName || null,
            peerViewLocked,
            reviews: peerViewLocked ? [] : sorted.map((r) => ({
              authorName: r.authorName, authorRole: r.authorRole, comment: r.comment,
              version: r.version, createdAt: r.createdAt, updatedAt: r.updatedAt,
            })),
            myRating: myReview?.rating ?? null,
            myComment: myReview?.comment ?? null,
          }
        })
      return ok({ items, nextCursor: null })
    },
  },
  // 提交评价（单个申请人；轮次关闭锁定 + 提交人面试任务校验）
  {
    url: '/api/org/:clubId/recruitment/:activityId/reviews/:reviewId/conclude',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId) && !canInterview(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { rating?: number; comment?: string }
      // reviewId 对应 recruitmentReviews.id（如 rev-001），需先定位到 applicantId
      const review = rdb.recruitmentReviews.find((r) => r.id === query.reviewId && r.activityId === query.activityId)
      const applicantId = review?.applicantId
      const app = applicantId
        ? rdb.recruitmentApplications.find((a) => a.applicantId === applicantId && a.activityId === query.activityId)
        : undefined
      if (!app) return notFound('申请人不存在')
      const me = actorInfo(url)
      if (!canManageRec(url, query.clubId)) {
        const assigned = rdb.recruitmentInterviews.some(
          (i) => i.activityId === query.activityId && i.applicantId === applicantId && i.status !== 'cancelled' && i.interviewerIds.includes(me.memberId || ''),
        )
        if (!assigned) return forbidden()
      }
      const interviews = rdb.recruitmentInterviews
        .filter((i) => i.activityId === query.activityId && i.applicantId === applicantId && i.status !== 'cancelled')
        .sort((x, y) => ((x.startAt || '').localeCompare(y.startAt || '')))
      const roundId = interviews[interviews.length - 1]?.roundId || null
      const r = rdb.submitReview(query.activityId, app.applicantId, {
        comment: input.comment || '',
        rating: Number(input.rating) || 0,
        authorId: me.memberId || '', authorName: me.name, authorRole: me.role, roundId,
      })
      if (!r.ok) return businessError(r.error || '提交失败')
      return ok({ id: query.reviewId, status: 'concluded', rating: Number(input.rating) || 0, comment: input.comment || '', concludedAt: new Date().toISOString() })
    },
  },
  // 统一发布结论
  {
    url: '/api/org/:clubId/recruitment/:activityId/reviews/publish',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const me = actorInfo(url)
      const apps = rdb.recruitmentApplications.filter(
        (a) =>
          a.activityId === query.activityId &&
          a.status !== 'draft' &&
          rdb.recruitmentReviews.some((r) => r.activityId === query.activityId && r.applicantId === a.applicantId && r.rating > 0),
      )
      if (!apps.length) return businessError('没有可发布的结论')
      const published: string[] = []
      for (const app of apps) {
        const first = Object.values(app.paths || {})[0]
        if (!first) continue
        const r = rdb.publishDepartmentResult(query.activityId, app.applicantId, first.departmentId, me.name)
        if (r.ok) published.push(app.applicantId)
      }
      if (!published.length) return businessError('没有可发布的结论')
      const targets = published
        .map((applicantId) => userIdOfApplicant(applicantId))
        .filter((uid): uid is string => uid !== null)
      pushNotifications(targets, {
        type: 'conclusion',
        title: '结论已发布',
        body: '您在本轮招新的结论已发布，请前往查看最终结果。',
        link: '/me/todo',
      })
      return ok({ publishedCount: published.length })
    },
  },
  // 邀请列表
  {
    url: '/api/org/:clubId/recruitment/:activityId/invitations',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const items = rdb.recruitmentInvitations
        .filter((i) => i.activityId === query.activityId)
        .map((i) => ({
          id: i.id, activityId: i.activityId, applicantId: i.applicantId, applicantName: i.applicantName,
          departmentId: i.departmentId, departmentName: i.departmentName, status: i.status,
          sentAt: i.sentAt, acceptedAt: i.acceptedAt, expiredAt: i.expiredAt, casdoorSync: i.casdoorSync, version: i.version,
        }))
      return ok({ items, nextCursor: null })
    },
  },
  // 邀请详情（管理视角）
  {
    url: '/api/org/:clubId/recruitment/:activityId/invitations/:invitationId',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const act = rdb.findActivity(query.clubId, query.activityId)
      if (!act) return notFound('活动不存在')
      const inv = rdb.recruitmentInvitations.find((i) => i.id === query.invitationId && i.activityId === query.activityId)
      if (!inv) return notFound('邀请不存在')
      return ok({
        id: inv.id, activityId: inv.activityId, applicantId: inv.applicantId, applicantName: inv.applicantName,
        departmentId: inv.departmentId, departmentName: inv.departmentName, status: inv.status,
        sentAt: inv.sentAt, acceptedAt: inv.acceptedAt, expiredAt: inv.expiredAt, casdoorSync: inv.casdoorSync, version: inv.version,
      })
    },
  },
  // 创建邀请
  {
    url: '/api/org/:clubId/recruitment/:activityId/invitations',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { applicantId?: string; departmentId?: string; expireDays?: number }
      if (!input.applicantId || !input.departmentId) return businessError('必须指定申请人与录取部门')
      const me = actorInfo(url)
      const rinv = rdb.createRecInvitation(query.activityId, input.applicantId, input.departmentId, Number(input.expireDays) || 7, me.name)
      if (rinv.ok) {
        const uid = userIdOfApplicant(input.applicantId)
        if (uid) {
          pushNotifications([uid], {
            type: 'invitation',
            title: '收到录取邀请',
            body: '恭喜！您已收到一份录取邀请，请在有效期内及时确认。',
            link: rinv.data?.id ? `/me/invitations/recruitment/${rinv.data.id}` : '/me/invitations/recruitment',
          })
        }
      }
      return result(rinv)
    },
  },
  // 撤回邀请
  {
    url: '/api/org/:clubId/recruitment/:activityId/invitations/:invitationId/withdraw',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      return result(rdb.withdrawRecInvitation(query.invitationId))
    },
  },
  // 重新发送邀请
  {
    url: '/api/org/:clubId/recruitment/:activityId/invitations/:invitationId/reissue',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { expireDays?: number }
      return result(rdb.reissueRecInvitation(query.invitationId, Number(input.expireDays) || 7))
    },
  },
  // 确认邀请生效（Casdoor 同步确认）
  {
    url: '/api/org/:clubId/recruitment/:activityId/invitations/:invitationId/sync',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageRec(url, query.clubId)) return forbidden()
      return result(rdb.confirmRecInvitationSync(query.invitationId))
    },
  },
  // 邀请详情（本人视角）
  {
    url: '/api/me/invitations/recruitment/:invitationId',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const inv = rdb.findInvitation(query.invitationId)
      if (!inv) return notFound('邀请不存在')
      const applicantId = applicantIdOf(url)
      if (applicantId && inv.applicantId !== applicantId) return forbidden()
      const a = rdb.findAnyActivity(inv.activityId)
      return ok({
        id: inv.id, activityId: inv.activityId, activityTitle: a?.title || '', clubName: a?.clubName || '',
        applicantName: inv.applicantName, status: inv.status, sentAt: inv.sentAt, acceptedAt: inv.acceptedAt,
        expiredAt: inv.expiredAt, departmentName: inv.departmentName, casdoorSync: inv.casdoorSync,
      })
    },
  },
  // 接受/拒绝邀请（本人）
  {
    url: '/api/me/invitations/recruitment/:invitationId/respond',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      const applicantId = applicantIdOf(url)
      if (!applicantId) return forbidden()
      const input = unwrap(body) as { action: 'accept' | 'reject' }
      if (!['accept', 'reject'].includes(input.action)) return businessError('不支持的响应动作')
      const inv = rdb.recruitmentInvitations.find((i) => i.id === query.invitationId)
      if (inv && inv.applicantId !== applicantId) return forbidden()
      const r = rdb.respondRecInvitation(query.invitationId, input.action, applicantId)
      return result(r)
    },
  },
  // 动态表单定义（报名表）
  {
    url: '/api/org/:clubId/forms/:formId',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      if (query.formId === 'form-002') {
        return ok({
          id: 'form-002', clubId: query.clubId, title: '面试评价表', status: 'published',
          versions: [{
            version: 1, status: 'published', publishedAt: '2025-07-20T10:00:00+08:00',
            fields: [
              { id: 'f1', type: 'rating', label: '综合评分', description: null, required: true, readonly: false, permission: 'read_write', options: null, conditionalFieldId: null, conditionalValue: null, arrayFieldTemplateId: null },
              { id: 'f2', type: 'textarea', label: '评语', description: null, required: false, readonly: false, permission: 'read_write', options: null, conditionalFieldId: null, conditionalValue: null, arrayFieldTemplateId: null },
            ],
          }],
        })
      }
      return ok({
        id: 'form-001', clubId: query.clubId, title: '招新报名表', status: 'published',
        versions: [{
          version: 1, status: 'published', publishedAt: '2025-08-01T10:00:00+08:00',
          fields: [
            { id: 'f1', type: 'text', label: '自我介绍', description: '简要介绍自己的特长和兴趣', required: true, readonly: false, permission: 'read_write', options: null, conditionalFieldId: null, conditionalValue: null, arrayFieldTemplateId: null },
            { id: 'f2', type: 'select', label: '意向部门', description: null, required: true, readonly: false, permission: 'read_write', options: ['技术部', '运营部', '设计部'], conditionalFieldId: null, conditionalValue: null, arrayFieldTemplateId: null },
            { id: 'f3', type: 'textarea', label: '相关经历', description: '如有相关项目或活动经历请填写', required: false, readonly: false, permission: 'read_write', options: null, conditionalFieldId: null, conditionalValue: null, arrayFieldTemplateId: null },
            { id: 'f4', type: 'file', label: '作品附件', description: '可选，上传作品集或简历', required: false, readonly: false, permission: 'read_write', options: null, conditionalFieldId: null, conditionalValue: null, arrayFieldTemplateId: null },
          ],
        }],
      })
    },
  },
  // 表单提交
  {
    url: '/api/org/:clubId/forms/:formId/submissions',
    method: 'post',
    response: ({ query, body }: { query: Record<string, string>; body: unknown }) => {
      const input = unwrap(body) as { version?: number; answers?: Record<string, unknown> }
      if (!input.version) return businessError('必须指定表单版本')
      if (!input.answers || typeof input.answers !== 'object') return businessError('answers 不能为空')
      return ok({ formId: query.formId, version: input.version, status: 'submitted', submittedAt: new Date().toISOString() })
    },
  },
  // 文件预览
  {
    url: '/api/files/:fileId',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      return ok({
        id: query.fileId || 'file-001', name: '作品集.pdf', size: 1048576,
        mimeType: 'application/pdf', status: 'approved',
        uploadedAt: '2025-08-01T14:00:00+08:00', checkedAt: '2025-08-01T14:01:00+08:00', downloadUrl: null,
      })
    },
  },
]

// ================= 联合活动 =================

/** 联合活动行（管理视角） */
function jointRow(ja: rdb.JointActivity, clubId?: string) {
  return {
    id: ja.id, title: ja.title, status: ja.status, channelStatus: ja.channelStatus,
    deadline: ja.deadline, participantClubs: ja.clubs.map((c) => c.clubName),
    applicantCount: ja.applicantIds.length, confirmRound: ja.confirmRound, confirmDeadline: ja.confirmDeadline,
    createdAt: ja.createdAt, version: ja.version,
    myClubStatus: clubId ? ja.clubs.find((c) => c.clubId === clubId)?.status || null : null,
  }
}

/** 申请人 × 参与社团 派生结论行（US-JNT-03：跨社团互见，不做本社团过滤）；PRD:625 各社团评分/评语/结论/历史实时互见——返回全部参与社团行，clubId 仅用于标记本社团（myClub），供前端区分可操作行 */
function jointConclusionRows(jointId: string, clubId?: string) {
  const ja = rdb.findJoint(jointId)
  if (!ja) return []
  const rows: Record<string, unknown>[] = []
  for (const app of rdb.jointApplications.filter((a) => a.jointId === jointId && a.status !== 'draft')) {
    for (const c of ja.clubs) {
      const con = rdb.jointConclusions.find((x) => x.jointId === jointId && x.applicantId === app.applicantId && x.clubId === c.clubId)
      const extra = rdb.findJointReviewExtra(jointId, app.applicantId, c.clubId)
      const status = con?.status === 'invite_pending' || con?.status === 'accepted_locked' ? con.status : extra ? 'concluded' : con?.status || 'pending'
      rows.push({
        id: con?.id || `${jointId}-${app.applicantId}-${c.clubId}`,
        applicantId: app.applicantId, applicantName: app.applicantName,
        clubId: c.clubId, clubName: c.clubName, status,
        conclusion: con?.conclusion || null, reviewFlag: con?.reviewFlag || false,
        rating: extra?.rating || null, comment: extra?.comment || '',
        concludedAt: extra?.concludedAt || null, version: con?.version || 1,
        authorName: extra?.authorName || null, authorRole: extra?.authorRole || null,
        versions: con?.versions ?? [],
        myClub: clubId ? c.clubId === clubId : true,
      })
    }
  }
  return rows
}

const jointHandlers: MockMethod[] = [
  // 联合活动列表
  {
    url: '/api/org/:clubId/joint',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      return ok({
        items: rdb.jointActivities.filter((j) => j.clubs.some((c) => c.clubId === query.clubId)).map((j) => jointRow(j, query.clubId)),
        nextCursor: null,
      })
    },
  },
  // 创建联合活动
  {
    url: '/api/org/:clubId/joint',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      const user = resolveMockUser(url)
      const clubName = user.roles.find((r) => r.clubId === query.clubId)?.clubName || query.clubId
      const input = unwrap(body) as { title?: string; description?: string; clubIds?: string[]; confirmDeadline?: string; sharedAgreement?: string }
      const r = rdb.createJointActivity(query.clubId, clubName, user.name, {
        title: input.title || '', description: input.description, clubIds: input.clubIds || [],
        confirmDeadline: input.confirmDeadline || '', sharedAgreement: input.sharedAgreement,
      })
      return result(r)
    },
  },
  // 联合活动详情
  {
    url: '/api/org/:clubId/joint/:jointId',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      const ja = rdb.findJoint(query.jointId)
      if (!ja) return notFound('联合活动不存在')
      return ok({
        ...jointRow(ja, query.clubId),
        description: ja.description,
        sharedAgreement: ja.sharedAgreement,
        participants: ja.clubs.map((c) => ({ clubId: c.clubId, clubName: c.clubName, status: c.status, confirmedAt: c.confirmedAt, confirmedBy: c.confirmedBy })),
        cancelConfirmRound: ja.cancelConfirmRound, cancelConfirmDeadline: ja.cancelConfirmDeadline,
        endConfirmRound: ja.endConfirmRound, endConfirmDeadline: ja.endConfirmDeadline,
        publishedAt: ja.publishedAt, firstInviteAt: ja.firstInviteAt, closedAt: ja.closedAt, forceClosedAt: ja.forceClosedAt,
      })
    },
  },
  // 确认参与联合活动
  {
    url: '/api/org/:clubId/joint/:jointId/confirm',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      const actingClub = query._mock_club || query.clubId
      return result(rdb.confirmJointParticipation(query.jointId, actingClub, resolveMockUser(url).name))
    },
  },
  // 调整参与社团名单
  {
    url: '/api/org/:clubId/joint/:jointId/clubs',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { clubIds?: string[]; newDeadline?: string }
      if (!Array.isArray(input.clubIds) || input.clubIds.length < 2) return businessError('联合活动至少需要两个参与社团')
      return result(rdb.adjustJointClubList(query.jointId, input.clubIds, input.newDeadline || ''))
    },
  },
  // 退出联合活动（发起方/参与方）
  {
    url: '/api/org/:clubId/joint/:jointId/withdraw',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      return result(rdb.withdrawJointParticipation(query.jointId, query._mock_club || query.clubId))
    },
  },
  // 发布联合活动
  {
    url: '/api/org/:clubId/joint/:jointId/publish',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      return result(rdb.publishJointActivity(query.jointId))
    },
  },
  // 联合报名通道（open/pause/resume/extend/close/reopen）
  {
    url: '/api/org/:clubId/joint/:jointId/channel',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { action: string; deadline?: string; reason?: string }
      const jointId = query.jointId
      switch (input.action) {
        case 'open': {
          const ja = rdb.findJoint(jointId)
          if (ja && ja.channelStatus === 'closed') return result(rdb.reopenJointChannel(jointId, input.deadline || ''))
          return result(rdb.openJointChannel(jointId, input.deadline || ''))
        }
        case 'pause':
          return result(rdb.pauseJointChannel(jointId))
        case 'resume':
          return result(rdb.resumeJointChannel(jointId, input.deadline || ''))
        case 'extend':
          return result(rdb.extendJointDeadline(jointId, input.deadline || ''))
        case 'close':
          return result(rdb.closeJointChannel(jointId, input.reason ?? ''))
        case 'reopen':
          return result(rdb.reopenJointChannel(jointId, input.deadline || ''))
        default:
          return businessError('不支持的通道操作')
      }
    },
  },
  // 取消联合活动
  {
    url: '/api/org/:clubId/joint/:jointId/cancel',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { confirm?: boolean; reason?: string }
      const actingClub = query._mock_club || query.clubId
      const r = rdb.cancelJointActivity(query.jointId, actingClub, resolveMockUser(url).name)
      if (r.error && !r.ok && r.error.includes('二次确认') && !input.confirm) {
        return { code: 0, data: { needConfirm: true, message: r.error } }
      }
      return result(r)
    },
  },
  // 结束信息
  {
    url: '/api/org/:clubId/joint/:jointId/close',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      const ja = rdb.findJoint(query.jointId)
      if (!ja) return notFound('联合活动不存在')
      return ok({
        id: ja.id, title: ja.title, status: ja.status,
        participants: ja.clubs.map((c) => ({
          clubId: c.clubId, clubName: c.clubName, status: c.status,
          concludedCount: rdb.jointConclusions.filter((x) => x.jointId === ja.id && x.clubId === c.clubId && x.conclusion).length,
          invitationSent: rdb.jointInvitations.filter((x) => x.jointId === ja.id && x.clubId === c.clubId && x.status !== 'withdrawn').length,
          endConfirmed: !!ja.endConfirmations[c.clubId],
        })),
        totalApplicants: ja.applicantIds.length,
        endConfirmRound: ja.endConfirmRound, endConfirmDeadline: ja.endConfirmDeadline,
        canClose: ja.status === 'published' || ja.status === 'invite_phase',
      })
    },
  },
  // 进入结束确认（全部邀请终态后）
  {
    url: '/api/org/:clubId/joint/:jointId/close/start',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      return result(rdb.startJointEndConfirm(query.jointId, query._mock_club || query.clubId, resolveMockUser(url).name))
    },
  },
  // 提交结束确认
  {
    url: '/api/org/:clubId/joint/:jointId/close',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      return result(rdb.submitJointEndConfirm(query.jointId, query._mock_club || query.clubId, resolveMockUser(url).name))
    },
  },
  // 平台强制关闭
  {
    url: '/api/admin/joint/:jointId/force-close',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!isPlatformAdmin(url)) return forbidden()
      const input = unwrap(body) as { reason?: string }
      if (!input.reason?.trim()) return businessError('强制关闭必须填写原因')
      return result(rdb.forceCloseJointActivity(query.jointId, input.reason))
    },
  },
  // 平台强制停用社团
  {
    url: '/api/admin/joint/:jointId/clubs/:clubId/force-suspend',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!isPlatformAdmin(url)) return forbidden()
      return result(rdb.forceSuspendJointClub(query.jointId, query.clubId))
    },
  },
  // 平台恢复停用社团
  {
    url: '/api/admin/joint/:jointId/clubs/:clubId/re-enable',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!isPlatformAdmin(url)) return forbidden()
      return result(rdb.reEnableJointClub(query.jointId, query.clubId))
    },
  },
  // 联合申请列表
  {
    url: '/api/org/:clubId/joint/:jointId/applications',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      const items = rdb.jointApplications
        .filter((a) => a.jointId === query.jointId)
        .map((a) => ({
          id: a.id, jointId: a.jointId, applicantId: a.applicantId, applicantName: a.applicantName,
          applicantStudentId: a.studentId, status: a.status, consented: a.consented,
          consentAt: a.consentAt, agreementVersion: a.agreementVersion, allowJointAdjustment: a.allowJointAdjustment,
          volunteerClubIds: a.volunteerClubIds, agreementClubSnapshot: a.agreementClubSnapshot,
          submittedAt: a.submittedAt, version: a.version,
        }))
      return ok({ items, nextCursor: null })
    },
  },
  // 联合申请详情（管理视角）
  {
    url: '/api/org/:clubId/joint/:jointId/applications/:applicantId',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      const ja = rdb.findJoint(query.jointId)
      if (!ja || !ja.clubs.some((c) => c.clubId === query.clubId)) return notFound('联合活动不存在')
      const app = rdb.findJointApplication(query.jointId, query.applicantId)
      if (!app) return notFound('联合申请不存在')
      return ok({
        id: app.id, jointId: app.jointId, applicantId: app.applicantId, applicantName: app.applicantName,
        applicantStudentId: app.studentId, status: app.status, consented: app.consented,
        consentAt: app.consentAt, agreementVersion: app.agreementVersion, allowJointAdjustment: app.allowJointAdjustment,
        volunteerClubIds: app.volunteerClubIds, agreementClubSnapshot: app.agreementClubSnapshot,
        answers: app.answers, formVersion: app.formVersion, submittedAt: app.submittedAt, version: app.version,
      })
    },
  },
  // 提交联合报名
  {
    url: '/api/activity/joint/:jointId/apply',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      const applicantId = applicantIdOf(url)
      if (!applicantId) return forbidden()
      const input = unwrap(body) as { consented: boolean; allowJointAdjustment: boolean; volunteerClubIds?: string[]; answers?: Record<string, unknown> }
      const r = rdb.submitJointApplication(query.jointId, applicantId, input)
      return result(r)
    },
  },
  // 保存联合报名草稿
  {
    url: '/api/activity/joint/:jointId/draft',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const applicantId = applicantIdOf(url)
      if (!applicantId) return forbidden()
      const me = resolveMockUser(url)
      const r = rdb.saveJointApplicationDraft(query.jointId, applicantId, me.name, me.studentId)
      return result(r)
    },
  },
  // 我的联合申请
  {
    url: '/api/activity/joint/:jointId/apply',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const applicantId = applicantIdOf(url)
      if (!applicantId) return forbidden()
      const app = rdb.findJointApplication(query.jointId, applicantId)
      if (!app) return notFound('尚未提交联合申请')
      return ok(app)
    },
  },
  // 联合面试列表
  {
    url: '/api/org/:clubId/joint/:jointId/interviews',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      const items = rdb.jointInterviews
        .filter((i) => i.jointId === query.jointId)
        .map((i) => {
          const ja = rdb.findJoint(i.jointId)
          const reviews = rdb.jointReviewExtras
            .filter((e) => e.jointId === i.jointId && e.applicantId === i.applicantId)
            .map((e) => ({
              clubId: e.clubId,
              clubName: ja?.clubs.find((c) => c.clubId === e.clubId)?.clubName || e.clubId,
              rating: e.rating,
              comment: e.comment,
              concludedAt: e.concludedAt,
            }))
          return {
            id: i.id, jointId: i.jointId, applicantId: i.applicantId, applicantName: i.applicantName,
            status: i.status, slotId: i.slotId, scheduledTime: i.startAt, endTime: i.endAt,
            attendance: i.attendance, invalidReason: i.invalidReason, attempt: i.attempt, version: i.version,
            reviews,
          }
        })
      return ok({ items, nextCursor: null })
    },
  },
  // 联合面试时段列表（管理端）
  {
    url: '/api/org/:clubId/joint/:jointId/slots',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      return ok({
        items: rdb.jointSlots
          .filter((s) => s.jointId === query.jointId)
          .map((s) => ({ id: s.id, startAt: s.startAt, endAt: s.endAt, capacity: s.capacity, available: Math.max(0, s.capacity - s.taken) })),
        nextCursor: null,
      })
    },
  },
  // 管理代预约联合面试
  {
    url: '/api/org/:clubId/joint/:jointId/interviews/book',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { applicantId?: string; slotId?: string }
      if (!input.applicantId || !input.slotId) return businessError('必须指定申请人与面试时段')
      return result(rdb.bookJointInterview(query.jointId, input.applicantId, input.slotId, true))
    },
  },
  // 联合面试出席登记
  {
    url: '/api/org/:clubId/joint/:jointId/interviews/:applicantId/attendance',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { event: 'leave' | 'late' | 'absent' }
      return result(rdb.markJointAttendance(query.jointId, query.applicantId, input.event))
    },
  },
  // 开始联合面试
  {
    url: '/api/org/:clubId/joint/:jointId/interviews/:applicantId/start',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      return result(rdb.startJointInterview(query.jointId, query.applicantId))
    },
  },
  // 完成联合面试
  {
    url: '/api/org/:clubId/joint/:jointId/interviews/:applicantId/complete',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      return result(rdb.completeJointInterview(query.jointId, query.applicantId))
    },
  },
  // 作废联合面试
  {
    url: '/api/org/:clubId/joint/:jointId/interviews/:applicantId/invalidate',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { reason?: string }
      if (!input.reason?.trim()) return businessError('作废联合面试必须填写原因')
      return result(rdb.invalidateJointInterview(query.jointId, query.applicantId, input.reason))
    },
  },
  // 我的联合面试详情（含可选时段）
  {
    url: '/api/me/interviews/joint/:jointId',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const applicantId = applicantIdOf(url)
      if (!applicantId) return forbidden()
      const it = rdb.jointInterviews.find((i) => i.jointId === query.jointId && i.applicantId === applicantId)
      if (!it) return notFound('联合面试不存在')
      const ja = rdb.findJoint(query.jointId)
      const slots = (rdb.jointSlots.filter((s) => s.jointId === query.jointId))
      const availableSlots = slots
        .filter((s) => s.id === it.slotId || s.taken < s.capacity)
        .map((s) => ({ id: s.id, time: s.startAt, endAt: s.endAt, capacity: s.capacity, booked: s.taken, available: Math.max(0, s.capacity - s.taken) }))
      return ok({
        id: it.id, jointId: it.jointId, jointTitle: ja?.title || '', applicantName: it.applicantName,
        status: it.status, scheduledTime: it.startAt, endTime: it.endAt, attendance: it.attendance,
        invalidReason: it.invalidReason, attempt: it.attempt, version: it.version, availableSlots,
      })
    },
  },
  // 预约/改期联合面试（本人）
  {
    url: '/api/me/interviews/joint/:jointId/book',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      const applicantId = applicantIdOf(url)
      if (!applicantId) return forbidden()
      const input = unwrap(body) as { slotId?: string }
      if (!input.slotId) return businessError('必须选择面试时段')
      return result(rdb.bookJointInterview(query.jointId, applicantId, input.slotId, false))
    },
  },
  // 联合结论列表（US-JNT-03：参与社团可见全部社团结论/评分/评语，实时互见）
  {
    url: '/api/org/:clubId/joint/:jointId/conclusions',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      const ja = rdb.findJoint(query.jointId)
      if (!ja) return notFound('联合活动不存在')
      if (!ja.clubs.some((c) => c.clubId === query.clubId)) return forbidden()
      return ok({ items: jointConclusionRows(query.jointId, query.clubId), nextCursor: null })
    },
  },
  // 设置联合结论（admit / not_admit）
  {
    url: '/api/org/:clubId/joint/:jointId/conclusions/:applicantId/set',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { conclusion: 'admit' | 'not_admit' }
      if (!['admit', 'not_admit'].includes(input.conclusion)) return businessError('不支持的结论')
      const me = actorInfo(url)
      return result(rdb.setJointConclusion(query.jointId, query.applicantId, query._mock_club || query.clubId, input.conclusion, me.name, me.role))
    },
  },
  // 复核结论（keep / modify）
  {
    url: '/api/org/:clubId/joint/:jointId/conclusions/:applicantId/review',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { action: 'keep' | 'modify'; newConclusion?: 'admit' | 'not_admit' }
      if (!['keep', 'modify'].includes(input.action)) return businessError('不支持的复核动作')
      const me = actorInfo(url)
      const r = rdb.reviewJointConclusion(query.jointId, query.applicantId, query._mock_club || query.clubId, input.action, me.name, me.role, input.newConclusion)
      if (r.ok && input.action === 'modify') {
        // REC-018：改判需通知原结论设置者（站内信）
        const con = rdb.jointConclusions.find(
          (c) => c.jointId === query.jointId && c.applicantId === query.applicantId && c.clubId === (query._mock_club || query.clubId),
        )
        const originUid = con?.versions[0]?.changedBy ? userIdOfName(con.versions[0].changedBy) : null
        if (originUid && userIdOfMember(me.memberId || '') !== originUid) {
          pushNotifications([originUid], {
            type: 'conclusion',
            title: '您的结论已被复核修改',
            body: `您设置的联合结论已被管理员 ${me.name} 复核并修改，请知悉。`,
            link: null,
          })
        }
      }
      return r
    },
  },
  // 联合评价提交（US-JNT-03：持久化评分+评语，跨社团互见；author_evaluate 接线）
  {
    url: '/api/org/:clubId/joint/:jointId/conclusions/:conclusionId/evaluate',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { rating?: number; comment?: string }
      const actingClub = query._mock_club || query.clubId
      const con = rdb.jointConclusions.find((c) => c.id === query.conclusionId)
      if (!con) return notFound('联合结论不存在')
      if (con.status === 'accepted_locked' || con.status === 'archived') return businessError('结论已锁定，不可再评价')
      const me = actorInfo(url)
      const extra = rdb.upsertJointReviewExtra(query.jointId, con.applicantId, actingClub, {
        rating: Number(input.rating) || 0,
        comment: input.comment || '',
        authorName: me.name,
        authorRole: me.role,
      })
      // author_evaluate 接线（SM-JNT-004）：申请人的联合面试若已完成，评价触发该状态机转换
      const ja = rdb.findJoint(query.jointId)
      if (ja && ja.status === 'published') {
        rdb.applyJointInterviewAuthorEvaluate(query.jointId, con.applicantId)
      }
      return ok({
        id: query.conclusionId, status: 'concluded',
        rating: extra.rating, comment: extra.comment, concludedAt: extra.concludedAt,
        authorName: extra.authorName, version: extra.version,
      })
    },
  },
  // 联合邀请列表
  {
    url: '/api/org/:clubId/joint/:jointId/invitations',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      const ja = rdb.findJoint(query.jointId)
      const applicantNameOf = (applicantId: string) =>
        rdb.jointApplications.find((a) => a.jointId === query.jointId && a.applicantId === applicantId)?.applicantName || applicantId
      const items = rdb.jointInvitations
        .filter((inv) => inv.jointId === query.jointId)
        .map((inv) => ({
          id: inv.id, jointId: inv.jointId, applicantId: inv.applicantId, applicantName: applicantNameOf(inv.applicantId),
          clubId: inv.clubId, clubName: ja?.clubs.find((c) => c.clubId === inv.clubId)?.clubName || '', type: inv.type,
          status: inv.status, sentAt: inv.sentAt, acceptedAt: inv.acceptedAt, expiredAt: inv.expiredAt,
          reviewFlag: inv.reviewFlag, casdoorSync: inv.casdoorSync, version: inv.version,
        }))
      return ok({ items, nextCursor: null })
    },
  },
  // 创建联合邀请
  {
    url: '/api/org/:clubId/joint/:jointId/invitations',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      const input = unwrap(body) as { applicantId?: string; clubId?: string; expireDays?: number }
      if (!input.applicantId) return businessError('必须指定申请人')
      return result(rdb.createJointInvitation(query.jointId, input.applicantId, input.clubId || query._mock_club || query.clubId, Number(input.expireDays) || 7))
    },
  },
  // 撤回联合邀请
  {
    url: '/api/org/:clubId/joint/:jointId/invitations/:invitationId/withdraw',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      return result(rdb.withdrawJointInvitation(query.invitationId))
    },
  },
  // 确认联合邀请生效
  {
    url: '/api/org/:clubId/joint/:jointId/invitations/:invitationId/sync',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!canManageJoint(url, query.clubId)) return forbidden()
      return result(rdb.confirmJointInvitationSync(query.invitationId))
    },
  },
  // 联合邀请详情（本人视角）
  {
    url: '/api/me/invitations/joint/:invitationId',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const inv = rdb.findJointInvitation(query.invitationId)
      if (!inv) return notFound('邀请不存在')
      const applicantId = applicantIdOf(url)
      if (applicantId && inv.applicantId !== applicantId) return forbidden()
      const ja = rdb.findJoint(inv.jointId)
      const applicantName = rdb.jointApplications.find((a) => a.jointId === inv.jointId && a.applicantId === inv.applicantId)?.applicantName || inv.applicantId
      return ok({
        id: inv.id, jointId: inv.jointId, jointTitle: ja?.title || '',
        clubName: ja?.clubs.find((c) => c.clubId === inv.clubId)?.clubName || '', applicantName,
        type: inv.type, status: inv.status, sentAt: inv.sentAt, acceptedAt: inv.acceptedAt, expiredAt: inv.expiredAt,
        reviewFlag: inv.reviewFlag, casdoorSync: inv.casdoorSync,
      })
    },
  },
  // 接受/拒绝联合邀请（本人）
  {
    url: '/api/me/invitations/joint/:invitationId/respond',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: unknown }) => {
      const applicantId = applicantIdOf(url)
      if (!applicantId) return forbidden()
      const input = unwrap(body) as { action: 'accept' | 'reject' }
      if (!['accept', 'reject'].includes(input.action)) return businessError('不支持的响应动作')
      const inv = rdb.jointInvitations.find((i) => i.id === query.invitationId)
      if (inv && inv.applicantId !== applicantId) return forbidden()
      return result(rdb.respondJointInvitation(query.invitationId, input.action, applicantId))
    },
  },
]

export const recruitmentApiHandlers: MockMethod[] = [...recHandlers, ...jointHandlers].map(withStatus)

export { rdb }
export function applicantIdOfUrl(url: string): string | null {
  return applicantIdOf(url)
}
