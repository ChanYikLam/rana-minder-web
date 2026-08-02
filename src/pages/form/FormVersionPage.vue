<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { Banner } from '@/components/feedback'
import { get, post } from '@/services/client'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { Save, Send, Upload } from '@lucide/vue'
import { resolveApiScope } from '@/services/route-scope'

interface FormField { id: string; type: string; label: string; description: string | null; required: boolean; readonly: boolean; permission: string; options: string[] | null }
interface FormVersion { version: number; status: string; publishedAt: string | null; fields: FormField[] }

const route = useRoute()
const state = ref<PageState>('loading')
const formTitle = ref('')
const versions = ref<FormVersion[]>([])
const currentVersion = ref<FormVersion | null>(null)
const formData = reactive<Record<string, string>>({})
const formErrors = ref<Record<string, string>>({})
const submitting = ref(false)
const saving = ref(false)

interface FileUploadState { file: File | null; status: 'idle' | 'scanning' | 'safe' | 'unsafe'; message: string }
const fileUploads = reactive<Record<string, FileUploadState>>({})
const fileTimers = new Map<string, ReturnType<typeof setTimeout>>()

function getFileUpload(fieldId: string): FileUploadState {
  if (!fileUploads[fieldId]) {
    fileUploads[fieldId] = { file: null, status: 'idle', message: '' }
  }
  return fileUploads[fieldId]
}

function handleFileSelect(fieldId: string, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const upload = getFileUpload(fieldId)
  upload.file = file
  upload.status = 'scanning'
  upload.message = '文件正在安全检查中...'
  formData[fieldId] = file.name
  // 清理已有定时器，避免重选文件后旧回调覆盖新状态
  const existing = fileTimers.get(fieldId)
  if (existing) clearTimeout(existing)
  // 模拟安全检查；实际应调用后端上传/检查接口
  fileTimers.set(fieldId, setTimeout(() => {
    upload.status = 'safe'
    upload.message = '文件安全检查通过'
    fileTimers.delete(fieldId)
  }, 2000))
  // 允许重选同一文件
  input.value = ''
}

onBeforeUnmount(() => {
  fileTimers.forEach((t) => clearTimeout(t))
  fileTimers.clear()
})

function handleFileClick(fieldId: string) {
  const input = document.getElementById(`file-input-${fieldId}`) as HTMLInputElement | null
  input?.click()
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
  if (currentVersion.value?.status === 'published') {
    toast.error('已发布版本不可覆盖，请先创建新版本')
    return
  }
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
  if (!currentVersion.value) return
  formErrors.value = {}
  for (const field of currentVersion.value.fields) {
    if (field.type === 'file') {
      const upload = getFileUpload(field.id)
      if (field.required && !upload.file) {
        formErrors.value[field.id] = `${field.label}为必填项`
      } else if (upload.file && upload.status === 'scanning') {
        formErrors.value[field.id] = `${field.label}附件安全检查中，请稍后提交`
      } else if (upload.file && upload.status === 'unsafe') {
        formErrors.value[field.id] = `${field.label}附件未通过安全检查`
      }
    } else if (field.required && !formData[field.id]) {
      formErrors.value[field.id] = `${field.label}为必填项`
    }
  }
  if (Object.keys(formErrors.value).length > 0) return

  submitting.value = true
  const formId = route.params.formId as string
  const apiScope = resolveApiScope(route)
  if (!apiScope) { submitting.value = false; return }
  const result = await post(`${apiScope.prefix}/forms/${formId}/submissions`, {
    version: currentVersion.value.version,
    answers: formData,
  })
  submitting.value = false
  if (result.kind === 'completed') {
    toast.success('提交成功')
  } else if (result.kind === 'rejected' && result.error) {
    toast.error(result.error.message || '提交失败')
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
        <div class="space-y-4">
          <div v-for="field in currentVersion.fields" :key="field.id">
            <label :for="field.id" class="block text-sm font-medium text-text-primary mb-1">
              {{ field.label }}
              <span v-if="field.required" class="text-danger">*</span>
              <span v-if="field.readonly" class="text-xs text-text-secondary ml-1">（只读）</span>
            </label>
            <p v-if="field.description" class="text-xs text-text-secondary mb-1.5">{{ field.description }}</p>

            <input
              v-if="field.type === 'text'"
              :id="field.id"
              :value="formData[field.id] || ''"
              type="text"
              :readonly="field.readonly"
              class="w-full h-10 px-3 rounded-md border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
              :class="formErrors[field.id] ? 'border-danger' : 'border-border'"
              @input="formData[field.id] = ($event.target as HTMLInputElement).value"
            />

            <textarea
              v-else-if="field.type === 'textarea'"
              :id="field.id"
              :value="formData[field.id] || ''"
              rows="4"
              class="w-full px-3 py-2 rounded-md border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
              :class="formErrors[field.id] ? 'border-danger' : 'border-border'"
              @input="formData[field.id] = ($event.target as HTMLTextAreaElement).value"
            />

            <select
              v-else-if="field.type === 'select'"
              :id="field.id"
              :value="formData[field.id] || ''"
              class="w-full h-10 px-3 rounded-md border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
              :class="formErrors[field.id] ? 'border-danger' : 'border-border'"
              @change="formData[field.id] = ($event.target as HTMLSelectElement).value"
            >
              <option value="">请选择</option>
              <option v-for="opt in field.options" :key="opt" :value="opt">{{ opt }}</option>
            </select>

            <div v-else-if="field.type === 'file'" class="relative">
              <input
                :id="`file-input-${field.id}`"
                type="file"
                class="hidden"
                @change="handleFileSelect(field.id, $event)"
              />
              <button
                :id="field.id"
                type="button"
                class="w-full h-24 rounded-md border border-dashed flex flex-col items-center justify-center gap-1 text-text-secondary hover:border-primary hover:text-primary transition-colors"
                :class="formErrors[field.id] ? 'border-danger' : 'border-border'"
                @click="handleFileClick(field.id)"
              >
                <Upload :size="20" />
                <span class="text-xs">{{ getFileUpload(field.id).file ? getFileUpload(field.id).file!.name : '点击上传文件' }}</span>
              </button>
              <p
                v-if="getFileUpload(field.id).message"
                class="text-xs mt-1"
                :class="getFileUpload(field.id).status === 'safe' ? 'text-success' : 'text-warning'"
              >
                {{ getFileUpload(field.id).message }}
              </p>
            </div>

            <p v-if="formErrors[field.id]" class="mt-1 text-xs text-danger" role="alert">{{ formErrors[field.id] }}</p>
          </div>
        </div>
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
