<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card, Button, ResponsiveActionRegion } from '@/components/common'
import { get, post } from '@/services/client'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { ArrowLeft, Plus, X, ChevronUp, ChevronDown, Upload, Save, Send, FileWarning, CheckCircle2, AlertTriangle } from '@lucide/vue'
import { resolveStatusLabel } from '@/components/business/stateLabels'

interface ActivityDetail { id: string; title: string; clubName: string; deadline: string; departments: { id: string; name: string }[]; formId: string }
interface FormField { id: string; type: string; label: string; description: string | null; required: boolean; readonly: boolean; permission: string; options: string[] | null }

const route = useRoute()
const router = useRouter()

const state = ref<PageState>('loading')
const activity = ref<ActivityDetail | null>(null)
const formFields = ref<FormField[]>([])

const formData = reactive<Record<string, string>>({})
interface FormFile { fileId: string; name: string; size: number; checking: boolean; error: boolean }
const formFiles = reactive<Record<string, FormFile | null>>({})
const formErrors = ref<Record<string, string>>({})
const preferences = ref<{ departmentId: string; departmentName: string }[]>([])
const submitting = ref(false)
const submitError = ref<string | null>(null)
const savedDraft = ref(false)
const savingDraft = ref(false)

const myApplication = ref<MyApplication | null>(null)

/** 仅当申请状态为 submitted 才算"已提交"，草稿（draft）用户仍可继续填写/提交 */
const hasSubmitted = computed(() => myApplication.value?.status === 'submitted')
const hasArchived = computed(() => myApplication.value?.status === 'archived')

/** 非可编辑终态：submitted/archived/exited/adjustment_overdue/identity_anomaly/not_qualified/accepted 隐藏表单 */
const EDITABLE_STATUSES = new Set(['draft', 'revision_requested'])
const isTerminal = computed(() => {
  if (!myApplication.value) return false
  return !EDITABLE_STATUSES.has(myApplication.value.status)
})
const showApplyForm = computed(() => !isTerminal.value)

function statusLabel(status: string): string {
  return resolveStatusLabel(status)?.label || status
}

async function uploadFile(fieldId: string, file: File): Promise<void> {
  formFiles[fieldId] = { fileId: '', name: file.name, size: file.size, checking: true, error: false }
  const uploadForm = new FormData()
  uploadForm.append('file', file)
  uploadForm.append('purpose', 'application')
  try {
    const result = await post<{ fileId: string; status: string }>('/files/upload', uploadForm)
    if (result.kind === 'completed') {
      const data = result.data as { fileId: string; status?: string }
      if (data.status === 'failed') {
        formFiles[fieldId] = { fileId: '', name: file.name, size: file.size, checking: false, error: true }
        toast.error('文件安全检查未通过，请重新上传')
        return
      }
      formFiles[fieldId] = { fileId: data.fileId, name: file.name, size: file.size, checking: false, error: false }
      formData[fieldId] = data.fileId
    } else {
      formFiles[fieldId] = { fileId: '', name: file.name, size: file.size, checking: false, error: true }
      toast.error('文件上传失败，请重试')
    }
  } catch {
    formFiles[fieldId] = { fileId: '', name: file.name, size: file.size, checking: false, error: true }
    toast.error('文件上传失败，请重试')
  }
}

async function handleFileChange(e: Event, fieldId: string) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  await uploadFile(fieldId, file)
  input.value = ''
}

function getFieldDescriptionId(fieldId: string): string {
  return `field-${fieldId}-description`
}

function getFieldErrorId(fieldId: string): string {
  return `field-${fieldId}-error`
}

function getFieldDescribedBy(field: FormField): string | undefined {
  const ids = [
    field.description ? getFieldDescriptionId(field.id) : undefined,
    formErrors.value[field.id] ? getFieldErrorId(field.id) : undefined,
  ].filter((id): id is string => Boolean(id))
  return ids.length > 0 ? ids.join(' ') : undefined
}

async function loadData() {
  state.value = 'loading'
  const id = route.params.activityId as string
  const [actRes, formRes] = await Promise.all([
    get<ActivityDetail>(`/explore/activities/${id}`),
    get<{ versions: { fields: FormField[] }[] }>(`/explore/activities/${id}/form`),
  ])
  if (actRes.kind === 'completed' && formRes.kind === 'completed') {
    activity.value = actRes.data
    const versions = (formRes as { kind: 'completed'; data: { versions: { fields: FormField[] }[] } }).data.versions
    formFields.value = versions[0]?.fields || []
    await loadMyApplication()
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

interface MyApplication {
  status: string
  answers?: Record<string, unknown>
  preferences?: { departmentId: string; departmentName: string }[]
}

/** 加载已有申请记录，恢复草稿或展示已提交/已归档状态 */
async function loadMyApplication() {
  try {
    const result = await get<MyApplication>(`/activity/recruitment/${route.params.activityId}/apply`)
    if (result.kind === 'completed') {
      myApplication.value = result.data
      if (result.data.status === 'draft') {
        restoreDraft(result.data)
      }
    }
  } catch {
    // 忽略：草稿恢复失败不影响表单填写
  }
}

function restoreDraft(app: MyApplication) {
  if (app.answers) {
    for (const [fieldId, value] of Object.entries(app.answers)) {
      if (typeof value !== 'string') continue
      formData[fieldId] = value
      const field = formFields.value.find((f) => f.id === fieldId)
      if (field?.type === 'file' && value) {
        formFiles[fieldId] = { fileId: value, name: '已上传附件', size: 0, checking: false, error: false }
      }
    }
  }
  if (app.preferences) {
    preferences.value = app.preferences.map((p) => ({ departmentId: p.departmentId, departmentName: p.departmentName }))
  }
}

function addPreference(deptId: string, deptName: string) {
  if (!preferences.value.find((p) => p.departmentId === deptId)) {
    preferences.value.push({ departmentId: deptId, departmentName: deptName })
  }
}

function removePreference(index: number) {
  preferences.value.splice(index, 1)
}

watch([formData, preferences], () => {
  savedDraft.value = false
}, { deep: true })

function movePreference(index: number, direction: 'up' | 'down') {
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= preferences.value.length) return
  const temp = preferences.value[index]
  preferences.value[index] = preferences.value[target]
  preferences.value[target] = temp
}

async function handleSaveDraft() {
  if (!showApplyForm.value) return
  savingDraft.value = true
  const result = await post(`/activity/recruitment/${route.params.activityId}/draft`, {
    formAnswers: formData,
  })
  savingDraft.value = false
  if (result.kind === 'completed') {
    const savedAt = (result.data as { savedAt?: string }).savedAt
    savedDraft.value = true
    toast.success(savedAt ? `草稿已保存，保存时间 ${new Date(savedAt).toLocaleString()}` : '草稿已保存')
  } else {
    toast.error('草稿保存失败，请稍后重试')
  }
}

async function handleSubmit() {
  if (!showApplyForm.value) return
  formErrors.value = {}
  submitError.value = null

  for (const field of formFields.value) {
    if (field.required && !formData[field.id]) {
      formErrors.value[field.id] = `${field.label}为必填项`
    }
    if (field.type === 'file') {
      const f = formFiles[field.id]
      if (f?.checking) {
        formErrors.value[field.id] = '文件安全检查中，请稍候再提交'
      } else if (f?.error) {
        formErrors.value[field.id] = '文件上传失败，请重新上传'
      }
    }
  }
  if (preferences.value.length === 0) {
    submitError.value = '请至少选择一个意向方向'
    return
  }
  if (Object.keys(formErrors.value).length > 0) return

  submitting.value = true
  const result = await post('/activity/recruitment/' + route.params.activityId + '/apply', {
    formData,
    preferences: preferences.value,
  })
  submitting.value = false

  if (result.kind === 'completed') {
    router.push('/me/ongoing')
  } else if (result.kind === 'rejected') {
    submitError.value = result.error.message
  } else {
    submitError.value = '提交失败，请稍后重试'
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="报名申请" @retry="loadData">
    <div v-if="activity" class="max-w-2xl mx-auto">
      <button class="flex items-center gap-1 text-sm text-text-secondary hover:text-primary mb-4" @click="router.back()">
        <ArrowLeft :size="16" /> 返回
      </button>

      <h1 class="text-2xl font-bold text-text-primary mb-1">{{ activity.title }}</h1>
      <p class="text-sm text-text-secondary mb-6">{{ activity.clubName }} · 报名申请</p>

      <!-- 已提交态 -->
      <Card v-if="hasSubmitted" class="mb-4">
        <div class="flex items-center gap-2 text-success">
          <CheckCircle2 :size="18" />
          <p class="text-sm font-medium text-text-primary">您已提交报名申请</p>
        </div>
        <p class="text-xs text-text-secondary mt-1">当前状态：{{ statusLabel(myApplication?.status ?? '') }}</p>
      </Card>

      <!-- 已归档态 -->
      <Card v-else-if="hasArchived" class="mb-4">
        <div class="flex items-center gap-2 text-text-secondary">
          <CheckCircle2 :size="18" />
          <p class="text-sm font-medium text-text-primary">您的报名申请已归档</p>
        </div>
        <p class="text-xs text-text-secondary mt-1">当前状态：{{ statusLabel(myApplication?.status ?? '') }}</p>
      </Card>

      <!-- 其他终态（exited / adjustment_overdue / identity_anomaly / not_qualified / accepted） -->
      <Card v-else-if="isTerminal" class="mb-4">
        <div class="flex items-center gap-2 text-text-secondary">
          <AlertTriangle :size="18" />
          <p class="text-sm font-medium text-text-primary">当前申请状态：{{ statusLabel(myApplication?.status ?? '') }}</p>
        </div>
        <p class="text-xs text-text-secondary mt-1">该状态下不可编辑或提交报名</p>
      </Card>

      <!-- 需修订态：展示提示卡片，保留表单可编辑 -->
      <div v-else-if="myApplication?.status === 'revision_requested'" class="rounded-lg bg-warning-subtle p-3 mb-4">
        <p class="text-sm text-warning font-medium">您的报名需补充或修订材料（状态：{{ statusLabel(myApplication.status) }}），请修改后重新提交</p>
        <p class="text-xs text-text-secondary mt-1">补充材料后请重新提交，超时可能导致报名失效</p>
      </div>

      <!-- 草稿提示 -->
      <div v-else-if="myApplication?.status === 'draft'" class="rounded-lg bg-warning-subtle p-3 mb-4">
        <p class="text-sm text-warning font-medium">您有已保存的草稿（状态：草稿），可继续修改后提交</p>
        <p class="text-xs text-text-secondary mt-1">暂存草稿会覆盖此前保存的内容</p>
      </div>

      <template v-if="showApplyForm">

      <!-- 意向方向排序 -->
      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-2">意向方向</h2>
        <p class="text-xs text-text-secondary mb-3">点击添加意向部门，可拖拽或用按钮调整优先级顺序</p>

        <div v-if="preferences.length > 0" class="space-y-2 mb-3">
          <div
            v-for="(pref, index) in preferences"
            :key="pref.departmentId"
            class="flex items-center gap-2 rounded-lg border border-border p-3"
          >
            <span class="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-text-on-primary text-xs font-bold">{{ index + 1 }}</span>
            <span class="flex-1 text-sm text-text-primary">{{ pref.departmentName }}</span>
            <div class="flex items-center gap-1">
              <button class="p-1 rounded hover:bg-subtle text-text-secondary" :disabled="index === 0" aria-label="上移" @click="movePreference(index, 'up')">
                <ChevronUp :size="14" />
              </button>
              <button class="p-1 rounded hover:bg-subtle text-text-secondary" :disabled="index === preferences.length - 1" aria-label="下移" @click="movePreference(index, 'down')">
                <ChevronDown :size="14" />
              </button>
              <button class="p-1 rounded hover:bg-subtle text-danger" aria-label="移除" @click="removePreference(index)">
                <X :size="14" />
              </button>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="dept in activity.departments"
            :key="dept.id"
            v-show="!preferences.find((p) => p.departmentId === dept.id)"
            class="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-sm text-text-secondary hover:border-primary hover:text-primary transition-colors"
            @click="addPreference(dept.id, dept.name)"
          >
            <Plus :size="14" /> {{ dept.name }}
          </button>
        </div>
      </Card>

      <!-- 动态表单 -->
      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-4">报名表单</h2>
        <div class="space-y-4">
          <div v-for="field in formFields" :key="field.id">
            <label :for="field.id" class="block text-sm font-medium text-text-primary mb-1">
              {{ field.label }}
              <span v-if="field.required" class="text-danger">*</span>
            </label>
            <p v-if="field.description" :id="getFieldDescriptionId(field.id)" class="text-xs text-text-secondary mb-1.5">
              {{ field.description }}
            </p>

            <input
              v-if="field.type === 'text'"
              :id="field.id"
              :value="formData[field.id] || ''"
              type="text"
              class="w-full h-10 px-3 rounded-md border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
              :class="formErrors[field.id] ? 'border-danger' : 'border-border'"
              :aria-invalid="Boolean(formErrors[field.id])"
              :aria-describedby="getFieldDescribedBy(field)"
              @input="formData[field.id] = ($event.target as HTMLInputElement).value"
            />

            <textarea
              v-else-if="field.type === 'textarea'"
              :id="field.id"
              :value="formData[field.id] || ''"
              rows="4"
              class="w-full px-3 py-2 rounded-md border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
              :class="formErrors[field.id] ? 'border-danger' : 'border-border'"
              :aria-invalid="Boolean(formErrors[field.id])"
              :aria-describedby="getFieldDescribedBy(field)"
              @input="formData[field.id] = ($event.target as HTMLTextAreaElement).value"
            />

            <select
              v-else-if="field.type === 'select'"
              :id="field.id"
              :value="formData[field.id] || ''"
              class="w-full h-10 px-3 rounded-md border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
              :class="formErrors[field.id] ? 'border-danger' : 'border-border'"
              :aria-invalid="Boolean(formErrors[field.id])"
              :aria-describedby="getFieldDescribedBy(field)"
              @change="formData[field.id] = ($event.target as HTMLSelectElement).value"
            >
              <option value="">请选择</option>
              <option v-for="opt in field.options" :key="opt" :value="opt">{{ opt }}</option>
            </select>

            <div
              v-else-if="field.type === 'file'"
              :id="field.id"
              :class="[formErrors[field.id] || formFiles[field.id]?.error ? 'border-danger' : 'border-border']"
              class="w-full rounded-md border border-dashed flex flex-col items-center justify-center gap-1 text-text-secondary hover:border-primary hover:text-primary transition-colors"
              :aria-invalid="Boolean(formErrors[field.id])"
              :aria-describedby="getFieldDescribedBy(field)"
            >
              <template v-if="formFiles[field.id]">
                <div class="flex items-center gap-2 p-3">
                  <FileWarning v-if="formFiles[field.id]!.checking" :size="16" class="text-warning" />
                  <Upload v-else-if="!formFiles[field.id]!.error" :size="16" class="text-success" />
                  <FileWarning v-else :size="16" class="text-danger" />
                  <span class="text-xs text-text-primary">{{ formFiles[field.id]!.name }}</span>
                  <span v-if="formFiles[field.id]!.size > 0" class="text-xs text-text-secondary">({{ (formFiles[field.id]!.size / 1024).toFixed(1) }} KB)</span>
                  <span v-if="formFiles[field.id]!.checking" class="text-xs text-warning">检查中...</span>
                  <span v-else-if="formFiles[field.id]!.error" class="text-xs text-danger">上传失败</span>
                  <span v-else class="text-xs text-success">已上传</span>
                  <button type="button" class="text-xs text-danger hover:underline" :disabled="formFiles[field.id]!.checking" @click="formFiles[field.id] = null; formData[field.id] = ''">移除</button>
                </div>
              </template>
              <label v-else class="flex flex-col items-center justify-center gap-1 py-6 cursor-pointer w-full h-full">
                <Upload :size="20" />
                <span class="text-xs">点击上传文件</span>
                <input
                  type="file"
                  class="hidden"
                  :aria-label="`上传${field.label}`"
                  @change="(e) => handleFileChange(e as Event, field.id)"
                />
              </label>
            </div>

            <p v-if="formErrors[field.id]" :id="getFieldErrorId(field.id)" class="mt-1 text-xs text-danger" role="alert">
              {{ formErrors[field.id] }}
            </p>
          </div>
        </div>
      </Card>

      <!-- 错误提示 -->
      <p v-if="submitError" class="text-sm text-danger mb-4" role="alert">{{ submitError }}</p>
      <p v-if="savedDraft" class="text-sm text-success mb-4" role="status">草稿已保存</p>

      <!-- 操作区 -->
      <ResponsiveActionRegion page-family="form">
        <Button variant="outline" :loading="savingDraft" @click="handleSaveDraft">
          <Save :size="16" /> {{ savingDraft ? '保存中...' : '保存草稿' }}
        </Button>
        <Button class="flex-1 md:flex-none" :loading="submitting" @click="handleSubmit">
          <Send :size="16" /> {{ submitting ? '提交中...' : '提交报名' }}
        </Button>
      </ResponsiveActionRegion>
      </template>
    </div>
  </PageStateBoundary>
</template>
