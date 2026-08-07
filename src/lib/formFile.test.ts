import { describe, expect, it } from 'vitest'
import { fileBlockingError, isFileFieldFilled, restoredFileMeta } from './formFile'

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
