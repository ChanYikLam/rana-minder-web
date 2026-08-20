<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { get, post } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import type { PageState } from '@/types/machine'
import type { FormField } from '@/types/domain/form'
import type { DynamicFormValue } from '@/components/form/DynamicForm.vue'
import DynamicForm from '@/components/form/DynamicForm.vue'
import { toast } from 'vue-sonner'
import { Save, Send, FileWarning } from '@lucide/vue'
import { resolveApiScope } from '@/services/route-scope'
import { fileBlockingError, isFieldFilled, restoredFieldValue, restoredFileMeta, draftSafeFileMeta } from '@/lib/formFile'

interface FormVersion { version: number; status: string; publishedAt: string | null; fields: FormField[] }
interface MyFormRecord { id?: string; version?: number; status?: string; data?: Record<string, unknown>; submittedAt?: string }

const route = useRoute()
const state = ref<PageState>('loading')
const formTitle = ref('')
const versions = ref<FormVersion[]>([])
const currentVersion = ref<FormVersion | null>(null)
const formData = ref<DynamicFormValue>({})
const formErrors = ref<Record<string, string[]>>({})
const submitting = ref(false)
const saving = ref(false)
const hasMyRecord = ref(false)

const hasAttachmentFields = computed(() =>
  (currentVersion.value?.fields || []).some((f) => f.type === 'file' || f.type === 'image')
)

async function loadForm() {
  state.value = 'loading'
  const formId = route.params.formId as string
  const apiScope = resolveApiScope(route)
  if (!apiScope) { state.value = 'error'; return }
  const result = await get<{ id: string; title: string; versions: FormVersion[] }>(`${apiScope.prefix}/forms/${formId}`)
  if (result.kind === 'completed') {
    formTitle.value = result.data.title
    versions.value = result.data.versions
    currentVersion.value = versions.value[0] || null
    formData.value = {}
    state.value = 'normal'
    if (currentVersion.value) {
      await loadMyRecord(formId, apiScope.prefix, currentVersion.value)
    }
  } else { state.value = errorToPageState(errorCodeOf(result)) }
}

/** P2-1：刷新/重进页面后恢复本人草稿/已提交记录（能存也能取） */
async function loadMyRecord(formId: string, prefix: string, version: FormVersion) {
  const versionNo = version.version || 1
  const result = await get<MyFormRecord>(`${prefix}/forms/versions/${formId}/my-draft`, { version: versionNo })
  if (result.kind === 'completed' && result.data && typeof result.data.data === 'object' && result.data.data !== null) {
    const record = result.data.data as Record<string, unknown>
    for (const [fieldId, value] of Object.entries(record)) {
      const field = version.fields.find((f) => f.id === fieldId)
      if (!field) continue
      if (field.type === 'file' || field.type === 'image') {
        formData.value[fieldId] = restoredFileMeta(value)
        continue
      }
      const restored = restoredFieldValue(value, field.type)
      if (restored !== undefined) formData.value[fieldId] = restored
    }
    hasMyRecord.value = result.data.status === 'draft'
  }
}

function buildFingerprint(value: DynamicFormValue): string {
  // 稳定序列化：键序无关，相同内容 → 相同指纹（P3-1），避免 {f1,f2} 与 {f2,f1} 生成不同幂等键
  return stableHash(stableStringify(value))
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function stableHash(value: string): string {
  // 简单稳定的字符串哈希（FNV-1a 变种），用于幂等键指纹
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

function validateForSubmit(): boolean {
  const errors: Record<string, string[]> = {}
  const fields = currentVersion.value?.fields || []
  for (const field of fields) {
    const value = formData.value[field.id]
    if (field.required && !isFieldFilled(value, field.type)) {
      errors[field.id] = [`${field.label}为必填项`]
    }
    if (field.type === 'file' || field.type === 'image') {
      const msg = fileBlockingError(value)
      if (msg) {
        errors[field.id] = [...(errors[field.id] ?? []), msg]
      }
    }
  }
  formErrors.value = errors
  return Object.keys(errors).length === 0
}

async function handleSaveDraft() {
  const formId = route.params.formId as string
  const apiScope = resolveApiScope(route)
  if (!apiScope) return
  saving.value = true
  try {
    const version = currentVersion.value?.version || 1
    // 草稿落库前对 file/image 字段做归一：瞬态 uploading 丢弃、checking 降级 uploaded，
    // 避免重开草稿后出现永远无法 auto-approve / 无法提交的卡死文件（P1-2，见 formFile.draftSafeFileMeta）
    const draftData: DynamicFormValue = {}
    for (const [fieldId, value] of Object.entries(formData.value)) {
      const field = currentVersion.value?.fields.find((f) => f.id === fieldId)
      if (field?.type === 'file' || field?.type === 'image') {
        const safe = draftSafeFileMeta(value)
        if (safe !== undefined) draftData[fieldId] = safe
        continue
      }
      draftData[fieldId] = value
    }

    // 稳定的幂等键：基于 formId + version + formData 内容哈希，相同内容 → 相同键，避免重复提交
    const dataFingerprint = buildFingerprint(draftData)
    const idempotencyKey = `${formId}-v${version}-${dataFingerprint}`

    const result = await post(`${apiScope.prefix}/forms/versions/${formId}/draft`, {
      formData: draftData,
      version,
      idempotencyKey,
    })
    if (result.kind === 'completed') {
      const data = result.data as { status?: string; savedAt?: string; submittedAt?: string }
      const savedAt = data?.savedAt ?? data?.submittedAt
      toast.success(savedAt ? `草稿已保存（${new Date(savedAt).toLocaleString()}）` : '草稿已保存')
    } else if (result.kind === 'concurrency_conflict') {
      // P3-3：保留版本/幂等冲突的专属提示，避免落入泛化文案
      toast.error((result.error as { message?: string }).message || '表单已被其他操作修改，请刷新后重试')
    } else if (result.kind === 'rejected' && result.error) {
      toast.error((result.error as { message?: string }).message || '保存失败，请稍后重试')
    } else {
      toast.error('保存失败，请稍后重试')
    }
  } finally {
    saving.value = false
  }
}

async function handleSubmit() {
  // P1-2：提交前必填校验 + 附件安全状态校验，空数据/未检查附件不可提交
  if (!validateForSubmit()) {
    toast.error('请完善必填项并确认附件检查完成后再提交')
    return
  }
  submitting.value = true
  const formId = route.params.formId as string
  const apiScope = resolveApiScope(route)
  if (!apiScope) { submitting.value = false; return }
  try {
    // 稳定的幂等键：基于 formId + version + formData 内容哈希，相同内容 → 相同键
    const dataFingerprint = buildFingerprint(formData.value)
    const idempotencyKey = `${formId}-v${currentVersion.value?.version || 1}-${dataFingerprint}`

    const result = await post(`${apiScope.prefix}/forms/versions/${formId}/submit`, {
      formData: formData.value,
      version: currentVersion.value?.version || 1,
      idempotencyKey,
    })
    if (result.kind === 'completed') {
      hasMyRecord.value = true
      toast.success('表单已提交')
    } else if (result.kind === 'concurrency_conflict') {
      toast.error((result.error as { message?: string }).message || '表单已被其他操作修改，请刷新后重试')
    } else if (result.kind === 'rejected' && result.error) {
      toast.error((result.error as { message?: string }).message || '提交失败')
    } else {
      toast.error('提交失败，请稍后重试')
    }
  } finally {
    submitting.value = false
  }
}

onMounted(loadForm)
</script>

<template>
  <PageStateBoundary :state="state" title="表单填写" @retry="loadForm">
    <div v-if="currentVersion" class="max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold text-text-primary mb-1">{{ formTitle }}</h1>
      <p class="text-sm text-text-secondary mb-6">版本 v{{ currentVersion.version }} · {{ currentVersion.publishedAt ? '已发布' : '草稿' }}</p>

      <div v-if="hasMyRecord" class="mb-4 rounded-lg bg-warning-subtle p-3 flex items-center gap-2">
        <FileWarning :size="16" class="text-warning" />
        <p class="text-xs text-warning">已为您恢复此前保存的内容，可继续修改后提交。</p>
      </div>

      <Card class="mb-4">
        <DynamicForm v-model="formData" :fields="currentVersion.fields" :field-errors="formErrors" />
      </Card>

      <!-- FORM-007: 文件检查状态提示（仅当版本存在附件字段时展示，P2-66） -->
      <div v-if="hasAttachmentFields" class="mb-4 rounded-lg bg-warning-subtle p-3 flex items-center gap-2">
        <FileWarning :size="16" class="text-warning" />
        <p class="text-xs text-warning">附件正在安全检查中时不可正式提交，但可保存草稿。检查完成后方可提交。</p>
      </div>

      <div class="flex gap-3">
        <button
          class="flex items-center gap-1.5 px-4 h-11 rounded-md border border-border text-text-primary hover:bg-subtle disabled:opacity-60"
          :disabled="saving"
          @click="handleSaveDraft"
        >
          <Save :size="16" /> {{ saving ? '保存中...' : '保存草稿' }}
        </button>
        <button
          class="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover disabled:opacity-60"
          :disabled="submitting"
          @click="handleSubmit"
        >
          <Send :size="16" /> {{ submitting ? '提交中...' : '提交表单' }}
        </button>
      </div>
    </div>
  </PageStateBoundary>
</template>
