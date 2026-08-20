import { post } from '@/services/client'
import type { ApiResult } from '@/types/contracts'

export type UploadFileResult = ApiResult<{ fileId: string; uploadedAt?: string }>
export type UploadFileFn = (file: File) => Promise<UploadFileResult>

/** 附件上传（SM-FILE-001）：经 /files/upload 换取 fileId。
 * 抽离自 AttachmentUpload，使表单组件不再直接依赖业务 IO；父级可经 upload prop 注入自定义实现。 */
export function useFileUpload(): { upload: UploadFileFn } {
  return {
    // 路径不带 /api 前缀（client.buildUrl 会拼 BASE_URL）且 payload 不预包 input（client 会统一包装）
    upload: (file: File) => post<{ fileId: string; uploadedAt?: string }>('/files/upload', {
      purpose: 'form-attachment',
      name: file.name,
    }),
  }
}