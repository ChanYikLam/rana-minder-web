<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { get, post } from '@/services/client'
import type { PageState } from '@/types/machine'
import type { FormField } from '@/types/domain/form'
import type { DynamicFormValue } from '@/components/form/DynamicForm.vue'
import DynamicForm from '@/components/form/DynamicForm.vue'
import { toast } from 'vue-sonner'
import { Save, Send, FileWarning } from '@lucide/vue'
import { resolveApiScope } from '@/services/route-scope'

interface FormVersion { version: number; status: string; publishedAt: string | null; fields: FormField[] }

const route = useRoute()
const state = ref<PageState>('loading')
const formTitle = ref('')
const versions = ref<FormVersion[]>([])
const currentVersion = ref<FormVersion | null>(null)
const formData = ref<DynamicFormValue>({})
const submitting = ref(false)
const saving = ref(false)

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
  } else {
    state.value = 'error'
  }
}

async function handleSaveDraft() {
  saving.value = true
  const formId = route.params.formId as string
  const apiScope = resolveApiScope(route)
  if (!apiScope) { saving.value = false; return }

  if (currentVersion.value?.status === 'published') {
    toast.error('已发布版本不可覆盖，请修改后创建新草稿')
    saving.value = false
    return
  }

  const nextVersion = (currentVersion.value?.version || 1) + 1
  const result = await post(`${apiScope.prefix}/forms/designer/${formId}/save`, {
    fields: currentVersion.value?.fields || [],
    version: nextVersion,
    expectedVersion: currentVersion.value?.version || 1,
  })
  saving.value = false
  if (result.kind === 'completed') {
    const data = result.data as { version?: number }
    toast.success(`草稿已保存（v${data?.version ?? nextVersion}）`)
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '保存失败，请稍后重试')
  } else {
    toast.error('保存失败，请稍后重试')
  }
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

async function handleSubmit() {
  submitting.value = true
  const formId = route.params.formId as string
  const apiScope = resolveApiScope(route)
  if (!apiScope) { submitting.value = false; return }

  // 稳定的幂等键：基于 formId + version + formData 内容哈希，相同内容 → 相同键
  const dataFingerprint = stableHash(JSON.stringify(formData.value))
  const idempotencyKey = `${formId}-v${currentVersion.value?.version || 1}-${dataFingerprint}`

  const result = await post(`${apiScope.prefix}/forms/versions/${formId}/submit`, {
    formData: formData.value,
    version: currentVersion.value?.version || 1,
    idempotencyKey,
  })
  submitting.value = false
  if (result.kind === 'completed') {
    toast.success('表单已提交')
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '提交失败')
  } else {
    toast.error('提交失败，请稍后重试')
  }
}

onMounted(loadForm)
</script>

<template>
  <PageStateBoundary :state="state" title="表单填写" @retry="loadForm">
    <div v-if="currentVersion" class="max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold text-text-primary mb-1">{{ formTitle }}</h1>
      <p class="text-sm text-text-secondary mb-6">版本 v{{ currentVersion.version }} · {{ currentVersion.publishedAt ? '已发布' : '草稿' }}</p>

      <Card class="mb-4">
        <DynamicForm v-model="formData" :fields="currentVersion.fields" />
      </Card>

      <!-- FORM-007: 文件检查状态提示 -->
      <div class="mb-4 rounded-lg bg-warning-subtle p-3 flex items-center gap-2">
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
