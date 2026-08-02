import { toast } from 'vue-sonner'
import type { ApiError } from '@/types/contracts'
import { ERROR_MESSAGES, type ErrorCode } from '@/services/error-map'

export interface ToastErrorResult {
  kind: string
  error?: ApiError
}

function errorMessage(error: ApiError | undefined, fallback: string): string {
  if (!error) return fallback
  const code = error.code as ErrorCode
  return ERROR_MESSAGES[code] ?? error.message ?? fallback
}

/** 操作失败分支统一提示：优先使用错误码映射文案，其次服务端 message，最后 fallback */
export function toastError(
  result: ToastErrorResult,
  fallback: string,
): void {
  toast.error(errorMessage(result.error, fallback))
}

/** 与 toastError 相同，但追加支持码便于用户反馈 */
export function toastErrorWithSupport(
  result: ToastErrorResult,
  fallback: string,
): void {
  const error = result.error
  if (!error) {
    toast.error(fallback)
    return
  }
  const message = errorMessage(error, fallback)
  toast.error(error.supportId ? `${message}（支持码 ${error.supportId}）` : message)
}
