import { ref, type Ref } from 'vue'
import type { ApiResult } from '@/types/contracts'
import type { PageState } from '@/types/machine'
import { errorToPageState, type ErrorCode } from '@/services/error-map'

interface UseRequestOptions<T> {
  immediate?: boolean
  initialData?: T
}

interface UseRequestReturn<T> {
  data: Ref<T | null>
  state: Ref<PageState>
  error: Ref<{ code: string; message: string; supportId?: string } | null>
  execute: () => Promise<void>
  refresh: () => Promise<void>
}

export function useRequest<T>(
  fn: () => Promise<ApiResult<T>>,
  options: UseRequestOptions<T> = {}
): UseRequestReturn<T> {
  const data = ref<T | null>(options.initialData ?? null) as Ref<T | null>
  const state = ref<PageState>(options.immediate ? 'loading' : 'normal')
  const error = ref<{ code: string; message: string; supportId?: string } | null>(null)

  let submitting = false

  async function execute() {
    if (submitting) return
    submitting = true
    state.value = 'loading'
    error.value = null

    const result = await fn()

    if (result.kind === 'completed') {
      data.value = result.data as T
      if (result.data && typeof result.data === 'object' && 'items' in result.data) {
        const items = (result.data as { items: unknown[] }).items
        state.value = items.length === 0 ? 'empty' : 'normal'
      } else {
        state.value = 'normal'
      }
    } else if (result.kind === 'accepted' || result.kind === 'external_uncertain') {
      // 异步处理中：保持 loading，不展示错误，由调用方展示"处理中"提示
      state.value = 'loading'
      error.value = null
    } else if (result.kind === 'concurrency_conflict') {
      state.value = 'error'
      error.value = { code: result.error.code, message: result.error.message, supportId: result.error.supportId }
    } else if (result.kind === 'dependency_unavailable') {
      state.value = 'error'
      error.value = { code: result.error.code, message: result.error.message, supportId: result.error.supportId }
    } else {
      const code = result.error.code as ErrorCode
      state.value = errorToPageState(code)
      error.value = { code: result.error.code, message: result.error.message, supportId: result.error.supportId }
    }

    submitting = false
  }

  async function refresh() {
    return execute()
  }

  if (options.immediate) {
    execute()
  }

  return { data, state, error, execute, refresh }
}
