/**
 * 联合报名页（JointApplyPage）纯逻辑抽取，便于单元测试。
 * 与 recruitment-status 同模式：页面仅做状态编排，决策/计算集中于此。
 */

export interface JointFormField {
  id: string
  type: string
  label: string
  required: boolean
}

export interface JointDeptPref {
  departmentId: string
  departmentName: string
}

export interface JointClub {
  id: string
  departments: { id: string; name: string }[]
}

export interface JointFileState {
  checking: boolean
  error: boolean
}

/** 联合申请通道状态 → 文案与色调（ChannelStatus: not_open/open/paused/closed） */
const CHANNEL_STATUS_META: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  open: { label: '报名通道开放中', tone: 'success' },
  paused: { label: '报名通道已暂停', tone: 'warning' },
  not_open: { label: '报名通道未开放', tone: 'neutral' },
  closed: { label: '报名通道已关闭', tone: 'danger' },
}

export function channelStatusMeta(status?: string): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  const meta = status ? CHANNEL_STATUS_META[status] : undefined
  return meta || { label: '报名通道状态未知', tone: 'neutral' }
}

/** 提交详情只读回显：数组 join、结构化对象 JSON，空值不展示 */
export function renderAnswerValue(v: unknown): string {
  if (v == null || v === '') return ''
  if (Array.isArray(v)) return v.map(renderAnswerValue).filter(Boolean).join('、')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** 意向社团 id → 名称（快照优先，其次详情参与社团/部门列表，最后回落原始 id） */
export function clubNamesOf(
  ids: string[] | undefined,
  snapshot: string[] | undefined,
  participants: { id: string; name: string }[],
  clubs: { id: string; name: string }[],
): string[] {
  if (!ids || ids.length === 0) return []
  if (snapshot?.length) return snapshot
  return ids.map(
    (id) => participants.find((p) => p.id === id)?.name || clubs.find((c) => c.id === id)?.name || id,
  )
}

/**
 * 切换意向社团：取消选择时联动清理该社团下失效的部门意向，
 * 避免"意向社团=[]、部门意向残留"的数据不一致。
 */
export function toggleVolunteer(
  selected: string[],
  preferences: JointDeptPref[],
  clubs: JointClub[],
  clubId: string,
): { volunteerClubIds: string[]; preferences: JointDeptPref[] } {
  const includes = selected.includes(clubId)
  if (!includes) {
    return { volunteerClubIds: [...selected, clubId], preferences }
  }
  const nextSelected = selected.filter((id) => id !== clubId)
  const keptDeptIds = new Set(nextSelected.flatMap((cid) => clubs.find((c) => c.id === cid)?.departments.map((d) => d.id) ?? []))
  return {
    volunteerClubIds: nextSelected,
    preferences: preferences.filter((p) => keptDeptIds.has(p.departmentId)),
  }
}

export function togglePreference(preferences: JointDeptPref[], dept: JointDeptPref): JointDeptPref[] {
  const idx = preferences.findIndex((p) => p.departmentId === dept.departmentId)
  if (idx >= 0) return preferences.filter((_, i) => i !== idx)
  return [...preferences, { departmentId: dept.departmentId, departmentName: dept.departmentName }]
}

export function movePreference(preferences: JointDeptPref[], index: number, direction: 'up' | 'down'): JointDeptPref[] {
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= preferences.length) return preferences
  const next = [...preferences]
  const temp = next[index]
  next[index] = next[target]
  next[target] = temp
  return next
}

/** 表单校验：必填缺失、文件检查中、文件上传失败 */
export function validateJointForm(
  fields: JointFormField[],
  formData: Record<string, string>,
  formFiles: Record<string, JointFileState | null>,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const field of fields) {
    if (field.required && !formData[field.id]) {
      errors[field.id] = `${field.label}为必填项`
    }
    if (field.type === 'file') {
      const f = formFiles[field.id]
      if (f?.checking) {
        errors[field.id] = '文件安全检查中，请稍候再提交'
      } else if (f?.error) {
        errors[field.id] = '文件上传失败，请重新上传'
      }
    }
  }
  return errors
}

/** 提交 payload：意向社团为空时同步清空部门意向，避免残留 */
export function buildSubmitPayload(input: {
  consented: boolean
  allowJointAdjustment: boolean
  volunteerClubIds: string[]
  preferences: JointDeptPref[]
  answers: Record<string, string>
}): {
  consented: boolean
  allowJointAdjustment: boolean
  volunteerClubIds: string[]
  preferences: JointDeptPref[]
  answers: Record<string, string>
} {
  const clubIds = input.volunteerClubIds ?? []
  return {
    consented: input.consented,
    allowJointAdjustment: input.allowJointAdjustment,
    volunteerClubIds: clubIds,
    preferences: clubIds.length === 0 ? [] : input.preferences,
    answers: { ...input.answers },
  }
}

export interface RestorableApplication {
  status: string
  answers?: Record<string, unknown>
  volunteerClubIds?: string[]
  preferences?: JointDeptPref[]
  allowJointAdjustment?: boolean
  consented?: boolean
}

/** 草稿回填纯化：仅 draft 态恢复，文件字段单独提取 fileId 用于回显附件 */
export function restoreDraftState(
  app: RestorableApplication,
  fields: { id: string; type: string }[],
): {
  answers: Record<string, string>
  fileIds: Record<string, string>
  volunteerClubIds: string[]
  preferences: JointDeptPref[]
  consented: boolean
  allowJointAdjustment: boolean
} {
  const answers: Record<string, string> = {}
  const fileIds: Record<string, string> = {}
  if (app.status === 'draft' && app.answers) {
    for (const [fieldId, value] of Object.entries(app.answers)) {
      if (typeof value !== 'string') continue
      answers[fieldId] = value
      const field = fields.find((f) => f.id === fieldId)
      if (field?.type === 'file' && value) fileIds[fieldId] = value
    }
  }
  return {
    answers,
    fileIds,
    volunteerClubIds: Array.isArray(app.volunteerClubIds) ? app.volunteerClubIds : [],
    preferences: app.preferences ? app.preferences.map((p) => ({ ...p })) : [],
    consented: app.consented ?? false,
    allowJointAdjustment: app.allowJointAdjustment ?? false,
  }
}
