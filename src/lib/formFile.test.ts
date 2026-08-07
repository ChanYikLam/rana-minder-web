import { describe, expect, it } from 'vitest'
import { fileBlockingError, isFieldFilled, isFileFieldFilled, restoredFieldValue, restoredFileMeta } from './formFile'

const baseFile = { name: 'a.pdf', size: 1, mimeType: 'application/pdf', uploadedAt: '', checkedAt: null as string | null, downloadUrl: null as string | null }

describe('fileBlockingError 附件状态拦截', () => {
  const approved = [{ ...baseFile, id: 'z', status: 'approved' as const }]
  const checking = [{ ...baseFile, id: 'x', status: 'checking' as const }]
  const uploading = [{ ...baseFile, id: 'u', status: 'uploading' as const }]
  const rejected = [{ ...baseFile, id: 'y', status: 'rejected' as const }]
  const quarantined = [{ ...baseFile, id: 'q', status: 'quarantined' as const }]
  const deleted = [{ ...baseFile, id: 'd', status: 'deleted' as const }]

  it('非数组或空数组不拦截', () => {
    expect(fileBlockingError(undefined)).toBeNull()
    expect(fileBlockingError('file-001')).toBeNull()
    expect(fileBlockingError([])).toBeNull()
  })

  it('approved/uploaded 放行', () => {
    expect(fileBlockingError(approved)).toBeNull()
    expect(fileBlockingError([{ ...baseFile, id: 'u2', status: 'uploaded' as const }])).toBeNull()
  })

  it('检查中/上传中/被拒绝/隔离/删除分别拦截', () => {
    expect(fileBlockingError(checking)).toBe('文件安全检查中，请稍候再提交')
    expect(fileBlockingError(uploading)).toBe('文件安全检查中，请稍候再提交')
    expect(fileBlockingError(rejected)).toBe('文件上传失败，请重新上传')
    expect(fileBlockingError(quarantined)).toBe('附件疑似恶意内容已隔离，请联系管理员处理')
    expect(fileBlockingError(deleted)).toBe('文件已移除，请重新上传')
  })

  it('多文件命中首个拦截状态', () => {
    expect(fileBlockingError([approved[0], checking[0], rejected[0]])).toBe('文件安全检查中，请稍候再提交')
  })
})

describe('isFileFieldFilled 必填判定', () => {
  it('仅附件数组非空视为已填', () => {
    expect(isFileFieldFilled([])).toBe(false)
    expect(isFileFieldFilled(undefined)).toBe(false)
    expect(isFileFieldFilled('file-001')).toBe(false)
    expect(isFileFieldFilled([{ ...baseFile, id: 'z', status: 'approved' as const }])).toBe(true)
  })
})

describe('isFieldFilled 按类型必填判定', () => {
  it('字符串类型：非空字符串视为已填', () => {
    expect(isFieldFilled('x', 'text')).toBe(true)
    expect(isFieldFilled('', 'text')).toBe(false)
    expect(isFieldFilled('   ', 'textarea')).toBe(false)
    expect(isFieldFilled(0, 'select')).toBe(false)
  })

  it('number：任意数值视为已填，空/未填视为缺失', () => {
    expect(isFieldFilled(42, 'number')).toBe(true)
    expect(isFieldFilled(0, 'number')).toBe(true)
    expect(isFieldFilled('0', 'number')).toBe(true)
    expect(isFieldFilled('', 'number')).toBe(false)
    expect(isFieldFilled(undefined, 'number')).toBe(false)
    expect(isFieldFilled(null, 'number')).toBe(false)
  })

  it('multi_select/checkbox/array：非空数组视为已填', () => {
    expect(isFieldFilled(['a'], 'multi_select')).toBe(true)
    expect(isFieldFilled(['a'], 'checkbox')).toBe(true)
    expect(isFieldFilled([{ x: 1 }], 'array')).toBe(true)
    expect(isFieldFilled([], 'multi_select')).toBe(false)
    expect(isFieldFilled([], 'array')).toBe(false)
    expect(isFieldFilled(undefined, 'checkbox')).toBe(false)
    expect(isFieldFilled(true, 'checkbox')).toBe(true)
  })

  it('file/image：附件数组非空为准', () => {
    expect(isFieldFilled([{ ...baseFile, id: 'z', status: 'approved' as const }], 'image')).toBe(true)
    expect(isFieldFilled([], 'file')).toBe(false)
  })
})

describe('restoredFieldValue 非附件值归一', () => {
  it('number：归一为数字，空串保持空串，不可解析返回 undefined', () => {
    expect(restoredFieldValue(42, 'number')).toBe(42)
    expect(restoredFieldValue('42', 'number')).toBe(42)
    expect(restoredFieldValue('', 'number')).toBe('')
    expect(restoredFieldValue('abc', 'number')).toBeUndefined()
  })

  it('multi_select/checkbox：数组原样、历史字符串包一层、空为 []', () => {
    expect(restoredFieldValue(['a', 'b'], 'multi_select')).toEqual(['a', 'b'])
    expect(restoredFieldValue('a', 'multi_select')).toEqual(['a'])
    expect(restoredFieldValue('', 'multi_select')).toEqual([])
    // checkbox 布尔历史值（无选项布尔勾选）保留为 [true]，与 isFieldFilled(true) 判定对齐，不再被清空
    expect(restoredFieldValue(true, 'checkbox')).toEqual([true])
  })

  it('array：数组原样、非数组回空数组', () => {
    const rows = [{ _uid: 'u1', name: '甲' }]
    expect(restoredFieldValue(rows, 'array')).toEqual(rows)
    expect(restoredFieldValue('x', 'array')).toEqual([])
  })

  it('字符串类型：字符串原样保留，其他值返回 undefined（调用方忽略）', () => {
    expect(restoredFieldValue('文本', 'text')).toBe('文本')
    expect(restoredFieldValue({ a: 1 }, 'text')).toBeUndefined()
    expect(restoredFieldValue(42, 'text')).toBeUndefined()
  })
})

describe('restoredFileMeta 草稿回填', () => {
  it('非字符串/空字符串返回空数组', () => {
    expect(restoredFileMeta(null)).toEqual([])
    expect(restoredFileMeta('')).toEqual([])
    expect(restoredFileMeta(42)).toEqual([])
  })

  it('历史 fileId 字符串回填为中性 uploaded 占位', () => {
    const meta = restoredFileMeta('file-001')
    expect(meta).toHaveLength(1)
    expect(meta[0]).toMatchObject({ id: 'file-001', name: '已上传附件', status: 'uploaded', downloadUrl: null })
  })

  it('FileMeta[] 原样保留', () => {
    const files = [{ ...baseFile, id: 'm1', status: 'approved' as const, uploadedAt: 't' }]
    expect(restoredFileMeta(files)).toEqual(files)
  })

  it('混合数组：字符串元素按 fileId 形态生成中性 FileMeta，不递归取下标', () => {
    const files = [
      { ...baseFile, id: 'm1', name: '真实.pdf', status: 'approved' as const, uploadedAt: 't' },
      'file-002',
    ]
    const restored = restoredFileMeta(files)
    expect(restored).toHaveLength(2)
    expect(restored[0]).toEqual(files[0])
    expect(restored[1]).toMatchObject({ id: 'file-002', name: '已上传附件', status: 'uploaded' })
  })

  it('混合数组中空字符串元素被过滤', () => {
    const restored = restoredFileMeta([{ ...baseFile, id: 'm1', status: 'approved' as const }, '', 'file-003'])
    expect(restored).toHaveLength(2)
    expect(restored.map((f) => f.id)).toEqual(['m1', 'file-003'])
  })
})
