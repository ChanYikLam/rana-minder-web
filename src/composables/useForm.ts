import { ref, type Ref } from 'vue'
import type { ZodType } from 'zod'
import type { ApiResult } from '@/types/contracts'

interface UseFormOptions<T> {
  schema: ZodType<T>
  initialValues?: Partial<T>
  onSubmit: (values: T) => Promise<ApiResult<T>>
}

interface UseFormReturn<T> {
  values: Ref<Partial<T>>
  errors: Ref<Record<string, string>>
  fieldErrors: Ref<Record<string, string[]>>
  submitting: Ref<boolean>
  submitError: Ref<string | null>
  versionConflict: Ref<boolean>
  handleSubmit: () => Promise<void>
  setFieldError: (field: string, message: string) => void
  clearErrors: () => void
  setServerErrors: (fieldErrors: Record<string, string[]>) => void
}

export function useForm<T extends Record<string, unknown>>(
  options: UseFormOptions<T>
): UseFormReturn<T> {
  const values = ref<Partial<T>>(options.initialValues || {}) as Ref<Partial<T>>
  const errors = ref<Record<string, string>>({})
  const fieldErrors = ref<Record<string, string[]>>({})
  const submitting = ref(false)
  const submitError = ref<string | null>(null)
  const versionConflict = ref(false)

  async function handleSubmit() {
    if (submitting.value) return

    errors.value = {}
    fieldErrors.value = {}
    submitError.value = null
    versionConflict.value = false

    const parseResult = options.schema.safeParse(values.value)
    if (!parseResult.success) {
      const fieldErrs: Record<string, string> = {}
      for (const issue of parseResult.error.issues) {
        const path = issue.path.join('.')
        if (!fieldErrs[path]) {
          fieldErrs[path] = issue.message
        }
      }
      errors.value = fieldErrs
      return
    }

    submitting.value = true
    const result = await options.onSubmit(parseResult.data)
    submitting.value = false

    if (result.kind === 'completed') {
      return
    }

    if (result.kind === 'accepted') {
      submitError.value = '操作正在处理中'
      return
    }

    if (result.kind === 'concurrency_conflict') {
      versionConflict.value = true
      submitError.value = result.error.message
      return
    }

    if (result.kind === 'rejected' && result.error.fieldErrors) {
      const fieldErrs: Record<string, string> = {}
      for (const [field, messages] of Object.entries(result.error.fieldErrors)) {
        fieldErrs[field] = messages[0]
      }
      fieldErrors.value = result.error.fieldErrors
      errors.value = fieldErrs
      return
    }

    submitError.value = result.error?.message || '提交失败，请稍后重试'
  }

  function setFieldError(field: string, message: string) {
    errors.value[field] = message
  }

  function clearErrors() {
    errors.value = {}
    fieldErrors.value = {}
    submitError.value = null
    versionConflict.value = false
  }

  function setServerErrors(serverFieldErrors: Record<string, string[]>) {
    fieldErrors.value = serverFieldErrors
    const fieldErrs: Record<string, string> = {}
    for (const [field, messages] of Object.entries(serverFieldErrors)) {
      fieldErrs[field] = messages[0]
    }
    errors.value = fieldErrs
  }

  return {
    values,
    errors,
    fieldErrors,
    submitting,
    submitError,
    versionConflict,
    handleSubmit,
    setFieldError,
    clearErrors,
    setServerErrors,
  }
}
