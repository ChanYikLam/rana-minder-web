import { toast } from 'vue-sonner'
import type { ApiError } from '@/types/contracts'
import { ERROR_MESSAGES, type ErrorCode } from '@/services/error-map'
import { toastAcceptedAction } from '@/utils/acceptedResult'

export interface ToastErrorResult {
  kind: 'rejected' | 'accepted' | 'external_uncertain' | 'dependency_unavailable' | 'concurrency_conflict' | string
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
  if (result.kind === 'accepted') {
    // 202/IFC-ERR-014：异步受理不是失败，统一提示已受理，避免引导重复提交
    toastAcceptedAction()
    return
  }
  if (result.kind === 'external_uncertain') {
    // IFC-ERR-013：结果暂时无法确认，提示不要重复提交（不再落入失败误报）
    toast.info(ERROR_MESSAGES['IFC-ERR-013'])
    return
  }
  toast.error(errorMessage(result.error, fallback))
}

/** 与 toastError 相同，但追加支持码便于用户反馈 */
export function toastErrorWithSupport(
  result: ToastErrorResult,
  fallback: string,
): void {
  if (result.kind === 'accepted') {
    toastAcceptedAction()
    return
  }
  if (result.kind === 'external_uncertain') {
    toast.info(ERROR_MESSAGES['IFC-ERR-013'])
    return
  }
  const error = result.error
  if (!error) {
    toast.error(fallback)
    return
  }
  const message = errorMessage(error, fallback)
  toast.error(error.supportId ? `${message}（支持码 ${error.supportId}）` : message)
}
