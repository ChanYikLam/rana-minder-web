import { describe, expect, it, beforeEach } from 'vitest'
import {
  formDefinitions, formSubmissions, FORM_FIELD_TYPE_LIST,
  listForms, listPlatformForms, getFormDetail, getDesignerState,
  saveFormDraft, publishForm, deprecateForm, reuseForm, cloneForm, submitFormSubmission,
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
    })
    expect(sub2.ok).toBe(true)
    const old = formSubmissions.find((s) => s.formId === 'form-001' && s.version === 1)
    expect(old?.fields.map((f) => f.id)).toEqual(['f1', 'f2', 'f3', 'f4'])
    expect(old?.data.f1).toBe('热爱编程')
  })

  it('SM-FORM-002 幂等：相同 idempotencyKey 返回既有提交，不重复落库', () => {
    const first = submitFormSubmission('form-001', { version: 1, formData: { f1: 'x' }, idempotencyKey: 'same-key' })
    const second = submitFormSubmission('form-001', { version: 1, formData: { f1: 'x' }, idempotencyKey: 'same-key' })
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(first.ok && second.ok ? first.data.id : '').toBe(second.ok ? second.data.id : '')
    expect(formSubmissions).toHaveLength(1)
  })

  it('SM-FORM-002 前置：未发布版本不可提交', () => {
    const draft = submitFormSubmission('form-003', { version: 1, formData: {}, idempotencyKey: 'form-003-v1' })
    expect(draft.ok).toBe(false)
    expect(draft.ok || draft.error).toContain('未发布')
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
