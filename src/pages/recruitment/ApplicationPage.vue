<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card, Button, ResponsiveActionRegion } from '@/components/common'
import { PreferenceSorter, type PreferenceEntry } from '@/components/form'
import { ObjectPicker, type PickerGroup } from '@/components/form'
import { AttachmentUpload } from '@/components/form'
import type { FileMeta } from '@/types/domain/form'
import { get, post } from '@/services/client'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { ArrowLeft, Save, Send } from '@lucide/vue'

interface ActivityDetail { id: string; title: string; clubName: string; deadline: string; departments: { id: string; name: string }[]; formId: string }
interface FormField { id: string; type: string; label: string; description: string | null; required: boolean; readonly: boolean; permission: string; options: string[] | null }

const route = useRoute()
const router = useRouter()

const state = ref<PageState>('loading')
const activity = ref<ActivityDetail | null>(null)
const formFields = ref<FormField[]>([])

const formData = reactive<Record<string, string>>({})
const formErrors = ref<Record<string, string>>({})
const fileValues = ref<Record<string, FileMeta[]>>({})
const preferences = ref<{ departmentId: string; departmentName: string }[]>([])
const submitting = ref(false)
const submitError = ref<string | null>(null)
const savedDraft = ref(false)
const savingDraft = ref(false)

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
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

function addPreference(deptId: string, deptName: string) {
  if (!preferences.value.find((p) => p.departmentId === deptId)) {
    preferences.value.push({ departmentId: deptId, departmentName: deptName })
  }
}

const preferenceEntries = computed<PreferenceEntry[]>(() =>
  preferences.value.map((p) => ({ id: p.departmentId, label: p.departmentName })),
)

const deptGroups = computed<PickerGroup[]>(() =>
  activity.value
    ? [{
        type: 'department' as const,
        label: '可选部门',
        items: activity.value.departments.map((d) => ({ id: d.id, label: d.name })),
      }]
    : [],
)

const selectedDeptIds = computed<string[]>(() => preferences.value.map((p) => p.departmentId))

function onPreferenceChange(entries: PreferenceEntry[]) {
  preferences.value = entries.map((e) => ({
    departmentId: e.id,
    departmentName: activity.value?.departments.find((d) => d.id === e.id)?.name || e.label,
  }))
}

function onDeptPick(ids: string[]) {
  const newlyAdded = ids.filter((id) => !preferences.value.find((p) => p.departmentId === id))
  for (const id of newlyAdded) {
    const dept = activity.value?.departments.find((d) => d.id === id)
    if (dept) addPreference(dept.id, dept.name)
  }
}

async function handleSaveDraft() {
  savingDraft.value = true
  const result = await post(`/activity/recruitment/${route.params.activityId}/draft`, {
    formAnswers: formData,
  })
  savingDraft.value = false
  if (result.kind === 'completed') {
    const savedAt = (result.data as { savedAt?: string }).savedAt
    savedDraft.value = true
    setTimeout(() => { savedDraft.value = false }, 2000)
    toast.success(savedAt ? `草稿已保存，保存时间 ${new Date(savedAt).toLocaleString()}` : '草稿已保存')
  } else {
    toast.error('草稿保存失败，请稍后重试')
  }
}

async function handleSubmit() {
  formErrors.value = {}
  submitError.value = null

  for (const field of formFields.value) {
    const hasFile = field.type === 'file' ? (fileValues.value[field.id]?.length ?? 0) > 0 : false
    if (field.required && !formData[field.id] && !hasFile) {
      formErrors.value[field.id] = `${field.label}为必填项`
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
    files: fileValues.value,
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

      <!-- 意向方向排序 -->
      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-2">意向方向</h2>
        <p class="text-xs text-text-secondary mb-3">从下方选择意向部门后，可拖动或按键调整优先级顺序</p>

        <ObjectPicker
          :groups="deptGroups"
          :model-value="selectedDeptIds"
          @update:model-value="onDeptPick"
        />

        <PreferenceSorter :model-value="preferenceEntries" class="mt-3" @update:model-value="onPreferenceChange" />
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

            <AttachmentUpload
              v-else-if="field.type === 'file'"
              :id="field.id"
              v-model="fileValues[field.id]"
              :aria-invalid="Boolean(formErrors[field.id])"
              :aria-describedby="getFieldDescribedBy(field)"
            />

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
    </div>
  </PageStateBoundary>
</template>
