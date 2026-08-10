/**
 * Mock 有状态库：动态表单（FORM）
 * 表单定义状态流转经 SM-FORM-001（draft:publish; published:deprecate/clone; deprecated:reuse/clone）；
 * 表单提交状态流转经 SM-FORM-002（draft:submit_request→checking→all_pass→submitted）。
 * 已发布版本不可覆盖：保存草稿必然产生新版本号；提交按提交时版本字段快照还原。
 */
import { assertTransition, type StatesOf } from './state-machines/transitions'
import type { FormDefinition, FormField, FormFieldType, FormVersion } from '../types/domain/form'

/** 设计器字段类型清单：与 domain/form.ts 的 FormFieldType 全量对齐（12 种） */
export const FORM_FIELD_TYPES: Array<{ type: FormFieldType; label: string }> = [
  { type: 'text', label: '短文本' },
  { type: 'textarea', label: '长文本' },
  { type: 'number', label: '数字' },
  { type: 'date', label: '日期' },
  { type: 'datetime', label: '日期时间' },
  { type: 'radio', label: '单选' },
  { type: 'multi_select', label: '多选' },
  { type: 'select', label: '下拉选择' },
  { type: 'checkbox', label: '勾选' },
  { type: 'image', label: '图片' },
  { type: 'file', label: '文件' },
  { type: 'array', label: '子表单' },
]

export const FORM_FIELD_TYPE_LIST: FormFieldType[] = FORM_FIELD_TYPES.map((t) => t.type)

/** MRM-014：词表由 SM-FORM-002 转换表派生 */
export type FormSubmissionStatus = StatesOf<'SM-FORM-002'>

export interface FormSubmission {
  id: string
  formId: string
  version: number
  idempotencyKey: string
  /** 提交人标识（mock 层为当前登录用户 id）：草稿查重与提交升级均按 (formId, version, ownerId) 隔离 */
  ownerId: string
  /** 提交时版本字段快照：旧提交按原版本还原 */
  fields: FormField[]
  data: Record<string, unknown>
  status: FormSubmissionStatus
  submittedAt: string
}

/** 稳定序列化：按对象键递归排序后 JSON.stringify，保证相同内容（键序无关）得到相同指纹（P3-1） */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const now = () => new Date().toISOString()

function err(message: string): { ok: false; error: string } {
  return { ok: false, error: message }
}
function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data }
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function field(id: string, type: FormFieldType, label: string, extra?: Partial<FormField>): FormField {
  return {
    id, type, label,
    description: null,
    required: false,
    readonly: false,
    permission: 'read_write',
    options: null,
    conditionalFieldId: null,
    conditionalValue: null,
    arrayFieldTemplateId: null,
    ...extra,
  }
}

function versionOf(form: FormDefinition, v: number): FormVersion | undefined {
  return form.versions.find((x) => x.version === v)
}

function latestVersionOf(form: FormDefinition): FormVersion {
  return form.versions[form.versions.length - 1]
}

function publishedVersionOf(form: FormDefinition): FormVersion | null {
  return form.versions.find((x) => x.status === 'published') || null
}

/** 表单种子（与既有页面桩数据对齐：form-001 招新报名表 / form-002 面试评价表 / form-003 成员信息表 / pform 平台表） */
export const formDefinitions: FormDefinition[] = [
  {
    id: 'form-001',
    clubId: 'club-001',
    title: '招新报名表',
    description: '社团招新统一报名表单',
    status: 'published',
    versions: [
      {
        version: 1, status: 'published', publishedAt: '2025-08-01T10:00:00+08:00',
        fields: [
          field('f1', 'text', '自我介绍', { description: '简要介绍自己的特长和兴趣', required: true }),
          field('f2', 'select', '意向部门', { required: true, options: ['技术部', '运营部', '设计部'] }),
          field('f3', 'textarea', '相关经历', { description: '如有相关项目或活动经历请填写' }),
          field('f4', 'file', '作品附件', { description: '可选，上传作品集或简历' }),
        ],
      },
    ],
  },
  {
    id: 'form-002',
    clubId: 'club-001',
    title: '面试评价表',
    description: '面试官评价用表单',
    status: 'published',
    versions: [
      {
        version: 1, status: 'published', publishedAt: '2025-07-20T10:00:00+08:00',
        fields: [
          field('f1', 'number', '综合评分', { required: true }),
          field('f2', 'textarea', '评语'),
        ],
      },
    ],
  },
  {
    id: 'form-003',
    clubId: 'club-001',
    title: '成员信息表',
    description: '成员基础信息登记表',
    status: 'draft',
    versions: [
      {
        version: 1, status: 'draft', publishedAt: null,
        fields: [
          field('f1', 'text', '姓名', { required: true }),
          field('f2', 'text', '学号', { required: true }),
        ],
      },
    ],
  },
  {
    id: 'pform-001',
    clubId: null,
    title: '平台通用报名表',
    description: '平台级通用报名表单',
    status: 'published',
    versions: [
      { version: 1, status: 'published', publishedAt: '2025-06-01T10:00:00+08:00', fields: [field('p1', 'text', '姓名', { required: true })] },
      { version: 2, status: 'published', publishedAt: '2025-06-20T10:00:00+08:00', fields: [field('p1', 'text', '姓名', { required: true }), field('p2', 'text', '学号', { required: true })] },
      {
        version: 3, status: 'published', publishedAt: '2025-07-01T10:00:00+08:00',
        fields: [
          field('p1', 'text', '姓名', { required: true }),
          field('p2', 'text', '学号', { required: true }),
          field('p3', 'select', '意向社团', { required: true, options: ['计算机协会', '电子设计协会', '数学建模协会'] }),
        ],
      },
    ],
  },
  {
    id: 'pform-002',
    clubId: null,
    title: '平台通用面试表',
    description: '平台级通用面试评价表单',
    status: 'published',
    versions: [
      {
        version: 1, status: 'published', publishedAt: '2025-06-15T10:00:00+08:00',
        fields: [field('p1', 'number', '综合评分', { required: true })],
      },
    ],
  },
]

export const formSubmissions: FormSubmission[] = []

export function listForms(clubId: string): Result<{
  items: Array<{ id: string; title: string; status: string; version: number; updatedAt: string }>
}> {
  const items = formDefinitions
    .filter((f) => f.clubId === clubId)
    .map((f) => ({
      id: f.id,
      title: f.title,
      status: f.status,
      version: latestVersionOf(f).version,
      updatedAt: publishedVersionOf(f)?.publishedAt || latestVersionOf(f).publishedAt || now(),
    }))
  return ok({ items })
}

export function listPlatformForms(): Result<{
  items: Array<{ id: string; title: string; status: string; version: number; scope: string; updatedAt: string }>
}> {
  const items = formDefinitions
    .filter((f) => f.clubId === null)
    .map((f) => ({
      id: f.id,
      title: f.title,
      status: f.status,
      version: latestVersionOf(f).version,
      scope: 'platform',
      updatedAt: publishedVersionOf(f)?.publishedAt || latestVersionOf(f).publishedAt || now(),
    }))
  return ok({ items })
}

function findForm(formId: string): Result<FormDefinition> {
  const form = formDefinitions.find((f) => f.id === formId)
  return form ? ok(form) : err('表单不存在')
}

export function getFormDetail(formId: string): Result<{ id: string; title: string; status: string; versions: FormVersion[] }> {
  const found = findForm(formId)
  if (!found.ok) return found
  const f = found.data
  return ok({ id: f.id, title: f.title, status: f.status, versions: structuredClone(f.versions) })
}

/** 设计器态：编辑最新草稿；无草稿时回退最新已发布版本 */
export function getDesignerState(formId: string): Result<{ id: string; title: string; status: string; fields: FormField[]; version: number }> {
  const found = findForm(formId)
  if (!found.ok) return found
  const f = found.data
  const draft = [...f.versions].reverse().find((v) => v.status === 'draft')
  const target = draft || latestVersionOf(f)
  return ok({ id: f.id, title: f.title, status: f.status, fields: structuredClone(target.fields), version: target.version })
}

/**
 * 保存草稿：已发布版本不可覆盖（新版本号必须大于已发布版本），
 * 版本冲突（expectedVersion ≠ 当前最新版本）返回冲突错误。
 */
export function saveFormDraft(
  formId: string,
  input: { fields: FormField[]; version: number; expectedVersion?: number }
): Result<{ id: string; version: number; status: 'draft'; savedAt: string }> {
  const found = findForm(formId)
  if (!found.ok) return found
  const f = found.data
  if (f.status === 'deprecated') return err('表单已停用，请先复用后再编辑')

  const published = publishedVersionOf(f)
  if (published && input.version <= published.version) {
    return err('已发布版本不可覆盖，请基于更高版本新建草稿')
  }
  const latest = latestVersionOf(f)
  if (input.expectedVersion !== undefined && latest.version !== input.expectedVersion) {
    return err('版本冲突：表单已被其他操作修改，请刷新后重试')
  }

  const existing = versionOf(f, input.version)
  if (existing) {
    existing.fields = structuredClone(input.fields)
    existing.status = 'draft'
  } else {
    f.versions.push({
      version: input.version,
      status: 'draft',
      publishedAt: null,
      fields: structuredClone(input.fields),
    })
  }
  // 表单定义状态 = 最新版本状态：保存草稿后回到 draft（已发布版本仍保留，旧提交按版本还原）
  f.status = 'draft'
  return ok({ id: f.id, version: input.version, status: 'draft', savedAt: now() })
}

/** SM-FORM-001 draft --publish--> published：发布指定草稿版本 */
export function publishForm(formId: string, version: number): Result<{ id: string; version: number; status: 'published'; publishedAt: string }> {
  const found = findForm(formId)
  if (!found.ok) return found
  const f = found.data
  const t = assertTransition('SM-FORM-001', f.status, 'published', 'publish')
  if (!t.ok) return err(t.reason || '当前状态不可发布')

  const v = versionOf(f, version)
  if (!v) return err('表单版本不存在')
  if (v.status !== 'draft') return err('仅草稿版本可发布')
  v.status = 'published'
  v.publishedAt = now()
  // 表单定义状态 = 最新版本状态
  f.status = 'published'
  return ok({ id: f.id, version: v.version, status: 'published', publishedAt: v.publishedAt })
}

/** SM-FORM-001 published --deprecate--> deprecated：停用后已发布版本均标记 deprecated，历史保留 */
export function deprecateForm(formId: string): Result<{ id: string; status: 'deprecated'; deprecatedAt: string }> {
  const found = findForm(formId)
  if (!found.ok) return found
  const f = found.data
  const t = assertTransition('SM-FORM-001', f.status, 'deprecated', 'deprecate')
  if (!t.ok) return err(t.reason || '当前状态不可停用')
  f.versions.forEach((v) => {
    if (v.status === 'published') v.status = 'deprecated'
  })
  f.status = 'deprecated'
  return ok({ id: f.id, status: 'deprecated', deprecatedAt: now() })
}

/**
 * SM-FORM-001 deprecated --reuse--> draft：复用后回到可编辑草稿。
 * 已发布/已停用版本保留历史标记（版本审计轨迹不丢失），
 * 仅在最新版本已是草稿时直接复用；否则新建草稿版本承载编辑（已发布版本不可覆盖）。
 */
export function reuseForm(formId: string): Result<{ id: string; status: 'draft'; version: number }> {
  const found = findForm(formId)
  if (!found.ok) return found
  const f = found.data
  const t = assertTransition('SM-FORM-001', f.status, 'draft', 'reuse')
  if (!t.ok) return err(t.reason || '当前状态不可复用')
  const latest = latestVersionOf(f)
  let draft = latest.status === 'draft' ? latest : null
  if (!draft) {
    draft = {
      version: latest.version + 1,
      status: 'draft',
      publishedAt: null,
      fields: structuredClone(latest.fields),
    }
    f.versions.push(draft)
  }
  f.status = 'draft'
  return ok({ id: f.id, status: 'draft', version: draft.version })
}

let formSeq = 0

/** SM-FORM-001 published|deprecated --clone--> draft：克隆生成独立草稿（不携带任何已提交数据） */
export function cloneForm(formId: string, title?: string): Result<{ id: string; title: string; status: 'draft'; version: number }> {
  const found = findForm(formId)
  if (!found.ok) return found
  const f = found.data
  const t = assertTransition('SM-FORM-001', f.status, 'draft', 'clone')
  if (!t.ok) return err(t.reason || '当前状态不可克隆')

  const source = publishedVersionOf(f) || latestVersionOf(f)
  formSeq += 1
  const newId = `${f.clubId === null ? 'pform' : 'form'}-${String(Date.now().toString(36))}${formSeq.toString(36)}`
  const clone: FormDefinition = {
    id: newId,
    clubId: f.clubId,
    title: title || `${f.title}（副本）`,
    description: f.description,
    status: 'draft',
    versions: [{ version: 1, status: 'draft', publishedAt: null, fields: structuredClone(source.fields) }],
  }
  formDefinitions.push(clone)
  return ok({ id: clone.id, title: clone.title, status: 'draft', version: 1 })
}

/**
 * SM-FORM-002 草稿落库：仅保存/更新 draft 状态的提交记录（不推进状态机）。
 * 与设计器保存草稿（SM-FORM-001，保存表单定义）语义不同：此处保存的是用户填写的表单数据。
 * 草稿按 (formId, version, ownerId) 隔离：同一用户同一表单同一版本最多保留一份草稿，
 * 重复保存更新既有草稿而非新建；不同用户互不覆盖（P1-1）。
 * 相同 idempotencyKey 幂等更新；已提交记录不可再被草稿覆盖。
 * 同键不同内容返回 IFC-ERR-009 语义错误（P3-1）。
 */
export function saveFormSubmissionDraft(
  formId: string,
  input: { version: number; formData: Record<string, unknown>; idempotencyKey: string; ownerId: string }
): Result<FormSubmission> {
  const found = findForm(formId)
  if (!found.ok) return found
  const f = found.data

  const v = versionOf(f, input.version)
  if (!v) return err('表单版本不存在')
  if (v.status !== 'published') return err('当前版本未发布，不可保存草稿')

  // 幂等：相同 idempotencyKey（含用户维度）的既有记录直接更新
  const byKey = formSubmissions.find(
    (s) => s.formId === formId && s.ownerId === input.ownerId && s.idempotencyKey === input.idempotencyKey,
  )
  if (byKey) {
    if (byKey.status !== 'draft') return err('该草稿已提交，不可再保存')
    if (stableStringify(byKey.data) !== stableStringify(input.formData)) {
      return err('相同操作标识对应了不同内容，请刷新后重试')
    }
    byKey.fields = structuredClone(v.fields)
    byKey.data = structuredClone(input.formData)
    byKey.version = input.version
    return ok(byKey)
  }

  // 同一用户同一表单同一版本最多一份草稿：更新既有草稿而非新建（不同用户不互相覆盖）
  const sameVersionDraft = formSubmissions.find(
    (s) => s.formId === formId && s.ownerId === input.ownerId && s.version === input.version && s.status === 'draft',
  )
  if (sameVersionDraft) {
    sameVersionDraft.fields = structuredClone(v.fields)
    sameVersionDraft.data = structuredClone(input.formData)
    sameVersionDraft.idempotencyKey = input.idempotencyKey
    return ok(sameVersionDraft)
  }

  const submission: FormSubmission = {
    id: `sub-${Date.now().toString(36)}-${formSubmissions.length + 1}`,
    formId,
    version: input.version,
    idempotencyKey: input.idempotencyKey,
    ownerId: input.ownerId,
    fields: structuredClone(v.fields),
    data: structuredClone(input.formData),
    status: 'draft',
    submittedAt: now(),
  }
  formSubmissions.push(submission)
  return ok(submission)
}

/** 读取当前用户在当前表单版本的草稿/已提交记录（用于刷新后回填，P2-1）；不存在返回 null */
export function getMyFormSubmission(
  formId: string,
  ownerId: string,
  version: number,
): Result<{ id: string; version: number; status: FormSubmissionStatus; data: Record<string, unknown>; submittedAt: string } | null> {
  const found = findForm(formId)
  if (!found.ok) return found
  const v = versionOf(found.data, version)
  if (!v) return err('表单版本不存在')
  const mine = formSubmissions.find(
    (s) => s.formId === formId && s.ownerId === ownerId && s.version === version,
  )
  if (!mine) return ok(null)
  return ok({ id: mine.id, version: mine.version, status: mine.status, data: structuredClone(mine.data), submittedAt: mine.submittedAt })
}

/**
 * SM-FORM-002 提交链路：draft --submit_request--> checking --all_pass--> submitted。
 * 仅允许提交已发布版本；提交内容按该版本字段快照留存（旧提交按原版本还原）；
 * 相同 idempotencyKey（含用户维度）幂等返回既有提交。
 * 同键不同内容返回 IFC-ERR-009 语义错误（P3-1）；草稿升级按 (formId, version, ownerId) 隔离（P1-1）。
 */
export function submitFormSubmission(
  formId: string,
  input: { version: number; formData: Record<string, unknown>; idempotencyKey: string; ownerId: string }
): Result<FormSubmission> {
  const found = findForm(formId)
  if (!found.ok) return found
  const f = found.data

  // 幂等：相同 idempotencyKey（含用户维度）且非草稿的既有提交直接返回（草稿记录不参与幂等命中，
  // 否则「先存草稿再提交相同内容」会被草稿“吞掉”，正式提交静默失败、状态仍为 draft）
  const existing = formSubmissions.find(
    (s) => s.ownerId === input.ownerId && s.idempotencyKey === input.idempotencyKey && s.status !== 'draft',
  )
  if (existing) {
    // 同键不同内容：拒绝幂等返回，按 IFC-ERR-009 语义拦截（相同操作标识对应不同内容）
    if (stableStringify(existing.data) !== stableStringify(input.formData)) {
      return err('相同操作标识对应了不同内容，请勿重复提交')
    }
    return ok(existing)
  }

  const v = versionOf(f, input.version)
  if (!v) return err('表单版本不存在')
  if (v.status !== 'published') return err('当前版本未发布，不可提交')

  // 同一用户同表单同版本的既有草稿：就地升级为正式提交（复用记录，不重复落库），
  // 避免同一用户「保存草稿后直接提交」产生两条记录；不覆盖其他用户的草稿
  const sameVersionDraft = formSubmissions.find(
    (s) => s.formId === formId && s.ownerId === input.ownerId && s.version === input.version && s.status === 'draft',
  )
  if (sameVersionDraft) {
    sameVersionDraft.data = structuredClone(input.formData)
    const t1 = assertTransition('SM-FORM-002', sameVersionDraft.status, 'checking', 'submit_request')
    if (!t1.ok) return err(t1.reason || '提交请求不合法')
    sameVersionDraft.status = 'checking'
    const t2 = assertTransition('SM-FORM-002', sameVersionDraft.status, 'submitted', 'all_pass')
    if (!t2.ok) return err(t2.reason || '提交检查未通过')
    sameVersionDraft.status = 'submitted'
    return ok(sameVersionDraft)
  }

  const submission: FormSubmission = {
    id: `sub-${Date.now().toString(36)}-${formSubmissions.length + 1}`,
    formId,
    version: input.version,
    idempotencyKey: input.idempotencyKey,
    ownerId: input.ownerId,
    fields: structuredClone(v.fields),
    data: structuredClone(input.formData),
    status: 'draft',
    submittedAt: now(),
  }
  const t1 = assertTransition('SM-FORM-002', submission.status, 'checking', 'submit_request')
  if (!t1.ok) return err(t1.reason || '提交请求不合法')
  submission.status = 'checking'
  const t2 = assertTransition('SM-FORM-002', submission.status, 'submitted', 'all_pass')
  if (!t2.ok) return err(t2.reason || '提交检查未通过')
  submission.status = 'submitted'
  formSubmissions.push(submission)
  return ok(submission)
}

export function resetForms(): void {
  const seed = structuredClone(formDefinitionsSeed)
  formDefinitions.splice(0, formDefinitions.length, ...seed)
  formSubmissions.splice(0, formSubmissions.length)
  // MRM-013：表单克隆序号归位（cloneForm 会递增 formSeq，跨用例残留导致 id 膨胀）
  formSeq = 0
}

const formDefinitionsSeed = structuredClone(formDefinitions)
