import { describe, expect, it, beforeEach } from 'vitest'
import {
  formDefinitions, formSubmissions, FORM_FIELD_TYPE_LIST,
  listForms, listPlatformForms, getFormDetail, getDesignerState,
  saveFormDraft, publishForm, deprecateForm, reuseForm, cloneForm, submitFormSubmission, saveFormSubmissionDraft,
  getMyFormSubmission, stableStringify,
} from './db-forms'
import { resetRecruitmentDB } from './reset'

/** P0-003 回归：动态表单引擎接线（SM-FORM-001 定义流转 / SM-FORM-002 提交链路） */
describe('P0-003 动态表单引擎（SM-FORM-001 / SM-FORM-002）', () => {
  beforeEach(() => {
    resetRecruitmentDB()
  })

  it('表单列表：社团范围与平台范围各自可见', () => {
    const club = listForms('club-001')
    expect(club.ok).toBe(true)
    const items = club.ok ? club.data.items : []
    expect(items.map((i) => i.id)).toEqual(['form-001', 'form-002', 'form-003'])
    expect(items.find((i) => i.id === 'form-001')?.status).toBe('published')
    expect(items.find((i) => i.id === 'form-003')?.status).toBe('draft')

    const platform = listPlatformForms()
    expect(platform.ok).toBe(true)
    const pitems = platform.ok ? platform.data.items : []
    expect(pitems.map((i) => i.id)).toEqual(['pform-001', 'pform-002'])
    expect(pitems[0].scope).toBe('platform')
    expect(pitems[0].version).toBe(3)
  })

  it('保存草稿：产生新版本号；expectedVersion 冲突报错', () => {
    const ok1 = saveFormDraft('form-003', { fields: [{ id: 'f1', type: 'text', label: '姓名', description: null, required: true, readonly: false, permission: 'read_write', options: null, conditionalFieldId: null, conditionalValue: null, arrayFieldTemplateId: null }], version: 2, expectedVersion: 1 })
    expect(ok1.ok).toBe(true)
    expect(ok1.ok && ok1.data.version).toBe(2)

    const conflict = saveFormDraft('form-003', { fields: [], version: 3, expectedVersion: 1 })
    expect(conflict.ok).toBe(false)
    expect(conflict.ok || conflict.error).toContain('冲突')

    const detail = getFormDetail('form-003')
    expect(detail.ok && detail.data.versions.map((v) => v.version)).toEqual([1, 2])
  })

  it('已发布版本不可覆盖：version ≤ 已发布版本号被拒绝', () => {
    const overwrite = saveFormDraft('form-001', { fields: [], version: 1, expectedVersion: 1 })
    expect(overwrite.ok).toBe(false)
    expect(overwrite.ok || overwrite.error).toContain('不可覆盖')
    // 高于已发布版本则允许（新建草稿）
    const next = saveFormDraft('form-001', { fields: [], version: 2, expectedVersion: 1 })
    expect(next.ok).toBe(true)
  })

  it('SM-FORM-001 发布：draft → published，publishedAt 落库；重复发布被拒', () => {
    const published = publishForm('form-003', 1)
    expect(published.ok).toBe(true)
    expect(published.ok && published.data.status).toBe('published')
    expect(published.ok && published.data.publishedAt).toBeTruthy()

    const detail = getFormDetail('form-003')
    expect(detail.ok && detail.data.status).toBe('published')
    expect(detail.ok && detail.data.versions[0].status).toBe('published')

    const republish = publishForm('form-003', 1)
    expect(republish.ok).toBe(false)
  })

  it('SM-FORM-001 停用/复用：published → deprecated（历史版本保留）→ draft，复用新建草稿版本不覆盖历史', () => {
    const dep = deprecateForm('form-001')
    expect(dep.ok).toBe(true)
    expect(dep.ok && dep.data.status).toBe('deprecated')
    const depDetail = getFormDetail('form-001')
    expect(depDetail.ok && depDetail.data.versions[0].status).toBe('deprecated')

    // 停用期间不可直接保存草稿
    const saveWhileDeprecated = saveFormDraft('form-001', { fields: [], version: 2, expectedVersion: 1 })
    expect(saveWhileDeprecated.ok).toBe(false)

    const reuse = reuseForm('form-001')
    expect(reuse.ok).toBe(true)
    expect(reuse.ok && reuse.data.status).toBe('draft')
    expect(reuse.ok && reuse.data.version).toBe(2)
    const reused = getFormDetail('form-001')
    // P3-3：历史版本保留 deprecated 标记（版本审计轨迹不丢失），新建 v2 草稿承载编辑
    expect(reused.ok && reused.data.status).toBe('draft')
    expect(reused.ok && reused.data.versions.map((v) => v.version)).toEqual([1, 2])
    expect(reused.ok && reused.data.versions[0].status).toBe('deprecated')
    expect(reused.ok && reused.data.versions[1].status).toBe('draft')
    // 设计器态：编辑最新草稿 v2
    const designer = getDesignerState('form-001')
    expect(designer.ok && designer.data.version).toBe(2)
  })

  it('SM-FORM-001 克隆：published/deprecated → 独立草稿（字段同源、数据不携带）', () => {
    const cloned = cloneForm('form-001', '招新报名表 2026')
    expect(cloned.ok).toBe(true)
    expect(cloned.ok && cloned.data.status).toBe('draft')
    expect(cloned.ok && cloned.data.version).toBe(1)
    const newId = cloned.ok ? cloned.data.id : ''
    expect(newId).not.toBe('form-001')

    const state = getDesignerState(newId)
    expect(state.ok && state.data.title).toBe('招新报名表 2026')
    expect(state.ok && state.data.fields.map((f) => f.label)).toEqual(['自我介绍', '意向部门', '相关经历', '作品附件'])

    // 克隆不携带任何提交数据
    expect(formSubmissions.filter((s) => s.formId === newId)).toHaveLength(0)
    expect(formDefinitions.some((f) => f.id === 'form-001')).toBe(true)

    // deprecated 状态也可克隆
    deprecateForm('form-002')
    const cloneDep = cloneForm('form-002')
    expect(cloneDep.ok).toBe(true)
  })

  it('SM-FORM-002 提交：draft → checking → submitted，字段快照按提交时版本留存', () => {
    const sub = submitFormSubmission('form-001', {
      version: 1,
      formData: { f1: '热爱编程', f2: '技术部' },
      idempotencyKey: 'form-001-v1-hash-abc',
      ownerId: 'user-a',
    })
    expect(sub.ok).toBe(true)
    expect(sub.ok && sub.data.status).toBe('submitted')
    expect(sub.ok && sub.data.fields.map((f) => f.id)).toEqual(['f1', 'f2', 'f3', 'f4'])
    expect(sub.ok && sub.data.data).toEqual({ f1: '热爱编程', f2: '技术部' })

    // 发布 v2 后旧提交仍按 v1 快照还原
    saveFormDraft('form-001', { fields: [], version: 2, expectedVersion: 1 })
    publishForm('form-001', 2)
    const sub2 = submitFormSubmission('form-001', {
      version: 2,
      formData: {},
      idempotencyKey: 'form-001-v2-hash-def',
      ownerId: 'user-a',
    })
    expect(sub2.ok).toBe(true)
    const old = formSubmissions.find((s) => s.formId === 'form-001' && s.version === 1)
    expect(old?.fields.map((f) => f.id)).toEqual(['f1', 'f2', 'f3', 'f4'])
    expect(old?.data.f1).toBe('热爱编程')
  })

  it('SM-FORM-002 幂等：相同 idempotencyKey 返回既有提交，不重复落库', () => {
    const first = submitFormSubmission('form-001', { version: 1, formData: { f1: 'x' }, idempotencyKey: 'same-key', ownerId: 'user-a' })
    const second = submitFormSubmission('form-001', { version: 1, formData: { f1: 'x' }, idempotencyKey: 'same-key', ownerId: 'user-a' })
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(first.ok && second.ok ? first.data.id : '').toBe(second.ok ? second.data.id : '')
    expect(formSubmissions).toHaveLength(1)
  })

  it('SM-FORM-002 回归（P1）：先保存草稿再提交相同内容，草稿不被幂等键吞掉，就地升级为 submitted', () => {
    // 先保存草稿（与提交相同 formData/idempotencyKey）
    const draft = saveFormSubmissionDraft('form-001', {
      version: 1,
      formData: { f1: '热爱编程', f2: '技术部' },
      idempotencyKey: 'form-001-v1-hash-abc',
      ownerId: 'user-a',
    })
    expect(draft.ok).toBe(true)
    expect(draft.ok && draft.data.status).toBe('draft')

    // 内容不变直接提交：不得命中草稿静默返回，必须走 draft→checking→submitted 状态机
    const sub = submitFormSubmission('form-001', {
      version: 1,
      formData: { f1: '热爱编程', f2: '技术部' },
      idempotencyKey: 'form-001-v1-hash-abc',
      ownerId: 'user-a',
    })
    expect(sub.ok).toBe(true)
    expect(sub.ok && sub.data.status).toBe('submitted')
    // 复用草稿记录升级，不新增记录；提交数据与草稿一致
    expect(formSubmissions.filter((s) => s.formId === 'form-001')).toHaveLength(1)
    expect(formSubmissions[0].id).toBe(draft.ok ? draft.data.id : '')
    expect(formSubmissions[0].status).toBe('submitted')
    expect(formSubmissions[0].data).toEqual({ f1: '热爱编程', f2: '技术部' })

    // 提交完成后，相同 idempotencyKey 再提交：命中已提交记录幂等返回 submitted
    const again = submitFormSubmission('form-001', {
      version: 1,
      formData: { f1: '热爱编程', f2: '技术部' },
      idempotencyKey: 'form-001-v1-hash-abc',
      ownerId: 'user-a',
    })
    expect(again.ok).toBe(true)
    expect(again.ok && again.data.status).toBe('submitted')
    expect(formSubmissions.filter((s) => s.formId === 'form-001')).toHaveLength(1)
  })

  it('SM-FORM-002 回归（P1）：既有草稿因表单版本变化被改数据后提交，仍可就地升级', () => {
    // 先保存草稿，随后修改表单内容再提交（同一 idempotencyKey 语义下草稿被 update 过）
    saveFormSubmissionDraft('form-001', {
      version: 1,
      formData: { f1: '初稿', f2: '技术部' },
      idempotencyKey: 'form-001-v1-hash-xyz',
      ownerId: 'user-a',
    })
    const sub = submitFormSubmission('form-001', {
      version: 1,
      formData: { f1: '终稿', f2: '技术部' },
      idempotencyKey: 'form-001-v1-hash-xyz',
      ownerId: 'user-a',
    })
    expect(sub.ok).toBe(true)
    expect(sub.ok && sub.data.status).toBe('submitted')
    expect(formSubmissions.filter((s) => s.formId === 'form-001')).toHaveLength(1)
    expect(formSubmissions[0].data).toEqual({ f1: '终稿', f2: '技术部' })
  })

  it('SM-FORM-002 前置：未发布版本不可提交', () => {
    const draft = submitFormSubmission('form-003', { version: 1, formData: {}, idempotencyKey: 'form-003-v1', ownerId: 'user-a' })
    expect(draft.ok).toBe(false)
    expect(draft.ok || draft.error).toContain('未发布')
  })

  it('SM-FORM-002 草稿落库（P0-1）：保存用户填写数据，不新建表单定义版本', () => {
    // form-001 为已发布表单（v1），用户在此版本填写并保存草稿
    const draft = saveFormSubmissionDraft('form-001', {
      version: 1,
      formData: { f1: '热爱编程', f2: '技术部' },
      idempotencyKey: 'form-001-v1-hash-abc',
      ownerId: 'user-a',
    })
    expect(draft.ok).toBe(true)
    expect(draft.ok && draft.data.status).toBe('draft')
    expect(draft.ok && draft.data.data).toEqual({ f1: '热爱编程', f2: '技术部' })
    // 关键：不产生新的表单定义版本（不再 version+1 新建空版本）
    const detail = getFormDetail('form-001')
    expect(detail.ok && detail.data.versions.map((v) => v.version)).toEqual([1])
    expect(detail.ok && detail.data.versions[0].status).toBe('published')

    // 再次保存同一草稿（内容变化 → 内容哈希幂等键随之变化）：更新既有草稿，不重复落库
    const draft2 = saveFormSubmissionDraft('form-001', {
      version: 1,
      formData: { f1: '热爱编程（更新）', f2: '技术部' },
      idempotencyKey: 'form-001-v1-hash-abc-updated',
      ownerId: 'user-a',
    })
    expect(draft2.ok).toBe(true)
    expect(draft2.ok && draft2.data.id).toBe(draft.ok ? draft.data.id : '')
    expect(formSubmissions.filter((s) => s.formId === 'form-001')).toHaveLength(1)
    expect(formSubmissions[0].data.f1).toBe('热爱编程（更新）')
  })

  it('SM-FORM-002 草稿落库：未发布版本不可保存；已提交记录不可被草稿覆盖', () => {
    const onDraftForm = saveFormSubmissionDraft('form-003', {
      version: 1,
      formData: { f1: 'x' },
      idempotencyKey: 'form-003-v1',
      ownerId: 'user-a',
    })
    expect(onDraftForm.ok).toBe(false)
    expect(onDraftForm.ok || onDraftForm.error).toContain('未发布')

    // 先正式提交 v1，再尝试以草稿覆盖 → 拒绝
    submitFormSubmission('form-001', { version: 1, formData: {}, idempotencyKey: 'form-001-v1-submit', ownerId: 'user-a' })
    const overwriteSubmitted = saveFormSubmissionDraft('form-001', {
      version: 1,
      formData: { f1: '覆盖' },
      idempotencyKey: 'form-001-v1-submit',
      ownerId: 'user-a',
    })
    expect(overwriteSubmitted.ok).toBe(false)
  })

  it('SM-FORM-002 草稿按用户隔离（P1-1）：不同用户草稿互不覆盖，升级提交不串数据', () => {
    // 用户 A 保存草稿
    const a = saveFormSubmissionDraft('form-001', {
      version: 1,
      formData: { f1: 'A 的内容', f2: '技术部' },
      idempotencyKey: 'k-a-1',
      ownerId: 'user-a',
    })
    expect(a.ok).toBe(true)
    // 用户 B 保存同一表单同一版本草稿：不得覆盖 A
    const b = saveFormSubmissionDraft('form-001', {
      version: 1,
      formData: { f1: 'B 的内容', f2: '运营部' },
      idempotencyKey: 'k-b-1',
      ownerId: 'user-b',
    })
    expect(b.ok).toBe(true)
    expect(formSubmissions.filter((s) => s.formId === 'form-001' && s.status === 'draft')).toHaveLength(2)
    // A 的草稿未被覆盖
    const aDraft = formSubmissions.find((s) => s.ownerId === 'user-a')
    expect(aDraft?.data).toEqual({ f1: 'A 的内容', f2: '技术部' })

    // B 提交：只升级 B 的草稿，A 的草稿保持 draft
    const bSub = submitFormSubmission('form-001', {
      version: 1,
      formData: { f1: 'B 的内容', f2: '运营部' },
      idempotencyKey: 'k-b-1',
      ownerId: 'user-b',
    })
    expect(bSub.ok).toBe(true)
    expect(bSub.ok && bSub.data.status).toBe('submitted')
    expect(formSubmissions.find((s) => s.ownerId === 'user-b')?.status).toBe('submitted')
    expect(formSubmissions.find((s) => s.ownerId === 'user-a')?.status).toBe('draft')
  })

  it('SM-FORM-002 读取本人记录（P2-1）：草稿可恢复，未保存返回 null', () => {
    saveFormSubmissionDraft('form-001', {
      version: 1,
      formData: { f1: '我的草稿', f2: '技术部' },
      idempotencyKey: 'k-a-2',
      ownerId: 'user-a',
    })
    const mine = getMyFormSubmission('form-001', 'user-a', 1)
    expect(mine.ok).toBe(true)
    expect(mine.ok && mine.data?.status).toBe('draft')
    expect(mine.ok && mine.data?.data).toEqual({ f1: '我的草稿', f2: '技术部' })

    // 其他用户读取不到 A 的记录
    const other = getMyFormSubmission('form-001', 'user-b', 1)
    expect(other.ok).toBe(true)
    expect(other.ok && other.data).toBeNull()

    // 提交后仍可读到（已提交记录）
    submitFormSubmission('form-001', {
      version: 1,
      formData: { f1: '我的草稿', f2: '技术部' },
      idempotencyKey: 'k-a-2',
      ownerId: 'user-a',
    })
    const after = getMyFormSubmission('form-001', 'user-a', 1)
    expect(after.ok && after.data?.status).toBe('submitted')
  })

  it('SM-FORM-002 幂等同键不同内容（P3-1）：提交/草稿均拒绝而非静默覆盖', () => {
    // 提交：同键不同内容 → IFC-ERR-009 语义错误
    submitFormSubmission('form-001', {
      version: 1,
      formData: { f1: '原始内容' },
      idempotencyKey: 'k-conflict-1',
      ownerId: 'user-a',
    })
    const conflict = submitFormSubmission('form-001', {
      version: 1,
      formData: { f1: '不同内容' },
      idempotencyKey: 'k-conflict-1',
      ownerId: 'user-a',
    })
    expect(conflict.ok).toBe(false)
    expect(conflict.ok || conflict.error).toContain('相同操作标识')

    // 草稿：同键不同内容 → 拒绝
    saveFormSubmissionDraft('form-001', {
      version: 1,
      formData: { f1: '草稿A' },
      idempotencyKey: 'k-conflict-2',
      ownerId: 'user-a',
    })
    const draftConflict = saveFormSubmissionDraft('form-001', {
      version: 1,
      formData: { f1: '草稿B' },
      idempotencyKey: 'k-conflict-2',
      ownerId: 'user-a',
    })
    expect(draftConflict.ok).toBe(false)
    expect(draftConflict.ok || draftConflict.error).toContain('相同操作标识')
    // 原草稿未被覆盖
    expect(formSubmissions.find((s) => s.idempotencyKey === 'k-conflict-2')?.data).toEqual({ f1: '草稿A' })
  })

  it('stableStringify（P3-1）：键序无关，相同内容得到相同指纹', () => {
    expect(stableStringify({ f1: 'a', f2: 'b' })).toBe(stableStringify({ f2: 'b', f1: 'a' }))
    expect(stableStringify({ f1: 'a', f2: 'b' })).not.toBe(stableStringify({ f1: 'a', f2: 'c' }))
    expect(stableStringify({ a: [1, 2], b: { c: 1 } })).toBe(stableStringify({ b: { c: 1 }, a: [1, 2] }))
    // 数组顺序有意义：不同顺序 → 不同指纹
    expect(stableStringify({ a: [1, 2] })).not.toBe(stableStringify({ a: [2, 1] }))
  })

  it('设计器字段类型与 FormFieldType 全量对齐（12 种，含 datetime/select/checkbox/array）', () => {
    expect(FORM_FIELD_TYPE_LIST).toEqual([
      'text', 'textarea', 'number', 'date', 'datetime',
      'radio', 'multi_select', 'select', 'checkbox',
      'image', 'file', 'array',
    ])
    expect(FORM_FIELD_TYPE_LIST).toHaveLength(12)
  })
})
