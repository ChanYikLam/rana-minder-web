import { describe, expect, it } from 'vitest'
import {
  buildSubmitPayload,
  channelStatusMeta,
  clubNamesOf,
  movePreference,
  renderAnswerValue,
  restoreDraftState,
  togglePreference,
  toggleVolunteer,
  validateJointForm,
} from './jointApplyLogic'

describe('channelStatusMeta 通道状态映射', () => {
  it('四态映射完整', () => {
    expect(channelStatusMeta('open')).toEqual({ label: '报名通道开放中', tone: 'success' })
    expect(channelStatusMeta('paused')).toEqual({ label: '报名通道已暂停', tone: 'warning' })
    expect(channelStatusMeta('not_open')).toEqual({ label: '报名通道未开放', tone: 'neutral' })
    expect(channelStatusMeta('closed')).toEqual({ label: '报名通道已关闭', tone: 'danger' })
  })

  it('未知/缺失状态回退中性文案', () => {
    expect(channelStatusMeta('weird')).toEqual({ label: '报名通道状态未知', tone: 'neutral' })
    expect(channelStatusMeta(undefined)).toEqual({ label: '报名通道状态未知', tone: 'neutral' })
  })
})

describe('renderAnswerValue 答案渲染', () => {
  it('空值不展示', () => {
    expect(renderAnswerValue(null)).toBe('')
    expect(renderAnswerValue('')).toBe('')
    expect(renderAnswerValue(undefined)).toBe('')
  })

  it('数组 join、对象 JSON、标量转字符串', () => {
    expect(renderAnswerValue(['甲', '乙'])).toBe('甲、乙')
    expect(renderAnswerValue({ a: 1 })).toBe('{"a":1}')
    expect(renderAnswerValue(42)).toBe('42')
    expect(renderAnswerValue(['甲', '', null, '乙'])).toBe('甲、乙')
  })
})

describe('clubNamesOf 意向社团名称解析', () => {
  const participants = [{ id: 'c1', name: '计算机协会' }]
  const clubs = [{ id: 'c2', name: '摄影协会' }]

  it('无 id 或空数组返回空', () => {
    expect(clubNamesOf(undefined, undefined, participants, clubs)).toEqual([])
    expect(clubNamesOf([], undefined, participants, clubs)).toEqual([])
  })

  it('快照优先于详情查询', () => {
    expect(clubNamesOf(['c1'], ['旧名'], participants, clubs)).toEqual(['旧名'])
  })

  it('参与社团/部门列表查询，未命中回落原始 id', () => {
    expect(clubNamesOf(['c1', 'c2', 'c3'], undefined, participants, clubs)).toEqual(['计算机协会', '摄影协会', 'c3'])
  })
})

describe('toggleVolunteer 意向社团切换联动', () => {
  const clubs = [
    { id: 'c1', departments: [{ id: 'd1', name: '技术部' }, { id: 'd2', name: '活动部' }] },
    { id: 'c2', departments: [{ id: 'd3', name: '摄影部' }] },
  ]

  it('选中意向社团：追加且保留部门意向', () => {
    const next = toggleVolunteer(['c1'], [{ departmentId: 'd1', departmentName: '技术部' }], clubs, 'c2')
    expect(next.volunteerClubIds).toEqual(['c1', 'c2'])
    expect(next.preferences).toEqual([{ departmentId: 'd1', departmentName: '技术部' }])
  })

  it('取消意向社团：联动清理该社团下失效的部门意向，保留其他社团的', () => {
    const prefs = [
      { departmentId: 'd1', departmentName: '技术部' },
      { departmentId: 'd2', departmentName: '活动部' },
      { departmentId: 'd3', departmentName: '摄影部' },
    ]
    const next = toggleVolunteer(['c1', 'c2'], prefs, clubs, 'c1')
    expect(next.volunteerClubIds).toEqual(['c2'])
    expect(next.preferences).toEqual([{ departmentId: 'd3', departmentName: '摄影部' }])
  })

  it('取消最后一个意向社团：部门意向全部清空', () => {
    const next = toggleVolunteer(['c1'], [{ departmentId: 'd1', departmentName: '技术部' }], clubs, 'c1')
    expect(next.volunteerClubIds).toEqual([])
    expect(next.preferences).toEqual([])
  })
})

describe('togglePreference / movePreference', () => {
  it('togglePreference 添加与移除', () => {
    const added = togglePreference([], { departmentId: 'd1', departmentName: '技术部' })
    expect(added).toEqual([{ departmentId: 'd1', departmentName: '技术部' }])
    expect(togglePreference(added, { departmentId: 'd1', departmentName: '技术部' })).toEqual([])
  })

  it('movePreference 上移/下移与越界守卫', () => {
    const prefs = [
      { departmentId: 'd1', departmentName: '一' },
      { departmentId: 'd2', departmentName: '二' },
      { departmentId: 'd3', departmentName: '三' },
    ]
    expect(movePreference(prefs, 1, 'up').map((p) => p.departmentId)).toEqual(['d2', 'd1', 'd3'])
    expect(movePreference(prefs, 1, 'down').map((p) => p.departmentId)).toEqual(['d1', 'd3', 'd2'])
    expect(movePreference(prefs, 0, 'up').map((p) => p.departmentId)).toEqual(['d1', 'd2', 'd3'])
    expect(movePreference(prefs, 2, 'down').map((p) => p.departmentId)).toEqual(['d1', 'd2', 'd3'])
  })
})

describe('validateJointForm 表单校验', () => {
  const fields = [
    { id: 'f1', type: 'text', label: '姓名', required: true },
    { id: 'f2', type: 'file', label: '简历', required: false },
  ]
  const baseFile = { name: 'a.pdf', size: 1, mimeType: 'application/pdf', uploadedAt: '', checkedAt: null as string | null, downloadUrl: null as string | null }
  const checking = [{ ...baseFile, id: 'x', status: 'checking' as const }]
  const rejected = [{ ...baseFile, id: 'y', status: 'rejected' as const }]
  const deleted = [{ ...baseFile, id: 'd', status: 'deleted' as const }]
  const approved = [{ ...baseFile, id: 'z', status: 'approved' as const }]

  it('必填缺失与文件检查中/失败分别报错', () => {
    expect(validateJointForm(fields, {})).toEqual({ f1: '姓名为必填项' })
    expect(validateJointForm(fields, { f1: 'x', f2: checking })).toEqual({
      f2: '文件安全检查中，请稍候再提交',
    })
    expect(validateJointForm(fields, { f1: 'x', f2: rejected })).toEqual({
      f2: '文件上传失败，请重新上传',
    })
  })

  it('deleted 文件视为需重新处理', () => {
    expect(validateJointForm(fields, { f1: 'x', f2: deleted })).toEqual({
      f2: '文件已移除，请重新上传',
    })
  })

  it('必填 file 字段以附件数组非空为准', () => {
    const fileRequired = [{ id: 'f2', type: 'file', label: '简历', required: true }]
    expect(validateJointForm(fileRequired, {})).toEqual({ f2: '简历为必填项' })
    expect(validateJointForm(fileRequired, { f2: approved })).toEqual({})
  })

  it('必填缺失优先且不叠加附件错误，同一轮多字段错误全部报出', () => {
    expect(validateJointForm([{ id: 'f2', type: 'file', label: '简历', required: true }], { f2: [] })).toEqual({ f2: '简历为必填项' })
    const two = [
      { id: 'f1', type: 'text', label: '姓名', required: true },
      { id: 'f3', type: 'text', label: '学号', required: true },
    ]
    expect(validateJointForm(two, {})).toEqual({ f1: '姓名为必填项', f3: '学号为必填项' })
  })

  it('image 字段同样受附件状态拦截', () => {
    const image = [{ id: 'f4', type: 'image', label: '证件照', required: false }]
    expect(validateJointForm(image, { f4: checking })).toEqual({ f4: '文件安全检查中，请稍候再提交' })
  })

  it('通过时无错误', () => {
    expect(validateJointForm(fields, { f1: 'x', f2: approved })).toEqual({})
  })

  it('必填 number/checkbox/multi_select/array 按类型判空，不误报', () => {
    const typed = [
      { id: 'n', type: 'number', label: '年级', required: true },
      { id: 'c', type: 'checkbox', label: '特长', required: true },
      { id: 'm', type: 'multi_select', label: '渠道', required: true },
      { id: 'a', type: 'array', label: '经历', required: true },
    ]
    expect(validateJointForm(typed, {})).toEqual({
      n: '年级为必填项',
      c: '特长为必填项',
      m: '渠道为必填项',
      a: '经历为必填项',
    })
    expect(validateJointForm(typed, { n: 0, c: ['编程'], m: ['校内'], a: [{ _uid: 'u1' }] })).toEqual({})
    expect(validateJointForm(typed, { n: 2, c: [], m: [], a: [] })).toEqual({
      c: '特长为必填项',
      m: '渠道为必填项',
      a: '经历为必填项',
    })
  })
})

describe('buildSubmitPayload 提交载荷', () => {
  it('空意向社团时清空部门意向（防残留）', () => {
    const payload = buildSubmitPayload({
      consented: true,
      allowJointAdjustment: false,
      volunteerClubIds: [],
      preferences: [{ departmentId: 'd1', departmentName: '技术部' }],
      answers: { f1: 'x' },
    })
    expect(payload.preferences).toEqual([])
    expect(payload.volunteerClubIds).toEqual([])
  })

  it('有意向社团时原样携带', () => {
    const payload = buildSubmitPayload({
      consented: true,
      allowJointAdjustment: true,
      volunteerClubIds: ['c1'],
      preferences: [{ departmentId: 'd1', departmentName: '技术部' }],
      answers: { f1: 'x' },
    })
    expect(payload).toEqual({
      consented: true,
      allowJointAdjustment: true,
      volunteerClubIds: ['c1'],
      preferences: [{ departmentId: 'd1', departmentName: '技术部' }],
      answers: { f1: 'x' },
    })
  })
})

describe('restoreDraftState 草稿回填', () => {
  it('非 draft 态不恢复', () => {
    const restored = restoreDraftState({ status: 'submitted', answers: { f1: 'x' } }, [{ id: 'f1', type: 'text' }])
    expect(restored.answers).toEqual({})
    expect(restored.consented).toBe(false)
  })

  it('draft 态：字符串答案回填，文件字段提取 fileId，忽略非字符串值', () => {
    const restored = restoreDraftState(
      {
        status: 'draft',
        answers: { f1: '文本', f2: 'file-001', f3: { nested: true } },
        volunteerClubIds: ['c1'],
        preferences: [{ departmentId: 'd1', departmentName: '技术部' }],
        consented: true,
        allowJointAdjustment: true,
      },
      [{ id: 'f1', type: 'text' }, { id: 'f2', type: 'file' }, { id: 'f3', type: 'text' }],
    )
    expect(restored.answers).toEqual({ f1: '文本', f2: 'file-001' })
    expect(restored.fileIds).toEqual({ f2: 'file-001' })
    expect(restored.volunteerClubIds).toEqual(['c1'])
    expect(restored.preferences).toEqual([{ departmentId: 'd1', departmentName: '技术部' }])
    expect(restored.consented).toBe(true)
    expect(restored.allowJointAdjustment).toBe(true)
  })

  it('draft 态：FileMeta[] 附件值原样保留', () => {
    const fileMeta = [{ id: 'm1', name: 'a.pdf', size: 1, mimeType: 'application/pdf', status: 'approved', uploadedAt: '', checkedAt: null, downloadUrl: null }]
    const restored = restoreDraftState(
      { status: 'draft', answers: { f2: fileMeta } },
      [{ id: 'f2', type: 'file' }],
    )
    expect(restored.answers).toEqual({ f2: fileMeta })
    expect(restored.fileIds).toEqual({})
  })

  it('draft 态：number 归一并回填（不再被静默清空）', () => {
    const restored = restoreDraftState(
      { status: 'draft', answers: { n: '2024' } },
      [{ id: 'n', type: 'number' }],
    )
    expect(restored.answers).toEqual({ n: 2024 })
  })

  it('draft 态：multi_select/checkbox/array 草稿重开原样恢复', () => {
    const rows = [{ _uid: 'u1', course: '高数' }]
    const restored = restoreDraftState(
      { status: 'draft', answers: { m: ['a', 'b'], c: ['编程'], a: rows } },
      [{ id: 'm', type: 'multi_select' }, { id: 'c', type: 'checkbox' }, { id: 'a', type: 'array' }],
    )
    expect(restored.answers).toEqual({ m: ['a', 'b'], c: ['编程'], a: rows })
  })

  it('draft 态：历史 multi_select 字符串归一为数组', () => {
    const restored = restoreDraftState(
      { status: 'draft', answers: { m: 'a' } },
      [{ id: 'm', type: 'multi_select' }],
    )
    expect(restored.answers).toEqual({ m: ['a'] })
  })

  it('缺省字段使用默认值', () => {
    const restored = restoreDraftState({ status: 'draft', answers: { f1: 'x' } }, [{ id: 'f1', type: 'text' }])
    expect(restored.volunteerClubIds).toEqual([])
    expect(restored.preferences).toEqual([])
    expect(restored.consented).toBe(false)
    expect(restored.allowJointAdjustment).toBe(false)
  })
})
