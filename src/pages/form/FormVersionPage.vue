<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { Banner } from '@/components/feedback'
import { DynamicForm, type DynamicFormValue } from '@/components/form'
import type { FormField as DomainFormField } from '@/types/domain/form'
import { get, post } from '@/services/client'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { Save, Send } from '@lucide/vue'
import { resolveApiScope } from '@/services/route-scope'

interface FormField { id: string; type: string; label: string; description: string | null; required: boolean; readonly: boolean; permission: string; options: string[] | null }
interface FormVersion { version: number; status: string; publishedAt: string | null; fields: FormField[] }

const route = useRoute()
const state = ref<PageState>('loading')
const formTitle = ref('')
const versions = ref<FormVersion[]>([])
const currentVersion = ref<FormVersion | null>(null)
const formData = reactive<DynamicFormValue>({})
const submitting = ref(false)
const saving = ref(false)

function toDomainFields(fields: FormField[]): DomainFormField[] {
  return fields.map((f) => ({
    id: f.id,
    type: (['text', 'textarea', 'number', 'select', 'multi_select', 'radio', 'checkbox', 'date', 'datetime', 'file', 'array'].includes(f.type) ? f.type : 'text') as DomainFormField['type'],
    label: f.label,
    description: f.description,
    required: f.required,
    readonly: f.readonly,
    permission: (f.permission === 'read_write' || f.permission === 'read_only' || f.permission === 'hidden' ? f.permission : f.readonly ? 'read_only' : 'read_write'),
    options: f.options,
    conditionalFieldId: null,
    conditionalValue: null,
    arrayFieldTemplateId: null,
  }))
}

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
  const result = await post(`${apiScope.prefix}/forms/designer/${formId}/save`, {
    fields: currentVersion.value?.fields || [],
    version: currentVersion.value?.version || 1,
  })
  saving.value = false
  if (result.kind === 'completed') {
    toast.success('草稿已保存')
  } else {
    toast.error('保存失败，请稍后重试')
  }
}

async function handleSubmit() {
  submitting.value = true
  await new Promise((r) => setTimeout(r, 800))
  submitting.value = false
}

onMounted(loadForm)
</script>

<template>
  <PageStateBoundary :state="state" title="表单填写" @retry="loadForm">
    <div v-if="currentVersion" class="max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold text-text-primary mb-1">{{ formTitle }}</h1>
      <p class="text-sm text-text-secondary mb-6">版本 v{{ currentVersion.version }} · {{ currentVersion.publishedAt ? '已发布' : '草稿' }}</p>

      <Card class="mb-4">
        <DynamicForm :fields="toDomainFields(currentVersion.fields)" v-model="formData" />
      </Card>

      <!-- FORM-007: 文件检查状态提示 -->
      <Banner
        tone="warning"
        title="附件安全检查中"
        message="附件正在安全检查中时不可正式提交，但可保存草稿。检查完成后方可提交。"
        class="mb-4"
      />

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
