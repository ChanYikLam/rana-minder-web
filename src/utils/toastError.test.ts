import { describe, expect, it, vi, beforeEach } from 'vitest'
import { toast } from 'vue-sonner'
import { toastError, toastErrorWithSupport } from './toastError'
import type { ApiError } from '@/types/contracts'

vi.mock('vue-sonner', () => ({
  toast: { error: vi.fn() },
}))

describe('toastError 错误提示三级回退链', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('无 error 时使用 fallback', () => {
    toastError({ kind: 'rejected' }, '操作失败，请重试')
    expect(toast.error).toHaveBeenCalledWith('操作失败，请重试')
  })

  it('已知错误码优先使用映射文案', () => {
    toastError({ kind: 'rejected', error: { code: 'IFC-ERR-005', message: '服务端自定义消息' } }, 'fallback')
    expect(toast.error).toHaveBeenCalledWith('提交的信息不符合要求，请检查后重试')
  })

  it('未知错误码回退服务端 message', () => {
    toastError({ kind: 'rejected', error: { code: 'BIZ-999', message: '业务自定义错误' } }, 'fallback')
    expect(toast.error).toHaveBeenCalledWith('业务自定义错误')
  })

  it('未知错误码且无 message 时回退 fallback', () => {
    toastError({ kind: 'rejected', error: { code: 'BIZ-999' } as ApiError }, '兜底文案')
    expect(toast.error).toHaveBeenCalledWith('兜底文案')
  })
})

describe('toastErrorWithSupport 支持码提示', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('无 error 时直接 fallback', () => {
    toastErrorWithSupport({ kind: 'rejected' }, '兜底')
    expect(toast.error).toHaveBeenCalledWith('兜底')
  })

  it('带 supportId 时拼接支持码', () => {
    toastErrorWithSupport({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: '', supportId: 'SUP-42' } }, '兜底')
    expect(toast.error).toHaveBeenCalledWith('操作未能安全提交，请稍后重试（支持码 SUP-42）')
  })

  it('无 supportId 时不拼接', () => {
    toastErrorWithSupport({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: '' } }, '兜底')
    expect(toast.error).toHaveBeenCalledWith('操作未能安全提交，请稍后重试')
  })
})
